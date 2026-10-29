import {
	createPerson,
	DEFAULT_NORMS,
	ENGINE_VERSION,
	projectCalendarPersona,
	snapshot,
} from "@adam0white/human-framework";
import {
	acceptPersona,
	acceptPersonaBatch,
	canonicalCast,
	canonicalPersona,
	claimCastChapterBatch,
	createPersona,
	initialPersonaLife,
	type PersonaShelfState,
	preparePersonaLife,
} from "@adam0white/lab-client";
import { describe, expect, it } from "vitest";
import { ALLOCATION, HOST_CAST } from "../src/core/canonical-cast.ts";
import { prepareTownCast } from "../src/core/cast-continuity.ts";
import { createRuntime, restoreRuntime } from "../src/core/index.ts";
import type { Save } from "../src/core/state.ts";
import { createRuntime as historicalTown } from "./historical-runtime.ts";

async function source(
	castId = "hf.cast.ece.murmur",
	role = "ece",
	workshop = false,
	sourceEngine = "2.17.0",
) {
	const c = canonicalCast(castId),
		p = createPerson({
			id: role,
			name: c.name,
			seed: 9,
			now: 720,
			bornAt: -c.age * 525600,
			sex: "female",
			traits: c.traits,
			values: c.values,
		});
	p.body.fitness = 0.53;
	const passport = projectCalendarPersona(p, {
		version: workshop ? "workshop-calendar/1" : "hearsay-calendar/1",
		skills: {},
		calendar: {
			version: "hf-persona-calendar-map/1",
			offset: 0,
			sourceNorms: DEFAULT_NORMS,
			references: {
				commitments: {},
				chains: {},
				actions: {},
				entities: {},
				norms: Object.fromEntries(DEFAULT_NORMS.map((n) => [n.id, n.id])),
			},
		},
	});
	const digest = [
		...new Uint8Array(
			await crypto.subtle.digest(
				"SHA-256",
				new TextEncoder().encode(canonicalPersona(snapshot(p))),
			),
		),
	]
		.map((n) => n.toString(16).padStart(2, "0"))
		.join("");
	const branchId = `test-${role}-branch`;
	const envelope = await createPersona({
		format: "hf-persona/1",
		castId,
		castRevision: c.revision,
		branchId,
		parentRevision: null,
		source: {
			game: workshop ? "repair" : "hearsay",
			build: "test",
			engine: sourceEngine,
			rules: workshop ? "canonical-workshop-2" : "hearsay-cast-6",
		},
		transfer: {
			castPassport: workshop ? "workshop-cast/1" : "hearsay-cast/1",
			sourceRole: role,
			person: passport,
			checkpoint: {
				schema: p.schema,
				sourceMinute: p.now,
				rng: p.rng,
				sha256: digest,
			},
			life: initialPersonaLife(castId, branchId, 3600000),
		},
		limitations: [],
	});
	return { p, envelope, input: preparePersonaLife(envelope, 3600000) };
}
describe("current canonical town", () => {
	it("has six exact public profiles,200 background residents and no invented familiarity", () => {
		const s = createRuntime().export() as Save;
		expect(s.people).toHaveLength(206);
		expect(createRuntime().view().stats.background).toBe(200);
		expect(s.people.filter((r) => r.known)).toHaveLength(6);
		expect(s.people.some((r) => ["Lea", "Musa"].includes(r.person.name))).toBe(
			false,
		);
		for (const r of s.people.filter((r) => r.known)) {
			const c = canonicalCast(HOST_CAST[r.person.id as keyof typeof HOST_CAST]);
			expect(r.person.traits).toEqual(c.traits);
			expect(r.person.values).toEqual(c.values);
			expect(r.person.name).toBe(c.name);
			expect(r.person.life.bornAt).toBe(-c.age * 525600);
			expect(r.person.social.relationships).toEqual([]);
		}
		expect(restoreRuntime(s).export()).toEqual(s);
		const before = historicalTown().export() as Save;
		const profile = (r: Save["people"][number]) => ({
			name: r.person.name,
			life: r.person.life,
			rng: r.person.rng,
			traits: r.person.traits,
			values: r.person.values,
			role: r.role,
			wealth: r.wealth,
		});
		expect(s.people.filter((r) => !r.known).map(profile)).toEqual(
			before.people.filter((r) => !r.known).map(profile),
		);
	});
	it("admits the finite native SmallWorks Nora map alongside Ece without erasing work duties", async () => {
		const nora = await source("hf.cast.nora.smallworks", "nora", true);
		const ece = await source();
		const initial = prepareTownCast(42, 206, [nora.input, ece.input]);
		const person = initial.people.find((r) => r.person.id === "ada")?.person;
		expect(person?.rng).toEqual(nora.p.rng);
		expect(person?.body.fitness).toBe(nora.p.body.fitness);
		expect(person?.life.bornAt).toBe(nora.p.life.bornAt + 480 - nora.p.now);
		const duty = structuredClone(nora.input);
		const calendar = duty.parent.transfer.person as {
			calendar: { commitments: unknown[] };
		};
		calendar.calendar.commitments.push({
			id: "active-design",
			from: 720,
			until: 900,
			actions: ["personal"],
			kind: "promise",
			importance: 0.8,
			status: "pending",
			toId: "self",
		});
		expect(() => prepareTownCast(42, 206, [duty, ece.input])).toThrow(
			/source work or care duty has no town adapter/,
		);
		const wrong = structuredClone(nora.input);
		wrong.parent.source.rules = "canonical-workshop-1";
		expect(() => prepareTownCast(42, 206, [wrong])).toThrow(/adapter/);
	});
	it("carries actual Hearsay Ece state and pinned life into deterministic continuation", async () => {
		const { p, input } = await source();
		const prepared = prepareTownCast(42, 206, [input]);
		const ece = prepared.people.find((r) => r.person.id === "noor");
		if (!ece) throw Error("Missing Ece fixture");
		expect(ece.person.body.fitness).toBe(p.body.fitness);
		expect(ece.person.rng).toEqual(p.rng);
		expect(ece.person.traits).toEqual(p.traits);
		expect(p.now - p.life.bornAt).toBe(ece.person.now - ece.person.life.bornAt);
		const a = restoreRuntime(prepared),
			b = restoreRuntime(prepared);
		a.step();
		b.step();
		expect(a.export()).toEqual(b.export());
		const advanced = prepareTownCast(42, 206, [
			preparePersonaLife(input.parent, 3600000 * 100),
		]);
		expect(
			advanced.people.find((r) => r.person.id === "noor")?.description,
		).not.toBe(ece.description);
		expect(prepareTownCast(42, 206, [input])).toEqual(prepared);
	});
	it("uses the released helper for a successful atomic claim and admits its exact receiver wrapper", async () => {
		const a = await source(),
			b = await source("hf.cast.derya.stairwell", "derya");
		let state: PersonaShelfState = { heads: {}, revisions: [] };
		state = acceptPersona(state, a.envelope);
		state = acceptPersona(state, b.envelope);
		const shelf = {
			request: async <T>(
				q: import("@adam0white/lab-client").PersonaRequest,
			): Promise<T> => {
				if (q.action === "prepareBatch")
					return {
						expectedHeads: Object.fromEntries(
							ALLOCATION.map((c) => [c.castId, state.heads[c.castId] ?? null]),
						),
						inputs: [a.input, b.input],
						blocked: [],
					} as T;
				if (q.action === "putBatch") {
					state = acceptPersonaBatch(state, q.envelopes ?? [], q.expectedHeads);
					return {} as T;
				}
				throw Error("Unexpected request");
			},
		};
		const chapter = await claimCastChapterBatch(
			shelf,
			ALLOCATION.map((c) => c.castId),
			{
				game: "neighbours",
				build: "test",
				engine: "2.17.0",
				rules: "neighbours-cast-1",
			},
			async (inputs) => prepareTownCast(42, 206, inputs),
		);
		expect(chapter?.claims).toHaveLength(2);
		if (!chapter) throw Error("Missing successful batch");
		const next = prepareTownCast(
			42,
			206,
			chapter.claims.map((h) => preparePersonaLife(h, 3600000)),
		);
		expect(
			next.people.find((r) => r.person.id === "noor")?.person.body.fitness,
		).toBe(a.p.body.fitness);
		expect(next.people.find((r) => r.person.id === "elin")?.person.rng).toEqual(
			b.p.rng,
		);
		expect(() =>
			acceptPersonaBatch(
				state,
				chapter.claims,
				Object.fromEntries(
					ALLOCATION.map((c) => [
						c.castId,
						c.castId === a.envelope.castId ? a.envelope.revision : null,
					]),
				),
			),
		).toThrow();
	});
	it("refuses a mismatched source before an atomic batch writes anybody", async () => {
		const valid = await source(),
			invalid = await source("hf.cast.derya.stairwell", "derya");
		invalid.input.parent.transfer.sourceRole = "ece";
		const calls: string[] = [];
		const shelf = {
			request: async <T>(q: { action: string }) => {
				calls.push(q.action);
				return {
					expectedHeads: Object.fromEntries(
						ALLOCATION.map((c) => [c.castId, null]),
					),
					inputs: [valid.input, invalid.input],
					blocked: [],
				} as T;
			},
		};
		await expect(
			claimCastChapterBatch(
				shelf,
				ALLOCATION.map((c) => c.castId),
				{
					game: "neighbours",
					build: "test",
					engine: "2.17.0",
					rules: "neighbours-cast-1",
				},
				async (inputs) => prepareTownCast(42, 206, inputs),
			),
		).rejects.toThrow(/adapter/);
		expect(calls).toEqual(["prepareBatch"]);
	});
	it("does not grant private biography knowledge at construction or at a distance", () => {
		const r = createRuntime(42, 6);
		const before = r.export() as Save;
		expect(
			before.people.every(
				(r) =>
					!r.person.memory.episodes.some(
						(e) => e.kind === "private-conversation",
					),
			),
		).toBe(true);
		expect(() =>
			r.intervene({ kind: "player-private", actorId: "ada" }),
		).toThrow(/not here/);
		expect(r.export()).toEqual(before);
		r.intervene({ kind: "player-private", actorId: "noor" });
		const after = r.export() as Save;
		expect(after.player?.log.at(-1)?.text).toMatch(/map|private/);
		expect(restoreRuntime(after).export()).toEqual(after);
	});
});

it("admits the registered HF 2.23 source map, keeps RNG, and replays an exact current export", async () => {
	const { p, input } = await source(
		"hf.cast.ece.murmur",
		"ece",
		false,
		ENGINE_VERSION,
	);
	const prepared = prepareTownCast(73, 6, [input]);
	expect(
		prepared.people.find((r) => r.person.id === "noor")?.person.rng,
	).toEqual(p.rng);
	const a = restoreRuntime(prepared);
	for (let i = 0; i < 8; i++) a.step();
	const b = restoreRuntime(JSON.parse(JSON.stringify(a.export())));
	for (let i = 0; i < 16; i++) {
		a.step();
		b.step();
		expect(JSON.stringify(b.export())).toBe(JSON.stringify(a.export()));
	}
	for (const engine of ["2.22.0", "9.0.0"]) {
		const bad = structuredClone(input);
		bad.parent.source.engine = engine;
		expect(() => prepareTownCast(73, 6, [bad])).toThrow(/adapter/);
	}
	const bad = structuredClone(input);
	bad.parent.source.rules = "hearsay-cast-unknown";
	expect(() => prepareTownCast(73, 6, [bad])).toThrow(/adapter/);
});
