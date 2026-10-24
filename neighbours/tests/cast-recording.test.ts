import {
	canonicalCast,
	closePersonaBranch,
	createPersona,
	initialPersonaLife,
	preparePersonaLife,
} from "@adam0white/lab-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
	request: vi.fn(),
	setPersonaRecording: vi.fn(),
	allowPersonaRecording: vi.fn(),
	sendFeedback: vi.fn(),
	personaRecordingAllowed: false,
	telemetryOn: true,
	privacySignalOn: false,
}));
vi.mock("../src/ui/lab.tsx", () => ({
	lab: {
		setPersonaRecording: fake.setPersonaRecording,
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
		enabled: true,
		ready: Promise.resolve(true),
		request: fake.request,
	}),
	watchPersonaCheckpoint: () => () => {},
}));

import { CastSession, type TownPacket } from "../src/cast-session.ts";
import { CAST_EDITION } from "../src/core/canonical-cast.ts";
import { createRuntime } from "../src/core/index.ts";

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
	fake.personaRecordingAllowed = false;
	fake.telemetryOn = true;
	fake.privacySignalOn = false;
	vi.stubGlobal("window", new EventTarget());
});
afterEach(() => vi.unstubAllGlobals());
describe("browser history recording and ownership", () => {
	it("never captures raw replay histories for unanswered, declined or file consent", async () => {
		for (const mode of ["unanswered", "declined", "file"] as const) {
			const s = new CastSession(async () => null);
			s.commitFresh();
			s.heads = [await head(), await head("hf.cast.derya.stairwell")];
			fake.request.mockResolvedValue({
				sameEpoch: false,
				revisions: s.heads.map((h) => h.revision),
				recordingEpoch: "current",
			});
			fake.personaRecordingAllowed = mode === "file";
			s.file = mode === "file";
			if (mode === "declined") await s.recording(false);
			const run = {
				runtime: {
					chapter: {
						inputs: [
							{
								parent: {
									branchId: "source-branch",
									revision: "source-revision",
								},
							},
						],
						initial: { carried: "source-person-history" },
					},
				},
				castLocal: { heads: ["private-history"] },
			};
			const capture = vi.fn(async () => run);
			expect(await s.feedback("note", "tester", capture)).toBe(true);
			expect(capture).not.toHaveBeenCalled();
			expect(fake.sendFeedback).toHaveBeenLastCalledWith("note", {
				name: "tester",
				run: { feedbackOnly: true },
			});
			expect(run.runtime.chapter.inputs[0]?.parent.revision).toBe(
				"source-revision",
			);
			s.close();
		}
	});
	it("keeps an approved bound run and uses an explicit note marker for unavailable or stale runs", async () => {
		const s = new CastSession(async () => null);
		s.commitFresh();
		fake.personaRecordingAllowed = true;
		const run = { runtime: {}, castLocal: { heads: ["approved"] } };
		expect(await s.feedback("approved", "", async () => run)).toBe(false);
		expect(fake.sendFeedback).toHaveBeenLastCalledWith("approved", {
			name: "",
			run,
		});
		for (const mode of ["off", "privacy", "failed", "stale"] as const) {
			fake.telemetryOn = mode !== "off";
			fake.privacySignalOn = mode === "privacy";
			const capture = vi.fn(async () => {
				if (mode === "failed") throw new Error("no save");
				if (mode === "stale") s.invalidate();
				return run;
			});
			expect(await s.feedback(mode, "", capture)).toBe(true);
			if (mode === "off" || mode === "privacy")
				expect(capture).not.toHaveBeenCalled();
			expect(fake.sendFeedback).toHaveBeenLastCalledWith(mode, {
				name: "",
				run: { feedbackOnly: true },
			});
		}
		s.close();
	});
	it("rechecks a preference change only after the current world is bound", async () => {
		const s = new CastSession(async () => null);
		s.commitFresh();
		await s.recording();
		fake.setPersonaRecording.mockClear();
		window.dispatchEvent(new Event("hf-lab-preference"));
		expect(fake.setPersonaRecording).toHaveBeenLastCalledWith(null);
		s.suspend();
		fake.setPersonaRecording.mockClear();
		window.dispatchEvent(new Event("hf-lab-preference"));
		expect(fake.setPersonaRecording).not.toHaveBeenCalledWith(null);
		s.commitFresh();
		s.file = true;
		fake.setPersonaRecording.mockClear();
		window.dispatchEvent(new Event("hf-lab-preference"));
		expect(fake.setPersonaRecording).not.toHaveBeenCalledWith(null);
		s.close();
	});

	it("requires every exact pinned branch and rejects a late positive epoch reply", async () => {
		const s = new CastSession(async () => null);
		s.commitFresh();
		s.heads = [await head(), await head("hf.cast.derya.stairwell")];
		let answer: (value: unknown) => void = () => {};
		fake.request.mockImplementation(
			() =>
				new Promise((resolve) => {
					answer = resolve;
				}),
		);
		const pending = s.recording();
		const revisions = s.heads.map((h) => h.revision);
		s.invalidate();
		answer({ sameEpoch: true, revisions, recordingEpoch: "old" });
		await pending;
		expect(fake.allowPersonaRecording).not.toHaveBeenCalledWith(true);
		fake.request.mockResolvedValue({
			sameEpoch: false,
			revisions,
			recordingEpoch: "current",
		});
		await s.recording();
		expect(fake.allowPersonaRecording).toHaveBeenLastCalledWith(false);
		expect(fake.request.mock.calls.at(-1)?.[0].envelopes).toHaveLength(2);
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
			/Imported files/,
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
			return {
				sameEpoch: false,
				revisions: q.envelopes.map(
					(p: import("@adam0white/lab-client").PersonaEnvelope) => p.revision,
				),
				recordingEpoch: "current",
			};
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
	const revision = first.heads[0]?.revision;
	const next = new CastSession(async () => packet);
	await next.load(saved, true);
	expect(next.heads).toEqual([]);
	next.commitLoad();
	expect(next.heads[0]?.revision).toBe(revision);
	await next.savePerson("hf.cast.ece.murmur");
	expect(next.heads[0]?.parentRevision).toBe(revision);
	first.close();
	next.close();
});
