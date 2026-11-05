/** SOURCE PREPARATION: UNRUN. One focused control per player faculty on the
 * current seed42 six-person town. Actual public replies and native history are
 * prerequisites. No seed search, private Person writes or forced decisions.
 * The two wait proofs bind a pending request to one free consideration. They
 * make no broader world-qualification claim. These controls do not replace the
 * 206-person, browser or whole-budget gates. */
import { readRunHistory } from "@adam0white/human-framework";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { required } from "../src/core/invariants.ts";
import type { Pledge } from "../src/core/player.ts";
import type { Runtime } from "../src/core/runtime.ts";
import { recordedAcceptance } from "../src/ui/recorded-acceptance.ts";
import { createRuntime, restoreRuntime } from "./current-town.ts";
import {
	assertSpeechTrial,
	atHall,
	nativeAnswer,
	speechCandidate,
	speechDiagnostics,
	stepUntil,
} from "./producer-controls.ts";

function pledge(runtime: Runtime) {
	return required(runtime.s.player?.pledges.at(-1), "Missing actual pledge");
}
function promise(
	runtime: Runtime,
	selected?: ReturnType<typeof speechCandidate>,
) {
	const by = required(
		runtime
			.view()
			.player?.pledgeDeadlines?.find((time) => time >= runtime.s.now + 180),
		"Missing feasible offered deadline",
	);
	const offer =
		selected ??
		speechCandidate(runtime, "promise", ["assented", "complied"], {
			work: "carry-meals",
			by,
		});
	runtime.intervene({
		kind: "player-speak",
		actorId: offer.actorId,
		affordanceId: offer.affordanceId,
		mode: "promise",
		pledge: { work: "carry-meals", by },
	});
	const { request } = nativeAnswer(runtime);
	assertSpeechTrial(runtime, offer);
	expect(["assented", "complied"]).toContain(request.answer.verdict);
	expect(pledge(runtime).status).toBe("open");
	expect(pledge(runtime).dueBy).toBe(by);
	return pledge(runtime);
}
function journalAncestry(runtime: Runtime) {
	const player = required(runtime.view().player, "Missing player view");
	const state = required(runtime.s.player, "Missing player state");
	expect(player.journal.length).toBeGreaterThan(0);
	const ids = new Set(
		[...state.log, ...runtime.s.events].map((event) => event.id),
	);
	for (const entry of player.journal) {
		expect(entry.label).toBe("recorded");
		expect(entry.sourceEventIds.length).toBeGreaterThan(0);
		for (const id of entry.sourceEventIds) expect(ids.has(id)).toBe(true);
	}
	for (const goal of state.goals) {
		expect(goal.eventIds.length).toBeGreaterThan(0);
		for (const id of goal.eventIds) expect(ids.has(id)).toBe(true);
	}
}
function reportedPromise(runtime: Runtime, hour: Pledge, kept: boolean) {
	stepUntil(runtime, () => hour.hfReported === true, 2);
	const input = required(
		readRunHistory(runtime.export().owner.run)
			.flatMap((entry) => entry.inputs)
			.find((input) => input.id === hour.hfInputId),
		"Missing actual native promise input",
	);
	if (input.kind !== "voice.promise-received")
		throw Error("Wrong promise input kind");
	expect(
		runtime.s.owner.current.receipts.dispositions.some(
			(disposition) =>
				disposition.inputId === hour.hfInputId &&
				disposition.kind === "consumed" &&
				disposition.reason === "applied" &&
				disposition.evidenceIds.includes(`player-pledge:${hour.id}`),
		),
	).toBe(true);
	expect(input.payload).toMatchObject({
		person: hour.toId,
		voiceId: "player",
		evidenceId: `player-pledge:${hour.id}`,
		promise: { kept, action: `pledge:${hour.work}` },
	});
	const history =
		runtime.s.owner
			.actor(hour.toId)
			.will.voices.find((voice) => voice.voiceId === "player")?.history ?? [];
	const change = required(
		history.findLast(
			(event) =>
				event.reason === (kept ? "promise-kept" : "promise-broken") &&
				event.action === `pledge:${hour.work}`,
		),
		"Missing actual native trust change",
	);
	if (kept) expect(change.delta).toBeGreaterThan(0);
	else expect(change.delta).toBeLessThan(0);
	expect(
		runtime.view().player?.pledges.find((item) => item.id === hour.id)
			?.remembered,
	).toBe(kept ? true : undefined);
}

it("binds actual free-resident assent to a physical start, matched contrast and replay", () => {
	// Declared HF4.17 fixture: seed42, six people, untouched initial checkpoint,
	// Derya/elin and care. The old busy Nora checkpoint failed and is retained in docs.
	const runtime = createRuntime(42, 6);
	expect(
		runtime.predictSpeech("elin").offers.some((x) => x.affordanceId === "care"),
	).toBe(true);
	expect(runtime.actor("elin").job).toBeUndefined();
	const baseline = restoreRuntime(runtime.export());
	runtime.intervene({
		kind: "player-speak",
		actorId: "elin",
		affordanceId: "care",
		mode: "ask",
	});
	const { request, decision } = nativeAnswer(runtime);
	expect(request.answer.verdict).toBe("assented");
	expect(decision.chosenAffordanceId).toBe("care");
	expect(request.status).toBe("started");
	const job = required(
		runtime.actor("elin").job,
		"Missing actual assented physical job",
	);
	const native = required(
		runtime.s.owner.actor("elin").activity,
		"Missing native activity",
	);
	expect(job.offer.id).toBe("care");
	expect(request.startedEvent).toBe(job.event);
	expect(job.activityId).toBe(native.id);
	expect(job.startedAt).toBe(native.startedAt);
	expect(native.offer.id).toBe("care");
	const actualInputs = readRunHistory(runtime.export().owner.run).flatMap(
		(tx) => tx.inputs,
	);
	expect(
		actualInputs.some(
			(input) =>
				input.kind === "action.resolved" &&
				input.payload.disposition === "accepted" &&
				input.payload.person === "elin" &&
				input.payload.stage === "start" &&
				input.payload.activityId === native.id,
		),
	).toBe(true);
	journalAncestry(runtime);
	const baselineDecisions: { at: number; chosen?: string | null }[] = [];
	const advance = baseline.s.owner.advance.bind(baseline.s.owner);
	const observer = vi
		.spyOn(baseline.s.owner, "advance")
		.mockImplementation((...args) => {
			const result = advance(...args);
			for (const event of result.events)
				if (event.person === "elin" && event.data.kind === "decision") {
					baselineDecisions.push({
						at: event.at,
						chosen: event.data.decision.chosenAffordanceId,
					});
				}
			return result;
		});
	try {
		baseline.step();
	} finally {
		observer.mockRestore();
	}
	const unsuggested = required(
		baselineDecisions[0],
		"Missing matched unsuggested decision",
	);
	expect(unsuggested.at).toBe(
		Math.round(
			required(request.decision, "Missing request decision").at * 60_000,
		),
	);
	expect(unsuggested.chosen).toBe("sleep");
	expect(unsuggested.chosen).not.toBe("care");
	const saved = runtime.export();
	const cold = restoreRuntime(JSON.parse(JSON.stringify(saved)));
	expect(cold.export()).toEqual(saved);
	runtime.step();
	cold.step();
	expect(cold.export()).toEqual(runtime.export());
});

