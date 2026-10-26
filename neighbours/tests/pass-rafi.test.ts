import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import {
	type CalendarPersonaSnapshot,
	type Person,
	snapshot,
	validateCalendarPersona,
} from "@adam0white/human-framework";
import {
	acceptPersona,
	acceptPersonaBatch,
	canonicalPersona,
	claimCastChapterBatch,
	createPersona,
	type LifePreparation,
	type PersonaEnvelope,
	type PersonaShelfState,
	preparePersonaLife,
	validatePersona,
} from "@adam0white/lab-client";
import { expect, it } from "vitest";
import { RuntimePort } from "../src/bridge-port.ts";
import {
	CAST_EDITION,
	CAST_RULES,
	HOST_CAST,
} from "../src/core/canonical-cast.ts";
import type { Save } from "../src/core/state.ts";
import {
	prepareReceivingTownCast as prepareTownCast,
	ReceivingRuntimePort,
	restoreReceivingRuntime as restoreRuntime,
} from "../src/received-town.ts";

// Actual synthetic producer control from signed Pass453be903; never an owner save or shelf receipt.
const bytes = readFileSync(
	new URL("./fixtures/pass-rafi-453be903.json", import.meta.url),
);
const actual = JSON.parse(bytes.toString()) as {
	source: string;
	dirty: boolean;
	candidate: boolean;
	productionPublicationGuardPassed: boolean;
	raw: Person;
	run: { state: { minute: number; phase: string; releasedCast: string[] } };
	envelope: PersonaEnvelope;
};
function input() {
	const parent = structuredClone(actual.envelope);
	const life = parent.transfer.life as { clock: { watermark: number } };
	return preparePersonaLife(parent, life.clock.watermark);
}
function portable(i: LifePreparation): CalendarPersonaSnapshot {
	return i.parent.transfer.kitchenPerson as CalendarPersonaSnapshot;
}
const sha256 = (s: string | Buffer) =>
	createHash("sha256").update(s).digest("hex");

/** In-memory transport control of the released helper. This is never a browser ownership receipt. */
async function receivedChapter(): Promise<Save> {
	const actualInput = input();
	let shelf: PersonaShelfState = acceptPersona(
		{ heads: {}, revisions: [] },
		actualInput.parent,
	);
	const chapter = await claimCastChapterBatch(
		{
			request: async <T>(
				q: import("@adam0white/lab-client").PersonaRequest,
			): Promise<T> => {
				if (q.action === "prepareBatch")
					return {
						expectedHeads: {
							[actualInput.parent.castId]:
								shelf.heads[actualInput.parent.castId],
						},
						inputs: [actualInput],
						blocked: [],
					} as T;
				if (q.action === "putBatch") {
					shelf = acceptPersonaBatch(shelf, q.envelopes ?? [], q.expectedHeads);
					return {} as T;
				}
				throw Error("Unexpected source control transport");
			},
		},
		[actualInput.parent.castId],
		{
			game: "neighbours",
			build: "headless-control",
			engine: "2.23.0",
			rules: CAST_RULES,
		},
		async (inputs) => prepareTownCast(42, 206, inputs),
	);
	if (!chapter) throw Error("No receiving chapter");
	const save = chapter.initial;
	save.chapter = {
		edition: CAST_EDITION,
		inputs: chapter.inputs,
		claims: chapter.claims,
		mapping: "neighbours-calendar/1",
		initial: Object.fromEntries(
			save.people
				.filter((r) => r.known)
				.map((r) => [
					HOST_CAST[r.person.id as keyof typeof HOST_CAST],
					snapshot(r.person),
				]),
		),
	};
	return save;
}

