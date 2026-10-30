import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import {
	ENGINE_VERSION,
	FRAMEWORK_VERSION,
	snapshot,
} from "@adam0white/human-framework";
import {
	createPersona,
	type LifePreparation,
	type PersonaEnvelope,
} from "@adam0white/lab-client";
import { expect, it } from "vitest";
import {
	CAST_EDITION,
	HOST_CAST,
	roleFor,
} from "../src/core/canonical-cast.ts";
import { prepareTownCast } from "../src/core/cast-continuity.ts";
import { createRuntime, restoreRuntime } from "../src/core/index.ts";
import type { Save } from "../src/core/state.ts";
import { refusalWhy, voicedLine } from "../src/core/voicing.ts";

it("pins released HF and persists plain narration for every fresh resident", () => {
	expect(FRAMEWORK_VERSION).toBe("3.0.0");
	expect(ENGINE_VERSION).toBe("2.23.0");
	const save = createRuntime(42, 206).export() as Save;
	expect(save.hf).toBe("3.0.0");
	for (const { person } of save.people) {
		expect(person.engine).toBe(ENGINE_VERSION);
		expect(person.lexicon?.plainEnglish).toBe(true);
	}
});

it("preserves a loaded narration choice and exactly replays current exports", () => {
	for (const plainEnglish of [true, false, undefined]) {
		const save = createRuntime(73, 6).export() as Save;
		for (const { person } of save.people) {
			if (plainEnglish === undefined) delete person.lexicon;
			else person.lexicon = { ...person.lexicon, plainEnglish };
		}
		const a = restoreRuntime(JSON.parse(JSON.stringify(save)));
		expect(a.export()).toEqual(save);
		for (let n = 0; n < 8; n++) a.step();
		const b = restoreRuntime(JSON.parse(JSON.stringify(a.export())));
		for (let n = 0; n < 16; n++) {
			a.step();
			b.step();
			expect(JSON.stringify(b.export())).toBe(JSON.stringify(a.export()));
		}
	}
});

it("keeps released complete replies and only omits duplicate refusal glosses", () => {
	const says = "I will do this instead: rest.";
	expect(
		voicedLine({ verdict: "modified", says, counterOffer: { label: "Rest" } }),
	).toBe(says);
	expect(
		refusalWhy({
			verdict: "refused",
			reason: "need:sleep",
			says: "I have to sleep first.",
		}),
	).toBeUndefined();
	expect(
		refusalWhy({
			verdict: "refused",
			reason: "need:sleep",
			says: "Not now. I can't.",
		}),
	).toBe("This person refused because sleep comes first.");
});

it("retains the future promise in a released deferred answer with a host action label", () => {
	expect(
		voicedLine({
			verdict: "deferred",
			says: "After I Take a tea break, I will do it.",
			counterOffer: { label: "after I Take a tea break" },
		}),
	).toBe("I need a tea break first. Then I will do it.");
});