it("does not mark a deferred drink request as started when the resident starts sleep", () => {
	const runtime = createRuntime(42, 6);
	runtime.intervene({
		kind: "player-speak",
		actorId: "elin",
		affordanceId: "drink",
		mode: "ask",
	});
	const { request, decision } = nativeAnswer(runtime);
	expect(request.answer.verdict).toBe("deferred");
	expect(decision.chosenAffordanceId).toBe("sleep");
	expect(runtime.actor("elin").job?.offer.id).toBe("sleep");
	expect(request.status).toBe("dropped");
	expect(request.startedEvent).toBeUndefined();
});

it("keeps a real conditional hour offered until the resident chooses, then opens or releases it", () => {
	const runtime = atHall();
	speechDiagnostics(runtime, (cut) => {
		const offer = speechCandidate(runtime, "promise", ["deferred", "modified"]);
		runtime.intervene({
			kind: "player-speak",
			actorId: offer.actorId,
			affordanceId: offer.affordanceId,
			mode: "promise",
			pledge: { work: "carry-meals" },
		});
		cut("immediately-after-first-intervene", true);
		const { request } = nativeAnswer(runtime);
		assertSpeechTrial(runtime, offer);
		expect(["deferred", "modified"]).toContain(request.answer.verdict);
		const hour = pledge(runtime);
		expect(hour.status).toBe("offered");
		expect(runtime.view().player?.pledges.at(-1)?.canStart).toBeUndefined();
		const before = runtime.export();
		expect(() =>
			runtime.intervene({ kind: "player-work", pledgeId: hour.id }),
		).toThrow(/not open/);
		expect(runtime.export()).toEqual(before);
		stepUntil(runtime, () => request.decision !== undefined, 16);
		// Bind this pending request once at the first actual free choice.
		const waitArchive = runtime.export().owner.run;
		const waitInputs = readRunHistory(waitArchive).flatMap(
			(entry) => entry.inputs,
		);
		const waitAdviceId = `player-wait:${request.id}`;
		const waitAdvice = waitInputs.filter(
			(input) =>
				input.kind === "suggestion.received" &&
				input.payload.person === request.targetId &&
				input.payload.received.kind === "ordinary" &&
				input.payload.received.suggestion.adviceId === waitAdviceId,
		);
		expect(waitAdvice).toHaveLength(1);
		const waitInput = required(waitAdvice[0], "Missing native held-wait input");
		if (
			waitInput.kind !== "suggestion.received" ||
			waitInput.payload.received.kind !== "ordinary"
		)
			throw Error("Wrong held-wait input kind");
		const originalInput = required(
			waitInputs.find(
				(input) =>
					input.kind === "suggestion.received" &&
					input.at === Math.round(request.at * 60000) + 1 &&
					input.payload.person === request.targetId &&
					input.payload.received.kind === "ordinary" &&
					input.payload.received.suggestion.voiceId === "player",
			),
			"Missing original native player suggestion",
		);
		if (
			originalInput.kind !== "suggestion.received" ||
			originalInput.payload.received.kind !== "ordinary"
		)
			throw Error("Wrong original suggestion kind");
		expect(waitInput.payload.received.suggestion).toMatchObject({
			adviceId: waitAdviceId,
			voiceId: "player",
			affordanceId: request.affordanceId,
			strength: originalInput.payload.received.suggestion.strength,
			since: Math.round(request.at * 60000),
		});
		expect(waitInput.payload.received.suggestion.insist).toBeUndefined();
		const oldActivity = required(
			before.owner.run.current.people[request.targetId]?.activity,
			"Missing old native activity",
		);
		const finishes = waitInputs.filter(
			(input) =>
				input.kind === "action.resolved" &&
				input.payload.person === request.targetId &&
				input.payload.activityId === oldActivity.id &&
				input.payload.stage === "finish" &&
				input.payload.disposition === "completed",
		);
		expect(finishes).toHaveLength(1);
		const finished = required(
			finishes[0],
			"Missing actual completed old activity",
		);
		expect(finished.at).toBeGreaterThanOrEqual(oldActivity.endsAt);
		expect(finished.at).toBeLessThan(waitInput.at);
		expect(
			waitInputs.some(
				(input) =>
					input.kind === "action.resolved" &&
					input.payload.activityId === oldActivity.id &&
					input.payload.stage === "interrupt",
			),
		).toBe(false);
		const waitCurrent = runtime.s.owner.current;
		expect(
			waitCurrent.receipts.inputs.some((input) => input.id === waitInput.id),
		).toBe(true);
		expect(waitCurrent.receipts.dispositions).toContainEqual(
			expect.objectContaining({
				inputId: waitInput.id,
				at: waitInput.at,
				kind: "consumed",
				reason: "applied",
			}),
		);
		const freeEvent = required(
			waitCurrent.events.find(
				(event) =>
					event.person === request.targetId &&
					event.at > finished.at &&
					event.data.kind === "decision",
			),
			"Missing first actual free decision",
		);
		if (freeEvent.data.kind !== "decision")
			throw Error("Wrong free event kind");
		const freeDecision = freeEvent.data.decision;
		expect(freeDecision.at).toBe(waitInput.at);
		expect(freeDecision.review).toBeUndefined();
		expect(freeDecision.interrupt).toBeUndefined();
		expect(freeEvent.causeIds).toContain(waitInput.id);
		const ordinaryInput = required(
			waitInputs.find(
				(input) =>
					input.kind === "decision.requested" &&
					input.at === waitInput.at &&
					input.payload.person === request.targetId &&
					input.payload.reason === "ordinary town opportunities" &&
					input.payload.treatment === "ordinary",
			),
			"Missing existing ordinary free-choice request",
		);
		if (ordinaryInput.kind !== "decision.requested")
			throw Error("Wrong ordinary request kind");
		expect(waitInputs.indexOf(waitInput)).toBeLessThan(
			waitInputs.indexOf(ordinaryInput),
		);
		expect(freeEvent.causeIds).toContain(ordinaryInput.id);
		expect(
			waitInputs.some(
				(input) =>
					input.kind === "offers.received" &&
					input.at === waitInput.at &&
					input.payload.person === request.targetId &&
					input.payload.revision === ordinaryInput.payload.offerRevision &&
					waitInputs.indexOf(input) < waitInputs.indexOf(waitInput),
			),
		).toBe(true);
		const waitResolution = required(
			waitCurrent.events.find(
				(event) =>
					event.person === request.targetId &&
					event.data.kind === "suggestion-resolved" &&
					event.data.adviceId === waitAdviceId &&
					event.data.decisionId === freeDecision.id,
			),
			"Missing resolution of this exact pending advice",
		);
		if (waitResolution.data.kind !== "suggestion-resolved")
			throw Error("Wrong pending resolution kind");
		expect(waitResolution.at).toBe(freeDecision.at);
		expect(waitResolution.causeIds).toContain(waitInput.id);
		expect(waitResolution.data.resolution.voiceId).toBe("player");
		expect(
			freeDecision.suggestions ?? [freeDecision.suggestion],
		).toContainEqual(waitResolution.data.resolution);
		const hostDecision = required(
			request.decision,
			"Missing correlated host decision",
		);
		expect(Math.round(hostDecision.at * 60000)).toBe(freeDecision.at);
		expect(hostDecision.chosenAffordanceId).toBe(
			freeDecision.chosenAffordanceId ?? "",
		);
		expect(hostDecision.answer.verdict).toBe(
			waitResolution.data.resolution.verdict,
		);
		expect(
			runtime.s.player?.log.find((event) => event.id === hostDecision.event),
		).toMatchObject({
			kind: "player-decided",
			targetId: request.targetId,
			causes: [request.id, request.answerEvent],
		});

		const followed =
			request.decision?.chosenAffordanceId === request.affordanceId;
		expect(hour.status).toBe(followed ? "open" : "released");
		const actual = required(
			runtime.s.owner
				.actor(request.targetId)
				.trace.findLast(
					(decision) =>
						decision.at === Math.round((request.decision?.at ?? -1) * 60000),
				),
			"Missing native decision at the actual host decision time",
		);
		expect(actual.chosenAffordanceId).toBe(
			request.decision?.chosenAffordanceId,
		);
		if (request.startedEvent !== undefined) {
			const job = required(
				runtime.actor(request.targetId).job,
				"Missing linked physical start",
			);
			expect(job.event).toBe(request.startedEvent);
			expect(job.offer.id).toBe(actual.chosenAffordanceId);
			const started = required(
				runtime.s.events.find((event) => event.id === job.event),
				"Missing real started event",
			);
			expect(started.actorId).toBe(request.targetId);
			expect(started.kind).toBe("started");
		}
		journalAncestry(runtime);
		if (!followed) {
			expect(hour.hfReported).toBeUndefined();
			expect(hour.hfInputId).toBeUndefined();
			expect(
				runtime.s.player?.log.some(
					(event) =>
						event.id === hour.resolvedEvent &&
						event.kind === "player-pledge-released",
				),
			).toBe(true);
		}
		expect(restoreRuntime(runtime.export()).export()).toEqual(runtime.export());
	});
});

