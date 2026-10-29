import { readFileSync } from "node:fs";
import type { Person } from "@adam0white/human-framework";
import {
	canonicalCast,
	closePersonaBranch,
	createPersona,
	initialPersonaLife,
	type PersonaEnvelope,
	preparePersonaLife,
	validatePersona,
} from "@adam0white/lab-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
	request: vi.fn(),
	enabled: true,
	ready: Promise.resolve(true),
	setPersonaRecording: vi.fn(),
	setTelemetryOff: vi.fn(),
	allowPersonaRecording: vi.fn(),
	sendFeedback: vi.fn(),
	personaRecordingAllowed: false,
	telemetryOn: true,
	privacySignalOn: false,
}));
vi.mock("../src/ui/lab.tsx", () => ({
	lab: {
		setPersonaRecording: fake.setPersonaRecording,
		setTelemetryOff: fake.setTelemetryOff,
		allowPersonaRecording: fake.allowPersonaRecording,
		build: () => ({ c: "test" }),
		get personaRecordingAllowed() {
			return fake.personaRecordingAllowed;
		},
		get telemetryOn() {
			return fake.telemetryOn;
		},
		get privacySignalOn() {
			return fake.privacySignalOn;
		},
		privacyOverride: false,
		sendFeedback: fake.sendFeedback,
	},
}));
vi.mock("@adam0white/lab-client", async (original) => ({
	...(await original<typeof import("@adam0white/lab-client")>()),
	personaChannel: () => ({
		get enabled() {
			return fake.enabled;
		},
		get ready() {
			return fake.ready;
		},
		request: fake.request,
	}),
	watchPersonaCheckpoint: () => () => {},
}));

import { CastSession, type TownPacket } from "../src/cast-session.ts";
import { ALLOCATION, CAST_EDITION } from "../src/core/canonical-cast.ts";
import { prepareTownCast } from "../src/core/cast-continuity.ts";
import { createRuntime, restoreRuntime } from "../src/core/index.ts";