it("admits the actual signed Pass13 Rafi without inventing kitchen work or town qualifications", async () => {
	expect(sha256(bytes)).toBe(
		"bab614c5f616ba028d5851c38f7ef7c257cca7fea222e0f62f682e4769a029c8",
	);
	expect(actual).toMatchObject({
		source: "453be90356e344bc90508ace10e066baf25519b9",
		dirty: false,
		candidate: false,
		productionPublicationGuardPassed: true,
	});
	await validatePersona(actual.envelope);
	const source = validateCalendarPersona(
		actual.envelope.transfer.kitchenPerson,
	);
	expect(actual.envelope.source).toEqual({
		game: "pass",
		build: actual.source,
		engine: "2.23.0",
		rules: "pass-13",
	});
	expect(actual.run.state).toMatchObject({ minute: 1390, phase: "evening" });
	expect(actual.run.state.releasedCast).toContain("rafi");
	expect(sha256(canonicalPersona(actual.raw))).toBe(
		"f8ab39530609e3f47f8c79343a3c088b6074a17434a7a34059352f83a35d1ab8",
	);
	expect(actual.envelope.transfer.checkpoint).toEqual({
		sourceSchema: actual.raw.schema,
		sourceNow: actual.raw.now,
		sourceRng: actual.raw.rng,
		checkpointDigest: sha256(canonicalPersona(actual.raw)),
	});
	const original = canonicalPersona(actual);
	const save = await receivedChapter();
	const rafi = save.people.find((r) => r.person.id === "ravi")?.person;
	if (!rafi) throw Error("Rafi missing from admitted town");
	expect(rafi.rng).toEqual(actual.raw.rng);
	expect(rafi.traits).toEqual(actual.raw.traits);
	expect(rafi.values).toEqual(actual.raw.values);
	expect(rafi.body.fitness).toBe(actual.raw.body.fitness);
	expect(rafi.now - rafi.life.bornAt).toBe(
		actual.raw.now - actual.raw.life.bornAt,
	);
	expect(rafi.skills).toEqual({});
	expect(Object.keys(source.person.skills)).toEqual([
		"cold",
		"dish",
		"grill",
		"oven",
	]);
	expect(rafi.conscience.norms).toEqual(source.calendar.heldNorms);
	expect(rafi.memory.episodes.slice(0, source.person.episodes.length)).toEqual(
		source.person.episodes.map((e) => ({
			...e,
			actorId: e.actorId === "rafi" ? "ravi" : e.actorId,
			at: e.at + 480 - actual.raw.now,
		})),
	);
	const jar = source.calendar.commitments[0];
	if (!jar) throw Error("Source personal abstention missing");
	expect(rafi.agenda.commitments).toEqual([
		{
			...jar,
			from: jar.from + 480 - actual.raw.now,
			until: jar.until + 480 - actual.raw.now,
		},
	]);
	expect(rafi.agenda.commitments.some((c) => c.toId === "chef")).toBe(false);
	expect(canonicalPersona(actual)).toBe(original);
	const full = restoreRuntime(JSON.parse(JSON.stringify(save)));
	const compact = restoreRuntime(
		JSON.parse(gunzipSync(gzipSync(JSON.stringify(save))).toString()),
	);
	for (let n = 0; n < 16; n++) {
		full.step();
		compact.step();
		expect(JSON.stringify(compact.export())).toBe(
			JSON.stringify(full.export()),
		);
	}
	expect(snapshot(rafi).rng).toEqual(actual.raw.rng);
});

it("validates Pass chapter lineage and initial people before physical restore", async () => {
	const original = await receivedChapter();
	const wrongPerson = structuredClone(original);
	const initial = wrongPerson.chapter?.initial["hf.cast.rafi.pass"];
	if (!initial) throw Error("Missing pinned Rafi");
	initial.body.fitness = 0.1;
	expect(() => restoreRuntime(wrongPerson)).toThrow(/Pinned initial actor/);
	const wrongClaim = structuredClone(original);
	const claim = wrongClaim.chapter?.claims[0];
	if (!claim) throw Error("Missing bound claim");
	claim.parentRevision = null;
	const { revision: _oldRevision, ...unboundBody } = claim;
	if (!wrongClaim.chapter) throw Error("Missing chapter");
	wrongClaim.chapter.claims[0] = await createPersona(unboundBody);
	expect(() => restoreRuntime(wrongClaim)).toThrow(/Unbound initial claim/);
	const port = new ReceivingRuntimePort(42, 6);
	const before = port.runtime.export();
	expect(() => port.dispatch({ op: "restore", save: wrongClaim })).toThrow(
		/Unbound initial claim/,
	);
	expect(port.runtime.export()).toEqual(before);
	port.dispatch({ op: "restore", save: original });
	expect(port.runtime.export()).toEqual(original);
	expect(restoreRuntime(original).export()).toEqual(original);
});

it("keeps baseline ports and their raw restored continuation exact", () => {
	const before = new RuntimePort(77, 6);
	const after = new ReceivingRuntimePort(77, 6);
	before.runtime.step();
	after.dispatch({ op: "restore", save: before.runtime.export() });
	for (let round = 0; round < 16; round++) {
		before.runtime.step();
		after.runtime.step();
		expect(JSON.stringify(after.runtime.export())).toBe(
			JSON.stringify(before.runtime.export()),
		);
	}
});

it("refuses a wrong Pass dialect, engine, identity or checkpoint instead of accepting a lookalike", () => {
	const wrongRules = input();
	wrongRules.parent.source.rules = "pass-12";
	expect(() => prepareTownCast(42, 6, [wrongRules])).toThrow(/adapter/);
	const wrongEngine = input();
	wrongEngine.parent.source.engine = "2.21.0";
	expect(() => prepareTownCast(42, 6, [wrongEngine])).toThrow(/adapter/);
	const wrongRole = input();
	wrongRole.parent.transfer.sourceRole = "selim";
	expect(() => prepareTownCast(42, 6, [wrongRole])).toThrow(/adapter/);
	const wrongClock = input();
	(wrongClock.parent.transfer.checkpoint as { sourceNow: number }).sourceNow++;
	expect(() => prepareTownCast(42, 6, [wrongClock])).toThrow(/receipt/);
});