it("releases a real offered hour when another eligible request replaces it", () => {
	const runtime = atHall();
	const offer = speechCandidate(runtime, "promise", ["deferred", "modified"]);
	runtime.intervene({
		kind: "player-speak",
		actorId: offer.actorId,
		affordanceId: offer.affordanceId,
		mode: "promise",
		pledge: { work: "carry-meals" },
	});
	nativeAnswer(runtime);
	assertSpeechTrial(runtime, offer);
	const hour = pledge(runtime);
	expect(hour.status).toBe("offered");
	const offers = runtime.predictSpeech(offer.actorId).offers;
	expect(offers.length).toBeGreaterThan(0);
	const next = required(
		offers.find((candidate) => candidate.affordanceId !== offer.affordanceId),
		"Need an actual different request",
	);
	runtime.intervene({
		kind: "player-speak",
		actorId: offer.actorId,
		affordanceId: next.affordanceId,
		mode: "ask",
	});
	nativeAnswer(runtime);
	expect(hour.status).toBe("released");
	expect(hour.hfInputId).toBeUndefined();
	expect(
		runtime.s.player?.log.find((event) => event.id === hour.resolvedEvent)
			?.kind,
	).toBe("player-pledge-released");
});

it("rejects an unoffered deadline without mutation before accepting the actual chosen slot", () => {
	const runtime = atHall();
	const slots = required(
		runtime.view().player?.pledgeDeadlines,
		"Missing actual deadline slots",
	);
	expect(slots.length).toBeGreaterThan(0);
	expect(slots.every((time) => time >= runtime.s.now + 60)).toBe(true);
	const by = required(
		slots.find((time) => time >= runtime.s.now + 180),
		"Missing feasible slot",
	);
	const offer = speechCandidate(runtime, "promise", ["assented", "complied"], {
		work: "carry-meals",
		by,
	});
	const before = runtime.export();
	expect(slots).not.toContain(by + 30);
	expect(() =>
		runtime.intervene({
			kind: "player-speak",
			actorId: offer.actorId,
			affordanceId: offer.affordanceId,
			mode: "promise",
			pledge: { work: "carry-meals", by: by + 30 },
		}),
	).toThrow(/Choose a time/);
	expect(runtime.export()).toEqual(before);
	const hour = promise(runtime, offer);
	expect(hour.dueBy).toBe(by);
});