async function head(id = "hf.cast.ece.murmur") {
	const c = canonicalCast(id),
		branchId = `branch-${c.name}`;
	return createPersona({
		format: "hf-persona/1",
		castId: id,
		castRevision: c.revision,
		branchId,
		parentRevision: null,
		source: {
			game: "neighbours",
			build: "test",
			engine: "2.17.0",
			rules: "neighbours-cast-1",
		},
		transfer: { life: initialPersonaLife(id, branchId, 3600000) },
		limitations: [],
	});
}
beforeEach(() => {
	vi.clearAllMocks();
	fake.ready = Promise.resolve(true);
	fake.enabled = true;
	fake.setTelemetryOff.mockImplementation((off: boolean) => {
		fake.telemetryOn = !off;
	});
	fake.personaRecordingAllowed = false;
	fake.telemetryOn = true;
	fake.privacySignalOn = false;
	vi.stubGlobal("window", new EventTarget());
});
afterEach(() => vi.unstubAllGlobals());
it("keeps received Rafi's personal source rule through an actual town checkpoint and readmission", async () => {
	const {
		prepareReceivingTownCast,
		restoreReceivingRuntime,
		ReceivingRuntimePort,
	} = await import("../src/received-town.ts");
	const actual = JSON.parse(
		readFileSync(
			new URL("./fixtures/pass-rafi-453be903.json", import.meta.url),
			"utf8",
		),
	);
	const input = preparePersonaLife(
		actual.envelope,
		actual.envelope.transfer.life.clock.watermark,
	);
	let saved: TownPacket | undefined;
	const session = new CastSession(async () => {
		if (!saved) throw Error("No current control packet");
		return saved;
	});
	fake.request.mockImplementation(async (q) => {
		if (q.action === "prepareBatch")
			return {
				expectedHeads: Object.fromEntries(
					ALLOCATION.map((c) => [
						c.castId,
						c.castId === actual.envelope.castId
							? actual.envelope.revision
							: null,
					]),
				),
				inputs: [input],
				blocked: [],
			};
		return {};
	});
	const initial = await session.fresh(42, 6);
	const port = new ReceivingRuntimePort(42, 6);
	port.runtime = restoreReceivingRuntime(initial.runtime);
	port.wanted.add("ravi");
	for (let round = 0; round < 384; round++) {
		const ids = port.dispatch({ op: "prepare" }) as string[];
		const candidate = port.boundaries.get("ravi");
		if (
			candidate &&
			candidate.now === port.runtime.view().now &&
			candidate.agenda.goals.every((goal) => goal.status !== "active")
		)
			break;
		for (const actorId of ids)
			port.dispatch({
				op: "apply",
				actorId,
				actionId: port.dispatch({ op: "choose", actorId }),
			});
	}
	const person = port.boundaries.get("ravi");
	if (!person) throw Error("No actual idle Rafi boundary");
	const packet: TownPacket = {
		schema: "neighbours/concordia@1",
		rounds: (port.runtime.export() as TownPacket["runtime"]).round,
		runtime: port.runtime.export() as TownPacket["runtime"],
		castBoundary: { actorId: "ravi", person },
	};
	saved = packet;
	session.commitFresh();
	await session.checkpoint(packet, "hf.cast.rafi.pass");
	const head = await (await import("@adam0white/lab-client")).validatePersona(
		session.heads[0],
	);
	const life = head.transfer.life as { clock: { watermark: number } };
	// A valid checksum cannot replace the raw-state/origin binding of an own continuation.
	const { createPersona } = await import("@adam0white/lab-client");
	for (const mutate of [
		(p: PersonaEnvelope) => {
			delete p.transfer.passOrigin;
		},
		(p: PersonaEnvelope) => {
			(p.transfer.passWitness as Person).body.fitness = 0.5;
		},
		(p: PersonaEnvelope) => {
			p.branchId = "unrelated-branch";
		},
		(p: PersonaEnvelope) => {
			(
				p.transfer.person as { person: { health: { fitness: number } } }
			).person.health.fitness = 0.5;
		},
	]) {
		const candidate = structuredClone(head);
		mutate(candidate);
		const { revision: _revision, ...body } = candidate;
		const checksummed = await createPersona(body);
		expect(() =>
			prepareReceivingTownCast(73, 6, [
				preparePersonaLife(checksummed, life.clock.watermark),
			]),
		).toThrow();
	}

	const received = prepareReceivingTownCast(73, 6, [
		preparePersonaLife(head, life.clock.watermark),
	]);
	const rafi = received.people.find((r) => r.person.id === "ravi")?.person;
	expect(rafi?.rng).toEqual(person.rng);
	expect(
		rafi?.agenda.commitments.some(
			(c) =>
				c.label === "my rule about the jar" && c.violatedBy?.[0] === "skim",
		),
	).toBe(true);
	expect(rafi?.skills).toEqual({});
	const a = restoreReceivingRuntime(received);
	const b = restoreReceivingRuntime(JSON.parse(JSON.stringify(a.export())));
	for (let round = 0; round < 16; round++) {
		a.step();
		b.step();
		expect(b.export()).toEqual(a.export());
	}
	session.close();
});
describe("browser history recording and ownership", () => {
	it.each([
		{ on: true, sharePlay: false },
		{ on: false, sharePlay: false },
		{ on: false, sharePlay: true },
	])(
		"sends the note and includes a run when recording=$on or shared=$sharePlay",
		async ({ on, sharePlay }) => {
			const s = new CastSession(async () => null);
			s.commitFresh();
			fake.telemetryOn = on;
			const run = {
				runtime: { chapter: { initial: "carried history" } },
				castLocal: { heads: [] },
			};
			const capture = vi.fn(async () => run);
			expect(await s.feedback("note", "tester", capture, sharePlay)).toBe(
				!on && !sharePlay,
			);
			expect(capture).toHaveBeenCalledTimes(on || sharePlay ? 1 : 0);
			expect(fake.sendFeedback).toHaveBeenLastCalledWith("note", {
				name: "tester",
				run: on || sharePlay ? run : { feedbackOnly: true },
				sharePlay: false,
			});
			s.close();
		},
	);
	it("opts in immediately and sends the note after four seconds when optional capture stalls", async () => {
		vi.useFakeTimers();
		try {
			const s = new CastSession(async () => null);
			s.commitFresh();
			fake.telemetryOn = false;
			const sending = s.feedback(
				"Keep this note",
				"",
				() => new Promise(() => {}),
				true,
			);
			expect(fake.setTelemetryOff).toHaveBeenCalledWith(false);
			expect(fake.sendFeedback).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(4000);
			await sending;
			expect(fake.sendFeedback).toHaveBeenCalledWith("Keep this note", {
				name: "",
				run: { feedbackOnly: true },
				sharePlay: false,
			});
			s.close();
		} finally {
			vi.useRealTimers();
		}
	});
	it("keeps pending fresh admission through recording identity and preference events", async () => {
		let release: ((value: boolean) => void) | undefined;
		fake.ready = new Promise<boolean>((resolve) => {
			release = resolve;
		});
		const s = new CastSession(async () => null);
		const preparing = s.fresh(42, 8, true);
		const generation = s.generation;
		window.dispatchEvent(new Event("hf-lab-preference"));
		for (const key of [
			"hf-lab-player",
			"hf-lab-recording-off",
			"hf-persona-recording:old-history",
		]) {
			const event = new Event("storage");
			Object.assign(event, { key });
			window.dispatchEvent(event);
		}
		expect(s.generation).toBe(generation);
		release?.(true);
		await expect(preparing).resolves.toMatchObject({
			schema: "neighbours/concordia@1",
		});
		s.close();
	});
	it("still cancels pending admission for fictional continuity changes", async () => {
		let release: ((value: boolean) => void) | undefined;
		fake.ready = new Promise<boolean>((resolve) => {
			release = resolve;
		});
		const s = new CastSession(async () => null);
		const preparing = s.fresh(42, 8, true);
		const event = new Event("storage");
		Object.assign(event, { key: "hf-persona-opt-in" });
		window.dispatchEvent(event);
		release?.(true);
		await expect(preparing).rejects.toThrow(
			"The game changed while its people were being prepared",
		);
		s.close();
	});
	it("sends the note when optional capture fails", async () => {
		const s = new CastSession(async () => null);
		s.commitFresh();
		expect(
			await s.feedback("note", "", async () => {
				throw Error("no save");
			}),
		).toBe(true);
		expect(fake.sendFeedback).toHaveBeenLastCalledWith("note", {
			name: "",
			run: { feedbackOnly: true },
			sharePlay: false,
		});
		s.close();
	});
	it("makes obsolete recording hooks local no-ops without requesting an epoch", async () => {
		const s = new CastSession(async () => null);
		s.commitFresh();
		s.heads = [await head()];
		fake.request.mockRejectedValue(new Error("Obsolete RPC unavailable"));
		await s.recording(true);
		await s.recording(false);
		window.dispatchEvent(new Event("hf-lab-preference"));
		expect(fake.request).not.toHaveBeenCalled();
		s.close();
	});
	it("suppresses a stale run and SDK snapshot fallback while preserving the note", async () => {
		let finish: ((run: unknown) => void) | undefined;
		const s = new CastSession(async () => null);
		s.commitFresh();
		const sending = s.feedback(
			"Stale note",
			"",
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}),
		);
		s.invalidate();
		finish?.({ runtime: "stale" });
		await sending;
		expect(fake.sendFeedback).toHaveBeenCalledWith("Stale note", {
			name: "",
			run: { feedbackOnly: true },
			sharePlay: false,
		});
		s.close();
	});
	it("does not re-enable recording after a newer off choice during capture", async () => {
		let finish: ((run: unknown) => void) | undefined;
		const s = new CastSession(async () => null);
		s.commitFresh();
		fake.telemetryOn = false;
		const sending = s.feedback(
			"Keep off",
			"",
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}),
			true,
		);
		expect(fake.telemetryOn).toBe(true);
		fake.telemetryOn = false;
		finish?.({ runtime: "available" });
		await sending;
		expect(fake.sendFeedback).toHaveBeenCalledWith("Keep off", {
			name: "",
			run: { feedbackOnly: true },
			sharePlay: false,
		});
		expect(fake.setTelemetryOff).toHaveBeenCalledTimes(1);
		s.close();
	});
	it("keeps imported files file-origin through local save/reload and refuses embedded ownership", async () => {
		const parent = await head();
		const packet = {
			schema: "neighbours/concordia@1",
			rounds: 1,
			runtime: createRuntime(42, 6).export(),
			castLocal: { heads: [parent], file: false },
		} as TownPacket;
		const imported = new CastSession(async () => packet);
		await imported.load(packet, false);
		imported.commitLoad();
		expect(imported.heads).toEqual([]);
		expect(imported.file).toBe(true);
		await imported.recording(true);
		expect(fake.request).not.toHaveBeenCalled();
		const reloaded = new CastSession(async () => packet);
		await reloaded.load(imported.decorate(packet), true);
		reloaded.commitLoad();
		expect(reloaded.heads).toEqual([]);
		expect(reloaded.file).toBe(true);
		await expect(reloaded.checkpoint(packet, parent.castId)).rejects.toThrow(
			/This imported game/,
		);
		imported.close();
		reloaded.close();
	});
	it("refuses an old natural-boundary capture after the run generation changes", async () => {
		let finish: (value: unknown) => void = () => {};
		const s = new CastSession(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}),
		);
		s.commitFresh();
		const pending = s.savePerson("hf.cast.ece.murmur");
		await Promise.resolve();
		s.invalidate();
		finish({});
		await expect(pending).rejects.toThrow(/changed/);
		expect(fake.request).not.toHaveBeenCalled();
		s.close();
	});
	it("closes an actual owned death instead of exporting a living projection", async () => {
		const parent = await head(),
			runtime = createRuntime(42, 6).export() as TownPacket["runtime"];
		runtime.chapter = {
			edition: CAST_EDITION,
			inputs: [],
			claims: [],
			initial: {},
			mapping: "neighbours-calendar/1",
		};
		const ece = runtime.people.find((r) => r.person.id === "noor");
		if (!ece) throw Error("Missing Ece fixture");
		ece.person.body.alive = false;
		const s = new CastSession(async () => null);
		s.commitFresh();
		s.heads = [parent];
		fake.request.mockResolvedValue({});
		await s.checkpoint(
			{ schema: "neighbours/concordia@1", rounds: 0, runtime },
			parent.castId,
		);
		const terminal = s.heads[0];
		if (!terminal) throw Error("Missing terminal receipt");
		expect(terminal.terminal).toBeDefined();
		expect(terminal.parentRevision).toBe(parent.revision);
		expect(() => preparePersonaLife(terminal, 7200000)).toThrow(/closed/);
		expect(
			(await closePersonaBranch(parent, parent.source, 480)).terminal,
		).toEqual(terminal.terminal);
		s.close();
	});
});
it("persists a real accepted source head, then checkpoints again after exact local reload", async () => {
	const { RuntimePort } = await import("../src/bridge-port.ts");
	const { HOST_CAST } = await import("../src/core/canonical-cast.ts");
	const { snapshot } = await import("@adam0white/human-framework");
	const { acceptPersona } = await import("@adam0white/lab-client");
	const port = new RuntimePort(42, 6);
	const initial = Object.fromEntries(
		(port.runtime.export() as TownPacket["runtime"]).people.map((r) => [
			HOST_CAST[r.person.id as keyof typeof HOST_CAST],
			snapshot(r.person),
		]),
	);
	port.wanted.add("noor");
	for (let round = 0; round < 24 && !port.boundaries.has("noor"); round++)
		for (const id of port.runtime.prepareRound())
			port.runtime.apply(id, port.runtime.choose(id));
	// Use the observer transport, which captures before the next actual decision.
	if (!port.boundaries.has("noor"))
		for (let round = 0; round < 24 && !port.boundaries.has("noor"); round++) {
			const ids = port.dispatch({ op: "prepare" }) as string[];
			for (const actorId of ids)
				port.dispatch({
					op: "apply",
					actorId,
					actionId: port.dispatch({ op: "choose", actorId }),
				});
		}
	const person = port.boundaries.get("noor");
	if (!person) throw Error("No finished source action");
	const runtime = port.runtime.export() as TownPacket["runtime"];
	runtime.chapter = {
		edition: CAST_EDITION,
		inputs: [],
		claims: [],
		initial,
		mapping: "neighbours-calendar/1",
	};
	const packet: TownPacket = {
		schema: "neighbours/concordia@1",
		rounds: runtime.round,
		runtime,
		castBoundary: { actorId: "noor", person },
	};
	let state: import("@adam0white/lab-client").PersonaShelfState = {
		heads: {},
		revisions: [],
	};
	fake.request.mockImplementation(async (q) => {
		if (q.action === "put") {
			state = acceptPersona(state, q.envelope, q.fork);
			return {};
		}
		if (q.action === "recordingBatch")
			throw Error("Obsolete recording RPC is unavailable");
		throw Error("Unexpected source request");
	});
	let saved: TownPacket | undefined;
	let persist: () => void = () => {};
	const persisted = new Promise<void>((resolve) => {
		persist = resolve;
	});
	const first = new CastSession(
		async () => packet,
		async () => {
			await persisted;
			saved = first.decorate(packet);
		},
	);
	first.commitFresh();
	let finished = false;
	const saving = first.savePerson("hf.cast.ece.murmur").then(() => {
		finished = true;
	});
	await vi.waitFor(() => expect(first.heads).toHaveLength(1));
	expect(finished).toBe(false);
	expect(saved).toBeUndefined();
	persist();
	await saving;
	if (!saved) throw Error("Accepted head was not persisted");
	const actualHead = first.heads[0];
	if (!actualHead) throw Error("Missing actual head");
	expect(actualHead.source.engine).toBe("2.23.0");
	const admitted = prepareTownCast(73, 6, [
		preparePersonaLife(actualHead, 3600000),
	]);
	expect(
		admitted.people.find((r) => r.person.id === "noor")?.person.rng,
	).toEqual(person.rng);
	const a = restoreRuntime(admitted);
	const b = restoreRuntime(JSON.parse(JSON.stringify(a.export())));
	for (let i = 0; i < 16; i++) {
		a.step();
		b.step();
		expect(JSON.stringify(b.export())).toBe(JSON.stringify(a.export()));
	}
	const revision = first.heads[0]?.revision;
	const next = new CastSession(async () => packet);
	await next.load(saved, true);
	expect(next.heads).toEqual([]);
	next.commitLoad();
	expect(next.heads[0]?.revision).toBe(revision);
	await next.savePerson("hf.cast.ece.murmur");
	expect(next.heads[0]?.parentRevision).toBe(revision);
	expect(
		fake.request.mock.calls.some(([q]) => q.action === "recordingBatch"),
	).toBe(false);
	first.close();
	next.close();
});