it("refuses source work and a skim rule widened into an act or foreign obligation", () => {
	const work = input();
	portable(work).calendar.commitments.push({
		id: "chef-shift",
		kind: "promise",
		toId: "chef",
		actions: ["dish"],
		from: 2490,
		until: 2745,
		importance: 0.55,
		status: "pending",
	});
	expect(() => prepareTownCast(42, 6, [work])).toThrow(
		/source work or care duty/,
	);
	const act = input();
	const jar = portable(act).calendar.commitments[0];
	if (!jar) throw Error("Source personal abstention missing");
	jar.actions = ["skim"];
	expect(() => prepareTownCast(42, 6, [act])).toThrow(
		/source work or care duty/,
	);
	const foreign = input();
	const obligation = portable(foreign).calendar.commitments[0];
	if (!obligation) throw Error("Source personal abstention missing");
	obligation.toId = "chef";
	expect(() => prepareTownCast(42, 6, [foreign])).toThrow(
		/source work or care duty/,
	);
});

// Review controls use public SDK checksums, so source binding cannot be replaced by checksum checks.
it("rejects malformed parents and claims and validly checksummed unbound claims without touching the live port", async () => {
	const original = await receivedChapter();
	const port = new ReceivingRuntimePort(77, 6);
	port.runtime.step();
	const before = JSON.stringify(port.runtime.export());
	const badClaim = structuredClone(original);
	if (!badClaim.chapter?.claims[0]) throw Error("Missing claim");
	badClaim.chapter.claims[0].revision = "0".repeat(64);
	const badParent = structuredClone(original);
	if (!badParent.chapter?.inputs[0] || !badParent.chapter.claims[0])
		throw Error("Missing parent");
	badParent.chapter.inputs[0].parent.revision = "0".repeat(64);
	badParent.chapter.claims[0].parentRevision = "0".repeat(64);
	const candidates = [badClaim, badParent];
	if (!original.chapter?.claims[0]) throw Error("Missing source");
	for (const change of [
		{ branchId: "unrelated-branch" },
		{ transfer: { garbage: true } },
		{
			source: {
				...original.chapter.claims[0].source,
				rules: "unrelated-rules",
			},
		},
	]) {
		const save = structuredClone(original);
		if (!save.chapter?.claims[0]) throw Error("Missing claim");
		const { revision: _, ...body } = save.chapter.claims[0];
		save.chapter.claims[0] = await createPersona({ ...body, ...change });
		await validatePersona(save.chapter.claims[0]);
		candidates.push(save);
	}
	for (const save of candidates) {
		expect(() => port.dispatch({ op: "restore", save })).toThrow();
		expect(JSON.stringify(port.runtime.export())).toBe(before);
	}
});

it("refuses the review's recomputed unknown producer and false source receipt", async () => {
	for (const mutate of [
		(p: PersonaEnvelope) => {
			p.source.build = "unreviewed-producer";
		},
		(p: PersonaEnvelope) => {
			(p.transfer.checkpoint as { checkpointDigest: string }).checkpointDigest =
				"0".repeat(64);
		},
		(p: PersonaEnvelope) => {
			p.source.game = "neighbours";
			p.source.rules = CAST_RULES;
			p.parentRevision = p.revision;
		},
	]) {
		const parent = structuredClone(actual.envelope);
		mutate(parent);
		const { revision: _, ...body } = parent;
		const checksummed = await createPersona(body);
		await validatePersona(checksummed);
		const life = checksummed.transfer.life as { clock: { watermark: number } };
		const prepared = preparePersonaLife(checksummed, life.clock.watermark);
		expect(() => prepareTownCast(42, 6, [prepared])).toThrow();
	}
});

it("matches the public SDK envelope checksum and rejects extra envelope fields", async () => {
	const { validateReceivingPersona, personaDigest } = await import(
		"../src/persona-protocol.ts"
	);
	const claim = (await receivedChapter()).chapter?.claims[0];
	if (!claim) throw Error("Missing claim");
	for (const envelope of [actual.envelope, claim]) {
		expect(validateReceivingPersona(envelope)).toEqual(
			await validatePersona(envelope),
		);
		const { revision, ...body } = envelope;
		expect(personaDigest(body)).toBe(revision);
	}
	expect(
		personaDigest({ word: "I’m confused — çay", nested: [1, null, false] }),
	).toBe(
		sha256(
			canonicalPersona({
				word: "I’m confused — çay",
				nested: [1, null, false],
			}),
		),
	);
	const extra = { ...claim, extra: true };
	await expect(validatePersona(extra)).rejects.toThrow(/envelope/);
	expect(() => validateReceivingPersona(extra)).toThrow(/envelope/);
});