it("records the current urged choice without inventing refusal or a physical start", () => {
	const runtime = atHall();
	const offer = { actorId: "ada", affordanceId: "open-section" };
	expect(
		runtime
			.predictSpeech(offer.actorId)
			.offers.some((item) => item.affordanceId === offer.affordanceId),
	).toBe(true);
	const refusedBefore =
		runtime.s.owner
			.actor(offer.actorId)
			.will.voices.find((voice) => voice.voiceId === "player")?.refused ?? 0;
	const before = readRunHistory(runtime.export().owner.run).flatMap(
		(entry) => entry.inputs,
	);
	const suggestionsBefore = before.filter(
		(input) =>
			input.kind === "suggestion.received" &&
			input.payload.person === offer.actorId &&
			input.payload.received.kind === "ordinary" &&
			input.payload.received.suggestion.voiceId === "player" &&
			input.payload.received.suggestion.affordanceId === offer.affordanceId &&
			input.payload.received.suggestion.insist === true,
	).length;
	const coercionsBefore = before.filter(
		(input) => input.kind === "coercion.received",
	).length;
	runtime.intervene({
		kind: "player-speak",
		actorId: offer.actorId,
		affordanceId: offer.affordanceId,
		mode: "urge",
	});
	const { request, decision } = nativeAnswer(runtime);
	expect(request.answer.verdict).toBe("assented");
	expect(request.status).toBe("decided");
	expect(request.startedEvent).toBeUndefined();
	expect(
		runtime.s.owner
			.actor(offer.actorId)
			.will.voices.find((voice) => voice.voiceId === "player")?.refused,
	).toBe(refusedBefore);
	expect(
		runtime.s.owner
			.actor(offer.actorId)
			.will.advice.filter((advice) => advice.sourceId === "player"),
	).toEqual([]);
	expect(request.pledgeId).toBeUndefined();
	expect(
		runtime.s.player?.requests.filter(
			(item) => item.targetId === offer.actorId && item.status === "held",
		),
	).toEqual([]);
	expect(runtime.s.player?.pledges).toEqual([]);
	const inputs = readRunHistory(runtime.export().owner.run).flatMap(
		(entry) => entry.inputs,
	);
	const suggestions = inputs.filter(
		(input) =>
			input.kind === "suggestion.received" &&
			input.payload.person === offer.actorId &&
			input.payload.received.kind === "ordinary" &&
			input.payload.received.suggestion.voiceId === "player" &&
			input.payload.received.suggestion.affordanceId === offer.affordanceId &&
			input.payload.received.suggestion.insist === true,
	);
	expect(suggestions).toHaveLength(suggestionsBefore + 1);
	expect(suggestions.filter((input) => input.at === decision.at)).toHaveLength(
		1,
	);
	expect(
		inputs.filter((input) => input.kind === "coercion.received"),
	).toHaveLength(coercionsBefore);
	expect(runtime.view().player?.journal.at(-1)?.text).not.toMatch(
		/It was a refusal\./,
	);
	runtime.step();
	expect(request.status).toBe("dropped");
	expect(request.startedEvent).toBeUndefined();
	expect(runtime.actor(offer.actorId).job?.offer.id).not.toBe(
		offer.affordanceId,
	);
});

// Separate complete correctness controls retain the original five-second cap.
// The combined two-path + two-restore case exceeded it on CI; no assertion,
// actual action, continuation, physical deadline or product budget is removed.
describe("a kept real hour and complete cold continuation", () => {
	let runtime: Runtime;
	let cold: Runtime;
	let hour: ReturnType<typeof promise>;
	let produced: number;
	beforeAll(() => {
		runtime = atHall();
		hour = promise(runtime);
		cold = restoreRuntime(runtime.export());
		produced = runtime.s.produced;
	}, 5000);
	for (const mode of ["original", "cold"] as const) {
		it(`keeps physical work, native trust and receipt ancestry: ${mode}`, () => {
			const town = mode === "original" ? runtime : cold;

			town.intervene({ kind: "player-work", pledgeId: hour.id });
			expect(town.view().player?.job?.pledgeId).toBe(hour.id);
			const working = town.export();
			expect(() =>
				town.intervene({ kind: "player-move", placeId: "market" }),
			).toThrow();
			expect(town.export()).toEqual(working);
			stepUntil(town, () => !town.view().player?.job, 12);
			expect(pledge(town).status).toBe("kept");
			expect(town.s.produced).toBeGreaterThanOrEqual(produced + 5);
			const done = required(
				town.s.player?.log.find(
					(event) => event.id === pledge(town).resolvedEvent,
				),
				"Missing physical work receipt",
			);
			expect(done.kind).toBe("player-work-done");
			expect(done.text).toMatch(/You delivered 5 meals/);
			expect(done.causes).toContain(hour.event);
			reportedPromise(town, pledge(town), true);
			journalAncestry(town);
		});
	}
	it("compares the entire original and cold outcomes and a new full restore", () => {
		expect(cold.export()).toEqual(runtime.export());
		expect(restoreRuntime(runtime.export()).export()).toEqual(runtime.export());
	});
});

it("lapses an unworked real hour with neutral wording and an accepted native broken-promise input", () => {
	const runtime = atHall();
	const hour = promise(runtime);
	stepUntil(runtime, () => hour.status !== "open", 32);
	expect(runtime.s.now).toBeGreaterThanOrEqual(hour.dueBy);
	expect(hour.status).toBe("lapsed");
	const event = required(
		runtime.s.player?.log.find((item) => item.id === hour.resolvedEvent),
		"Missing actual lapsed receipt",
	);
	expect(event.text).toMatch(/passed with no hour recorded/);
	expect(event.text).not.toMatch(/fault|blame|failed you|let .* down/i);
	const before = runtime.export();
	expect(() =>
		runtime.intervene({ kind: "player-work", pledgeId: hour.id }),
	).toThrow(/not open/);
	expect(runtime.export()).toEqual(before);
	reportedPromise(runtime, hour, false);
});