it.each([undefined, 0, 0.35, "unmapped"] as const)(
	"projects a controlled finished boundary with repair level %s without inventing a skill",
	async (level) => {
		const { RuntimePort } = await import("../src/bridge-port.ts");
		const { createPerson } = await import("@adam0white/human-framework");
		const port = new RuntimePort(42, 6);
		port.wanted.add("noor");
		for (let round = 0; round < 24 && !port.boundaries.has("noor"); round++) {
			const ids = port.dispatch({ op: "prepare" }) as string[];
			for (const actorId of ids)
				port.dispatch({
					op: "apply",
					actorId,
					actionId: port.dispatch({ op: "choose", actorId }),
				});
		}
		const finished = port.boundaries.get("noor");
		if (!finished) throw Error("No actual action boundary");
		// Synthetic acquired-state variants of an observed boundary, not a played source tape.
		const person = structuredClone(finished);
		person.skills = createPerson({
			id: "skill-control",
			name: "Skill control",
			seed: 1,
			bornAt: -28 * 525600,
			sex: "female",
			skills:
				level === "unmapped"
					? { courier: 0.2 }
					: level === undefined
						? {}
						: { repair: level },
		}).skills;
		const runtime = port.runtime.export() as TownPacket["runtime"];
		runtime.chapter = {
			edition: CAST_EDITION,
			inputs: [],
			claims: [],
			initial: {},
			mapping: "neighbours-calendar/1",
		};
		const s = new CastSession(async () => null);
		s.commitFresh();
		fake.request.mockImplementation(async (q) =>
			q.action === "recordingBatch"
				? {
						sameEpoch: false,
						revisions: q.envelopes.map((h: { revision: string }) => h.revision),
						recordingEpoch: "current",
					}
				: {},
		);
		await s.checkpoint(
			{
				schema: "neighbours/concordia@1",
				rounds: runtime.round,
				runtime,
				castBoundary: { actorId: "noor", person },
			},
			"hf.cast.ece.murmur",
		);
		const exported = await validatePersona(s.heads[0]);
		expect(exported.source.engine).toBe("2.23.0");
		const portable = exported.transfer.person as {
			person: { skills: unknown; limitations: string[] };
		};
		if (level === "unmapped") {
			expect(portable.person.skills).toEqual({});
			expect(portable.person.limitations).toContain("skill:courier");
			const checkpoint = exported.transfer.checkpoint as { sha256: string };
			const archived = s.decorate({
				schema: "neighbours/concordia@1",
				rounds: runtime.round,
				runtime,
			}).castLocal?.sources;
			expect(archived?.[checkpoint.sha256]?.skills).toEqual(person.skills);
		} else {
			expect(portable.person.skills).toEqual(person.skills);
			expect(Object.keys(portable.person.skills as object)).toEqual(
				level === undefined ? [] : ["repair"],
			);
		}
		s.close();
	},
);