function nativeFixture(kind: "repair" | "murmur" | "hearsay") {
	const bytes = readFileSync(
		new URL(
			`./fixtures/${kind}-hf221-native.json${kind === "hearsay" ? ".gz" : ""}`,
			import.meta.url,
		),
	);
	return JSON.parse(
		(kind === "hearsay" ? gunzipSync(bytes) : bytes).toString("utf8"),
	) as {
		input: LifePreparation;
		envelope: PersonaEnvelope;
		raw: Save["people"][number]["person"];
		provenance: {
			sourceCommit: string;
			publishedHF: string;
			syntheticEnvelope: boolean;
		};
	};
}
it("admits an actual current Hearsay projection and replays its pinned chapter", async () => {
	const fixture = nativeFixture("hearsay");
	expect(fixture.provenance.sourceCommit).toBe(
		"834541aa168bc8fe5d3f3355265c3661e0afdd59",
	);
	expect(fixture.provenance.syntheticEnvelope).toBe(true);
	expect(fixture.raw.engine).toBe("2.21.0");
	expect(fixture.envelope.source.engine).toBe("2.21.0");
	const original = JSON.stringify(fixture);
	const save = prepareTownCast(42, 6, [fixture.input]);
	const admitted = save.people.find(
		(r) => r.person.id === roleFor(fixture.envelope.castId),
	);
	expect(admitted?.person.rng).toEqual(fixture.raw.rng);
	expect(admitted?.person.lexicon?.plainEnglish).toBe(true);
	const { revision, ...source } = fixture.envelope;
	const claim = await createPersona({
		...source,
		parentRevision: revision,
		source: {
			...source.source,
			game: "neighbours",
			rules: "neighbours-cast-1",
		},
	});
	save.chapter = {
		edition: CAST_EDITION,
		inputs: [fixture.input],
		claims: [claim],
		initial: Object.fromEntries(
			save.people
				.filter((r) => r.known)
				.map((r) => [
					HOST_CAST[r.person.id as keyof typeof HOST_CAST],
					snapshot(r.person),
				]),
		),
		mapping: "neighbours-calendar/1",
	};
	const a = restoreRuntime(save);
	for (let i = 0; i < 8; i++) a.step();
	const b = restoreRuntime(JSON.parse(JSON.stringify(a.export())));
	for (let i = 0; i < 16; i++) {
		a.step();
		b.step();
		expect(JSON.stringify(b.export())).toBe(JSON.stringify(a.export()));
	}
	expect(JSON.stringify(fixture)).toBe(original);
	for (const invalid of ["2.20.0", "9.0.0"]) {
		const input = structuredClone(fixture.input);
		input.parent.source.engine = invalid;
		expect(() => prepareTownCast(42, 6, [input])).toThrow(/adapter/);
	}
});
it("refuses a real current Murmur projection because its calendar map is not registered", () => {
	const fixture = nativeFixture("murmur");
	expect(fixture.raw.engine).toBe("2.21.0");
	expect(fixture.envelope.transfer.castPassport).toBe("murmur-cast/1");
	expect(() => prepareTownCast(42, 6, [fixture.input])).toThrow(/adapter/);
});

it("shows the released deferred task sentence without the old clipped-label gloss", () => {
	const says =
		"I cannot do it now. After I finish this task (Keep this section closed), I will do it.";
	expect(
		voicedLine({
			verdict: "deferred",
			says,
			counterOffer: {
				label: "after I finish this task (Keep this section closed)",
			},
		}),
	).toBe(says);
});

it("keeps the actual Small Works Nora work duty and refuses to translate it", () => {
	const fixture = nativeFixture("repair");
	const before = JSON.stringify(fixture);
	expect(fixture.raw.engine).toBe("2.21.0");
	expect(() => prepareTownCast(42, 6, [fixture.input])).toThrow(
		/source work or care duty has no town adapter/,
	);
	expect(JSON.stringify(fixture)).toBe(before);
});

it("preserves a real pre-upgrade HF2.21 town with decision evidence and exact continuation", () => {
	const saved = JSON.parse(
		gunzipSync(
			readFileSync(
				new URL(
					"./fixtures/neighbours-hf221-before-v3.json.gz",
					import.meta.url,
				),
			),
		).toString("utf8"),
	);
	expect(saved.hf).toBe("2.21.0");
	expect(
		saved.people.some(
			(r: Save["people"][number]) => r.decision?.source === "HF 2.21.0",
		),
	).toBe(true);
	// Compare physical outcomes and actor RNG against the pre-upgrade played fixture.
	const physical = (s: Save) => ({
		now: s.now,
		round: s.round,
		hall: s.hall,
		hallSafe: s.hallSafe,
		places: s.places,
		produced: s.produced,
		consumed: s.consumed,
		people: s.people.map((r) => ({
			id: r.person.id,
			rng: r.person.rng,
			wealth: r.wealth,
			place: r.place,
			job: r.job,
		})),
	});
	const current = createRuntime(73, 6);
	for (let i = 0; i < 16; i++) current.step();
	expect(physical(current.export() as Save)).toEqual(physical(saved));
	const a = restoreRuntime(structuredClone(saved));
	const expected = structuredClone(saved);
	expected.hf = FRAMEWORK_VERSION;
	for (const resident of expected.people)
		resident.person.engine = ENGINE_VERSION;
	expect(a.export()).toEqual(expected);
	expect(saved.hf).toBe("2.21.0");
	expect(
		saved.people.every(
			(r: Save["people"][number]) => r.person.engine === "2.21.0",
		),
	).toBe(true);
	const b = restoreRuntime(JSON.parse(JSON.stringify(a.export())));
	for (let i = 0; i < 16; i++) {
		a.step();
		b.step();
		expect(JSON.stringify(b.export())).toBe(JSON.stringify(a.export()));
	}
});