it("accepts a real modified counter with correlated journal proof and counts an earlier promise only when kept", () => {
	const runtime = atHall();
	expect(
		runtime.view().player?.goals.map((goal) => [goal.id, goal.status]),
	).toEqual([
		["arrive", "done"],
		["answer", "current"],
	]);
	const hour = promise(runtime);
	expect(runtime.view().player?.goals.at(-1)).toMatchObject({
		id: "objection",
		status: "current",
	});
	speechDiagnostics(runtime, (cut) => {
		const offer = speechCandidate(runtime, "ask", ["modified"]);
		const noCounter = runtime.export();
		expect(() =>
			runtime.intervene({
				kind: "player-speak",
				actorId: offer.actorId,
				affordanceId: offer.affordanceId,
				mode: "ask",
				acceptCounter: true,
			}),
		).toThrow(/no counter-offer/);
		expect(runtime.export()).toEqual(noCounter);
		runtime.intervene({
			kind: "player-speak",
			actorId: offer.actorId,
			affordanceId: offer.affordanceId,
			mode: "ask",
		});
		cut("immediately-after-first-intervene", true);
		const { request: first } = nativeAnswer(runtime);
		assertSpeechTrial(runtime, offer);
		expect(first.answer.verdict).toBe("modified");
		const counter = required(
			first.answer.counterOffer?.affordanceId,
			"Missing real counter affordance",
		);
		expect(counter).not.toBe(offer.affordanceId);
		const other = required(
			runtime
				.view()
				.player?.present.find((person) => person.id !== offer.actorId),
			"Need a second present person for wrong-target refusal",
		);
		const otherOffer = required(
			runtime.predictSpeech(other.id).offers[0],
			"Need a real eligible offer from the wrong target",
		);
		const wrongTarget = runtime.export();
		expect(() =>
			runtime.intervene({
				kind: "player-speak",
				actorId: other.id,
				affordanceId: otherOffer.affordanceId,
				mode: "ask",
				acceptCounter: true,
			}),
		).toThrow(/no counter-offer/);
		expect(runtime.export()).toEqual(wrongTarget);
		const wrong = runtime.export();
		expect(() =>
			runtime.intervene({
				kind: "player-speak",
				actorId: offer.actorId,
				affordanceId: offer.affordanceId,
				mode: "ask",
				acceptCounter: true,
			}),
		).toThrow();
		expect(runtime.export()).toEqual(wrong);
		cut("pre-accept", true);
		// This modified answer already started the counter activity. Acceptance
		// records a new decision; it must not claim or replace that earlier start.
		expect(first.status).toBe("counter-started");
		const firstStartedEvent = required(first.startedEvent, "Missing old start");
		const firstDecision = structuredClone(
			required(first.decision, "Missing original counter decision"),
		);
		const existingJob = structuredClone(
			required(runtime.actor(offer.actorId).job, "Missing started counter job"),
		);
		const existingActivity = structuredClone(
			required(
				runtime.s.owner.actor(offer.actorId).activity,
				"Missing started native counter activity",
			),
		);
		expect(existingJob.event).toBe(firstStartedEvent);
		expect(firstDecision.chosenAffordanceId).toBe(counter);
		runtime.intervene({
			kind: "player-speak",
			actorId: offer.actorId,
			affordanceId: counter,
			mode: "ask",
			acceptCounter: true,
		});
		cut("post-actual-accept-and-settle", true);
		const { request: accepted } = nativeAnswer(runtime);
		expect(accepted.answer.verdict).toBe("assented");
		expect(accepted.accepts).toBe(first.id);
		expect(first.status).toBe("counter-started");
		expect(first.startedEvent).toBe(firstStartedEvent);
		expect(first.decision).toEqual(firstDecision);
		expect(accepted.status).toBe("decided");
		expect(accepted.startedEvent).toBeUndefined();
		const acceptanceDecision = required(
			accepted.decision,
			"Missing acceptance decision",
		);
		expect(acceptanceDecision.answer.verdict).toBe("assented");
		expect(acceptanceDecision.chosenAffordanceId).toBe(counter);
		expect(acceptanceDecision.event).not.toBe(firstDecision.event);
		expect(runtime.actor(offer.actorId).job).toEqual(existingJob);
		expect(runtime.s.owner.actor(offer.actorId).activity).toEqual(
			existingActivity,
		);
		const player = required(runtime.view().player, "Missing player");
		const visible = required(
			player.requests.find((request) => request.id === accepted.id),
			"Missing accepted view",
		);
		const receipt = required(
			recordedAcceptance(visible, player.journal),
			"Missing correlated acceptance journal",
		);
		expect(receipt.sourceEventIds).toContain(accepted.answerEvent);
		expect(
			recordedAcceptance({ ...visible, id: first.id }, player.journal),
		).toBeUndefined();
		expect(recordedAcceptance(visible, [])).toBeUndefined();
		expect(
			recordedAcceptance(
				{ ...visible, targetId: other.id, targetName: other.name },
				player.journal,
			),
		).toBeUndefined();
		const objection = required(
			runtime.s.player?.goals.find((goal) => goal.id === "objection"),
			"Missing actual objection goal",
		);
		expect(objection.eventIds).toContain(first.answerEvent);
		expect(objection.eventIds).toContain(accepted.answerEvent);
		expect(hour.status).toBe("open");
		expect(hour.madeAt).toBeLessThan(objection.doneAt);
		expect(runtime.view().player?.goals.at(-1)).toMatchObject({
			id: "pledge",
			status: "current",
		});
		runtime.intervene({ kind: "player-work", pledgeId: hour.id });
		stepUntil(runtime, () => hour.status === "kept", 12);
		const goal = required(
			runtime.s.player?.goals.find((item) => item.id === "pledge"),
			"Earlier promise must count after actual completion",
		);
		expect(goal.eventIds).toEqual([hour.event, hour.resolvedEvent]);
		journalAncestry(runtime);
	});
});