it("failed atomic admission preserves old ownership receipts and origin", async () => {
	const s = new CastSession(async () => null);
	const oldHead = await head();
	s.heads = [oldHead];
	s.file = true;
	s.localOnly = true;
	fake.request
		.mockResolvedValueOnce({
			expectedHeads: Object.fromEntries(
				ALLOCATION.map((p) => [p.castId, null]),
			),
			blocked: [],
			inputs: [],
		})
		.mockRejectedValueOnce(Error("Accepted batch reply was lost"));
	await expect(s.fresh(73, 8)).rejects.toThrow("Accepted batch reply was lost");
	expect(s.heads).toEqual([oldHead]);
	expect(s.file).toBe(true);
	expect(s.localOnly).toBe(true);
	expect(fake.request).toHaveBeenCalledTimes(2);
	expect(fake.request.mock.calls.map(([request]) => request.action)).toEqual([
		"prepareBatch",
		"putBatch",
	]);
	s.close();
});

it("requires an explicit local start when the shared shelf is unavailable", async () => {
	fake.enabled = false;
	const session = new CastSession(async () => ({}));
	await expect(session.fresh(73, 8)).rejects.toThrow(
		"Shared people are unavailable",
	);
	expect(fake.request).not.toHaveBeenCalled();
	const local = await session.fresh(73, 8, true);
	expect(local.runtime.seed).toBe(73);
	expect(local.runtime.chapter?.inputs).toEqual([]);
	expect(session.localOnly).toBe(true);
	session.close();
});