it("holds a real deferred counter without interrupting the current job before the resident's own next decision", () => {
	const runtime = atHall();
	speechDiagnostics(runtime, (cut) => {
		const offer = speechCandidate(runtime, "ask", ["deferred"]);
		runtime.intervene({
			kind: "player-speak",
			actorId: offer.actorId,
			affordanceId: offer.affordanceId,
			mode: "ask",
		});
		cut("immediately-after-first-intervene", true);
		const { request: first } = nativeAnswer(runtime);
		assertSpeechTrial(runtime, offer);
		expect(first.answer.verdict).toBe("deferred");
		const counter = required(
			first.answer.counterOffer?.affordanceId,
			"Missing actual deferred counter",
		);
		const job = structuredClone(
			required(runtime.actor(offer.actorId).job, "Need real current activity"),
		);
		const activity = runtime.s.owner.actor(offer.actorId).activity;
		cut("pre-accept", true);
		runtime.intervene({
			kind: "player-speak",
			actorId: offer.actorId,
			affordanceId: counter,
			mode: "ask",
			acceptCounter: true,
		});
		cut("post-actual-accept-and-settle", true);
		const { request: accepted } = nativeAnswer(runtime);
		expect(accepted.answer.verdict).not.toBe("refused");
		expect(accepted.accepts).toBe(first.id);
		expect(accepted.waits).toBe(true);
		expect(accepted.status).toBe("held");
		expect(accepted.decision).toBeUndefined();
		expect(runtime.actor(offer.actorId).job).toEqual(job);
		expect(runtime.s.owner.actor(offer.actorId).activity?.startedAt).toBe(
			activity?.startedAt,
		);
		expect(
			runtime.s.owner.actor(offer.actorId).activity?.interrupt,
		).toBeUndefined();
		const player = required(runtime.view().player, "Missing player");
		expect(
			recordedAcceptance(
				required(
					player.requests.find((item) => item.id === accepted.id),
					"Missing held view",
				),
				player.journal,
			),
		).toBeDefined();
		stepUntil(runtime, () => accepted.decision !== undefined, 16);
		// Bind this pending request once at the first actual free choice.
		const waitArchive = runtime.export().owner.run;
		const waitInputs = readRunHistory(waitArchive).flatMap(
			(entry) => entry.inputs,
		);
		const waitAdviceId = `player-wait:${accepted.id}`;
		const waitAdvice = waitInputs.filter(
			(input) =>
				input.kind === "suggestion.received" &&
				input.payload.person === accepted.targetId &&
				input.payload.received.kind === "ordinary" &&
				input.payload.received.suggestion.adviceId === waitAdviceId,
		);
		expect(waitAdvice).toHaveLength(1);
		const waitInput = required(waitAdvice[0], "Missing native held-wait input");
		if (
			waitInput.kind !== "suggestion.received" ||
			waitInput.payload.received.kind !== "ordinary"
		)
			throw Error("Wrong held-wait input kind");
		const originalInput = required(
			waitInputs.find(
				(input) =>
					input.kind === "suggestion.received" &&
					input.at === Math.round(accepted.at * 60000) + 1 &&
					input.payload.person === accepted.targetId &&
					input.payload.received.kind === "ordinary" &&
					input.payload.received.suggestion.voiceId === "player",
			),
			"Missing original native player suggestion",
		);
		if (
			originalInput.kind !== "suggestion.received" ||
			originalInput.payload.received.kind !== "ordinary"
		)
			throw Error("Wrong original suggestion kind");
		expect(waitInput.payload.received.suggestion).toMatchObject({
			adviceId: waitAdviceId,
			voiceId: "player",
			affordanceId: accepted.affordanceId,
			strength: originalInput.payload.received.suggestion.strength,
			since: Math.round(accepted.at * 60000),
		});
		expect(waitInput.payload.received.suggestion.insist).toBeUndefined();
		const oldActivity = required(activity, "Missing old native activity");
		const finishes = waitInputs.filter(
			(input) =>
				input.kind === "action.resolved" &&
				input.payload.person === accepted.targetId &&
				input.payload.activityId === oldActivity.id &&
				input.payload.stage === "finish" &&
				input.payload.disposition === "completed",
		);
		expect(finishes).toHaveLength(1);
		const finished = required(
			finishes[0],
			"Missing actual completed old activity",
		);
		expect(finished.at).toBeGreaterThanOrEqual(oldActivity.endsAt);
		expect(finished.at).toBeLessThan(waitInput.at);
		expect(
			waitInputs.some(
				(input) =>
					input.kind === "action.resolved" &&
					input.payload.activityId === oldActivity.id &&
					input.payload.stage === "interrupt",
			),
		).toBe(false);
		const waitCurrent = runtime.s.owner.current;
		expect(
			waitCurrent.receipts.inputs.some((input) => input.id === waitInput.id),
		).toBe(true);
		expect(waitCurrent.receipts.dispositions).toContainEqual(
			expect.objectContaining({
				inputId: waitInput.id,
				at: waitInput.at,
				kind: "consumed",
				reason: "applied",
			}),
		);
		const freeEvent = required(
			waitCurrent.events.find(
				(event) =>
					event.person === accepted.targetId &&
					event.at > finished.at &&
					event.data.kind === "decision",
			),
			"Missing first actual free decision",
		);
		if (freeEvent.data.kind !== "decision")
			throw Error("Wrong free event kind");
		const freeDecision = freeEvent.data.decision;
		expect(freeDecision.at).toBe(waitInput.at);
		expect(freeDecision.review).toBeUndefined();
		expect(freeDecision.interrupt).toBeUndefined();
		expect(freeEvent.causeIds).toContain(waitInput.id);
		const ordinaryInput = required(
			waitInputs.find(
				(input) =>
					input.kind === "decision.requested" &&
					input.at === waitInput.at &&
					input.payload.person === accepted.targetId &&
					input.payload.reason === "ordinary town opportunities" &&
					input.payload.treatment === "ordinary",
			),
			"Missing existing ordinary free-choice request",
		);
		if (ordinaryInput.kind !== "decision.requested")
			throw Error("Wrong ordinary request kind");
		expect(waitInputs.indexOf(waitInput)).toBeLessThan(
			waitInputs.indexOf(ordinaryInput),
		);
		expect(freeEvent.causeIds).toContain(ordinaryInput.id);
		expect(
			waitInputs.some(
				(input) =>
					input.kind === "offers.received" &&
					input.at === waitInput.at &&
					input.payload.person === accepted.targetId &&
					input.payload.revision === ordinaryInput.payload.offerRevision &&
					waitInputs.indexOf(input) < waitInputs.indexOf(waitInput),
			),
		).toBe(true);
		const waitResolution = required(
			waitCurrent.events.find(
				(event) =>
					event.person === accepted.targetId &&
					event.data.kind === "suggestion-resolved" &&
					event.data.adviceId === waitAdviceId &&
					event.data.decisionId === freeDecision.id,
			),
			"Missing resolution of this exact pending advice",
		);
		if (waitResolution.data.kind !== "suggestion-resolved")
			throw Error("Wrong pending resolution kind");
		expect(waitResolution.at).toBe(freeDecision.at);
		expect(waitResolution.causeIds).toContain(waitInput.id);
		expect(waitResolution.data.resolution.voiceId).toBe("player");
		expect(
			freeDecision.suggestions ?? [freeDecision.suggestion],
		).toContainEqual(waitResolution.data.resolution);
		const hostDecision = required(
			accepted.decision,
			"Missing correlated host decision",
		);
		expect(Math.round(hostDecision.at * 60000)).toBe(freeDecision.at);
		expect(hostDecision.chosenAffordanceId).toBe(
			freeDecision.chosenAffordanceId ?? "",
		);
		expect(hostDecision.answer.verdict).toBe(
			waitResolution.data.resolution.verdict,
		);
		expect(
			runtime.s.player?.log.find((event) => event.id === hostDecision.event),
		).toMatchObject({
			kind: "player-decided",
			targetId: accepted.targetId,
			causes: [accepted.id, accepted.answerEvent],
		});

		expect(
			required(accepted.decision, "Missing own next decision").at,
		).toBeGreaterThanOrEqual(job.end);
	});
});

it("keeps both public urges ordinary and binds only the second actual physical start", () => {
	const runtime = atHall();
	expect(runtime.s.seed).toBe(42);
	expect(runtime.s.people).toHaveLength(6);
	expect(runtime.s.round).toBe(4);
	expect(
		runtime.view().player?.present.some((person) => person.id === "ada"),
	).toBe(true);
	expect(
		runtime
			.predictSpeech("ada")
			.offers.some((offer) => offer.affordanceId === "open-section"),
	).toBe(true);
	expect(runtime.actor("ada").job?.offer.id).not.toBe("open-section");
	runtime.intervene({
		kind: "player-speak",
		actorId: "ada",
		affordanceId: "open-section",
		mode: "urge",
	});
	const request = required(
		runtime.s.player?.requests.at(-1),
		"Missing actual request",
	);
	const at = Math.round(request.at * 60000) + 1;
	const inputs = readRunHistory(runtime.export().owner.run)
		.flatMap((entry) => entry.inputs)
		.filter((input) => input.at === at);
	const book = required(
		inputs.find(
			(input) =>
				input.kind === "offers.received" && input.payload.person === "ada",
		),
		"Missing actual offer book",
	);
	if (book.kind !== "offers.received") throw Error("Wrong offer book kind");
	expect(book.payload.offers.some((offer) => offer.id === "open-section")).toBe(
		true,
	);
	const received = inputs.filter(
		(input) =>
			(input.kind === "suggestion.received" ||
				input.kind === "coercion.received") &&
			input.payload.person === "ada",
	);
	expect(received).toHaveLength(1);
	const input = required(received[0], "Missing actual player input");
	expect(input.kind).toBe("suggestion.received");
	if (
		input.kind !== "suggestion.received" ||
		input.payload.received.kind !== "ordinary"
	)
		throw Error("Urge must be an ordinary suggestion");
	expect(input.source).toEqual(book.source);
	expect(input.payload.received.suggestion).toMatchObject({
		voiceId: "player",
		affordanceId: "open-section",
		strength: 0.35,
		insist: true,
		since: at,
	});
	expect(input.payload.received.suggestion.adviceId).toBeTruthy();
	expect(
		inputs.some(
			(item) =>
				item.kind === "coercion.received" && item.payload.person === "ada",
		),
	).toBe(false);
	const decision = required(
		runtime.s.owner.actor("ada").trace.findLast((item) => item.at === at),
		"Missing actual native decision",
	);
	const answer = required(
		(
			decision.suggestions ?? (decision.suggestion ? [decision.suggestion] : [])
		).find((item) => item.voiceId === "player"),
		"Missing actual native answer",
	);
	const adviceId = input.payload.received.suggestion.adviceId;
	const resolution = required(
		runtime.s.owner.current.events.find(
			(event) =>
				event.person === "ada" &&
				event.data.kind === "suggestion-resolved" &&
				event.data.adviceId === adviceId &&
				event.data.decisionId === decision.id,
		),
		"Missing actual advice resolution",
	);
	expect(resolution.causeIds).toContain(input.id);
	expect(request.answer.verdict).toBe(answer.verdict);
	expect(request.answer.verdict).not.toBe("commanded");
	expect(request.answer.counterOffer).toEqual(answer.counterOffer);
	expect(request.targetId).toBe("ada");
	expect(request.affordanceId).toBe("open-section");
	expect(request.mode).toBe("urge");
	const log = required(runtime.s.player, "Missing player state").log;
	expect(log.find((event) => event.id === request.answerEvent)).toMatchObject({
		kind: "player-answer",
		targetId: "ada",
		causes: [request.id],
	});
	// One fixed two-input control; selection and physical work remain distinct.
	// The original one-input physical premise remains RED in its retained packet.
	expect(answer.verdict).toBe("assented");
	expect(decision.chosenAffordanceId).toBe("open-section");
	expect(request.status).toBe("decided");
	expect(request.startedEvent).toBeUndefined();
	expect(runtime.actor("ada").job).toBeUndefined();
	expect(runtime.s.owner.actor("ada").activity).toBeNull();
	expect(runtime.s.pending).toEqual([]);
	expect(runtime.s.owner.pending).toEqual([]);
	const firstHistory = readRunHistory(runtime.export().owner.run).flatMap(
		(entry) => entry.inputs,
	);
	const interruption = required(
		firstHistory.find(
			(item) =>
				item.kind === "action.resolved" &&
				item.payload.person === "ada" &&
				item.payload.stage === "interrupt" &&
				item.at === decision.at,
		),
		"Missing actual first interruption receipt",
	);
	if (interruption.kind !== "action.resolved")
		throw Error("Wrong interruption receipt");
	expect(interruption.payload.disposition).toBe("interrupted");
	expect(
		firstHistory.some(
			(item) =>
				item.kind === "action.resolved" &&
				item.payload.person === "ada" &&
				item.payload.stage === "start" &&
				item.payload.disposition === "accepted" &&
				item.at >= decision.at,
		),
	).toBe(false);
	expect(
		runtime
			.predictSpeech("ada")
			.offers.some((offer) => offer.affordanceId === "open-section"),
	).toBe(true);
	const beforeIds = new Set(firstHistory.map((item) => item.id));
	const secondRound = runtime.s.round;
	const beforeNativeAt = runtime.s.owner.at;
	// Exactly one further public input, before any ordinary round. No previewed answer.
	runtime.intervene({
		kind: "player-speak",
		actorId: "ada",
		affordanceId: "open-section",
		mode: "urge",
	});
	const second = required(
		runtime.s.player?.requests.at(-1),
		"Missing second public request",
	);
	expect(second.id).not.toBe(request.id);
	expect(runtime.s.round).toBe(secondRound);
	const newInputs = readRunHistory(runtime.export().owner.run)
		.flatMap((entry) => entry.inputs)
		.filter((item) => !beforeIds.has(item.id));
	const adviceInputs = newInputs.filter(
		(item) =>
			(item.kind === "suggestion.received" ||
				item.kind === "coercion.received") &&
			item.payload.person === "ada",
	);
	expect(adviceInputs).toHaveLength(1);
	const secondInput = required(
		adviceInputs[0],
		"Missing second accepted advice input",
	);
	if (
		secondInput.kind !== "suggestion.received" ||
		secondInput.payload.received.kind !== "ordinary"
	)
		throw Error("Second URGE must remain ordinary advice");
	const secondAdvice = secondInput.payload.received.suggestion;
	expect(secondInput.at).toBeGreaterThan(beforeNativeAt);
	expect(secondAdvice).toMatchObject({
		voiceId: "player",
		affordanceId: "open-section",
		strength: 0.35,
		insist: true,
		since: secondInput.at,
	});
	expect(secondAdvice.adviceId).toBeTruthy();
	expect(secondAdvice.adviceId).not.toBe(adviceId);
	const secondResolution = required(
		runtime.s.owner.current.events.find(
			(event) =>
				event.person === "ada" &&
				event.data.kind === "suggestion-resolved" &&
				event.data.adviceId === secondAdvice.adviceId,
		),
		"Missing second advice resolution",
	);
	if (secondResolution.data.kind !== "suggestion-resolved")
		throw Error("Wrong second resolution");
	expect(secondResolution.causeIds).toContain(secondInput.id);
	const secondDecisionId = secondResolution.data.decisionId;
	const secondDecision = required(
		runtime.s.owner
			.actor("ada")
			.trace.find((item) => item.id === secondDecisionId),
		"Missing second native decision",
	);
	expect(secondDecision.at).toBe(secondInput.at);
	const secondAnswer = required(
		(
			secondDecision.suggestions ??
			(secondDecision.suggestion ? [secondDecision.suggestion] : [])
		).find((item) => item.voiceId === "player"),
		"Missing second native answer",
	);
	expect(second.answer.verdict).toBe(secondAnswer.verdict);
	expect(second.answer.verdict).not.toBe("commanded");
	expect(second.answer.counterOffer).toEqual(secondAnswer.counterOffer);
	expect(second).toMatchObject({
		targetId: "ada",
		affordanceId: "open-section",
		mode: "urge",
	});
	expect(
		runtime.s.player?.log.find((event) => event.id === second.answerEvent),
	).toMatchObject({
		kind: "player-answer",
		targetId: "ada",
		causes: [second.id],
	});
	const secondDecisionEvent = required(
		runtime.s.owner.current.events.find(
			(event) =>
				event.person === "ada" &&
				event.data.kind === "decision" &&
				event.data.decision.id === secondDecision.id,
		),
		"Missing second native decision event",
	);
	expect(secondDecisionEvent.causeIds).toContain(secondInput.id);
	const explicitDecision = required(
		newInputs.find(
			(item) =>
				item.kind === "decision.requested" &&
				item.payload.person === "ada" &&
				item.at === secondInput.at,
		),
		"Missing second explicit decision input",
	);
	expect(secondDecisionEvent.causeIds).toContain(explicitDecision.id);
	const events = [...runtime.s.owner.current.events];
	// A refusal or another choice is a negative diagnostic, never a forced start.
	expect(
		secondDecision.chosenAffordanceId,
		JSON.stringify({ second, secondInput, secondDecision }),
	).toBe("open-section");
	for (let round = 0; round < 4 && second.status !== "started"; round++) {
		runtime.step();
		events.push(...runtime.s.owner.current.events);
	}
	expect(runtime.s.round - secondRound).toBeLessThanOrEqual(4);
	expect(
		second.status,
		JSON.stringify({
			second,
			job: runtime.actor("ada").job,
			activity: runtime.s.owner.actor("ada").activity,
		}),
	).toBe("started");
	const job = required(
		runtime.actor("ada").job,
		"Missing actual second chosen physical start",
	);
	const native = required(
		runtime.s.owner.actor("ada").activity,
		"Missing actual second native activity",
	);
	expect(job.offer.id).toBe("open-section");
	expect(native.offer.id).toBe(job.offer.id);
	expect(native.decisionId).toBe(secondDecision.id);
	expect(job.activityId).toBe(native.id);
	expect(job.startedAt).toBe(native.startedAt);
	expect(second.startedEvent).toBe(job.event);
	const startEvent = required(
		events.find(
			(event) =>
				event.person === "ada" &&
				event.data.kind === "action-requested" &&
				event.data.request.activityId === native.id &&
				event.data.request.stage === "start",
		),
		"Missing actual native start request",
	);
	if (startEvent.data.kind !== "action-requested")
		throw Error("Wrong start event");
	const startRequest = startEvent.data.request;
	expect(startRequest.offerId).toBe("open-section");
	expect(startEvent.causeIds).toContain(secondInput.id);
	expect(startEvent.causeIds).toContain(explicitDecision.id);
	const actualBook = required(
		newInputs.find(
			(item) =>
				item.kind === "offers.received" &&
				item.payload.person === "ada" &&
				item.payload.revision === startRequest.offerRevision,
		),
		"Missing second actual offer revision",
	);
	if (actualBook.kind !== "offers.received") throw Error("Wrong second book");
	if (explicitDecision.kind !== "decision.requested")
		throw Error("Wrong second decision input");
	expect(explicitDecision.payload.offerRevision).toBe(
		actualBook.payload.revision,
	);
	expect(actualBook.at).toBe(secondInput.at);
	expect(actualBook.source).toEqual(secondInput.source);
	expect(
		actualBook.payload.offers.some((offer) => offer.id === "open-section"),
	).toBe(true);
	const receipt = required(
		readRunHistory(runtime.export().owner.run)
			.flatMap((entry) => entry.inputs)
			.find(
				(item) =>
					item.kind === "action.resolved" &&
					item.payload.requestId === startRequest.id,
			),
		"Missing accepted physical receipt",
	);
	if (receipt.kind !== "action.resolved") throw Error("Wrong start receipt");
	expect(receipt.at).toBe(startRequest.boundaryAt);
	expect(receipt.payload).toMatchObject({
		person: "ada",
		activityId: native.id,
		stage: "start",
		disposition: "accepted",
		requestHash: startRequest.requestHash,
		worldRevision: startRequest.worldRevision,
	});
	const settled = required(
		events.find(
			(event) =>
				event.person === "ada" &&
				event.data.kind === "action-settled" &&
				event.data.requestId === startRequest.id,
		),
		"Missing native acceptance event",
	);
	expect(settled.causeIds).toContain(receipt.id);
	const hostIds = new Set(
		[
			...required(runtime.s.player, "Missing player").log,
			...runtime.s.events,
		].map((event) => event.id),
	);
	for (const id of [
		second.id,
		second.answerEvent,
		second.decision?.event,
		second.startedEvent,
	])
		expect(hostIds.has(required(id, "Missing second host ancestry"))).toBe(
			true,
		);
	// The first request's choice is still not a physical-start receipt.
	expect(request.startedEvent).toBeUndefined();
	journalAncestry(runtime);
	const checkpoint = runtime.export();
	const cold = restoreRuntime(checkpoint);
	expect(cold.export()).toEqual(checkpoint);
	runtime.step();
	cold.step();
	expect(cold.export()).toEqual(runtime.export());
	expect(restoreRuntime(runtime.export()).export()).toEqual(runtime.export());
});
