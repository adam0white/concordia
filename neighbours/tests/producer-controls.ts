/** Test-only observers. Six-person seed42 controls are narrow engineering
 * fixtures, never replacements for the original 206-person whole-world gates.
 * Every call delegates to the real producer; no answer, choice or receipt is made up. */
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readRunHistory } from "@adam0white/human-framework";
import { expect } from "vitest";
import type { Intervention, SpeechAnswer } from "../src/contracts.ts";
import { overlapMinutes } from "../src/core/encounters.ts";
import { TownRunOwner } from "../src/core/hf4-owner.ts";
import { nativeMilliseconds } from "../src/core/hf4-run.ts";
import { required } from "../src/core/invariants.ts";
import type { PlayerMode } from "../src/core/player.ts";
import type { Runtime } from "../src/core/runtime.ts";
import { createRuntime } from "./current-town.ts";

export function atHall() {
	const runtime = createRuntime(42, 6);
	runtime.intervene({ kind: "player-move", placeId: "hall" });
	for (let round = 0; round < 4; round++) runtime.step();
	expect(runtime.view().player?.job).toBeUndefined();
	expect(runtime.view().player?.placeId).toBe("hall");
	return runtime;
}

/** Preregister before trials: first three present IDs, then first two legal
 * noncurrent offer IDs for each, in lexical order. At most six pairs per mode.
 * Actual fork trials select engineering components, not natural probabilities
 * or UI forecasts. Only the root-preregistered ASK assent / URGE refusal cases
 * use one fixed semantic pair. No seed/time extension or fallback is allowed. */
export function speechCandidate(
	runtime: Runtime,
	mode: PlayerMode,
	verdicts: readonly SpeechAnswer["verdict"][],
	pledge: Intervention["pledge"] = mode === "promise"
		? { work: "carry-meals" }
		: undefined,
	fixed?: { actorId: "ada"; affordanceId: "keep-closed" | "open-section" },
) {
	expect(runtime.s.seed).toBe(42);
	expect(runtime.s.people).toHaveLength(6);
	const before = runtime.export();
	const declared = fixed
		? []
		: [...(runtime.view().player?.present ?? [])]
				.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
				.slice(0, 3)
				.flatMap((person) =>
					runtime
						.predictSpeech(person.id)
						.offers.filter(
							(offer) =>
								offer.affordanceId !== runtime.actor(person.id).job?.offer.id,
						)
						.sort((a, b) =>
							a.affordanceId < b.affordanceId
								? -1
								: a.affordanceId > b.affordanceId
									? 1
									: 0,
						)
						.slice(0, 2)
						.map((offer) => ({ actorId: person.id, ...offer })),
				);
	// Root preregistered only ASK assent and URGE refusal. No fallback list.
	const trials = fixed
		? (() => {
				expect(
					runtime.view().player?.present.some((p) => p.id === fixed.actorId),
					"Fixed-pair prerequisite: Nora must actually be present",
				).toBe(true);
				const offer = required(
					runtime
						.predictSpeech(fixed.actorId)
						.offers.find((item) => item.affordanceId === fixed.affordanceId),
					"Fixed-pair prerequisite: actual legal offer missing; stop",
				);
				expect(offer.affordanceId).not.toBe(
					runtime.actor(fixed.actorId).job?.offer.id,
				);
				return [{ actorId: fixed.actorId, ...offer }];
			})()
		: declared;
	expect(trials.length).toBeLessThanOrEqual(6);
	const actualVerdicts: unknown[] = [];
	expect(runtime.export()).toEqual(before);
	const hook = TownRunOwner.onStepRequest;
	try {
		// A trial must not publish to an unrelated engineering sink.
		TownRunOwner.onStepRequest = undefined;
		for (const offer of trials) {
			let trial: Runtime | undefined = runtime.fork();
			try {
				expect(
					trial.export(),
					"Exact fork checkpoint required; no shim",
				).toEqual(before);
				const input: Intervention = {
					kind: "player-speak",
					actorId: offer.actorId,
					affordanceId: offer.affordanceId,
					mode,
					...(pledge ? { pledge } : {}),
				};
				trial.intervene(input);
				const { request, decision } = nativeAnswer(trial);
				actualVerdicts.push({
					input,
					request: structuredClone(request),
					decision: {
						id: decision.id,
						at: decision.at,
						chosenAffordanceId: decision.chosenAffordanceId,
						suggestions: decision.suggestions,
						suggestion: decision.suggestion,
					},
				});
				if (verdicts.includes(request.answer.verdict)) {
					return {
						...offer,
						input,
						answer: structuredClone(request.answer),
						after: trial.export(),
					};
				}
			} finally {
				// Runtime/Run forks own no external resource or disposal API.
				trial = undefined;
				expect(
					runtime.export(),
					"Selection changed the complete original",
				).toEqual(before);
			}
		}
		const evidence = JSON.stringify({ trials, actualVerdicts });
		if (new TextEncoder().encode(evidence).length > 1_000_000)
			throw Error("Complete candidate evidence exceeds cap; FAIL STOP");
		throw Error(
			`Producer prerequisite: no genuine ${mode} ${verdicts.join("/")} in ${fixed ? "fixed one-pair policy (FAIL STOP)" : "declared max-six list"} ${evidence}`,
		);
	} finally {
		TownRunOwner.onStepRequest = hook;
		expect(runtime.export()).toEqual(before);
	}
}

/** Execute exactly the selected input on the original. Native proof remains a
 * separate requirement; full equality includes RNG, history, queues/counters. */
export function assertSpeechTrial(
	runtime: Runtime,
	trial: ReturnType<typeof speechCandidate>,
) {
	const request = lastRequest(runtime);
	expect(request.targetId).toBe(trial.input.actorId);
	expect(request.affordanceId).toBe(trial.input.affordanceId);
	expect(request.mode).toBe(trial.input.mode);
	expect(request.answer.verdict).toBe(trial.answer.verdict);
	expect(request.answer.counterOffer).toEqual(trial.answer.counterOffer);
	const actual = runtime.export();
	expect(actual.inputs.at(-1)).toEqual({ op: "intervene", input: trial.input });
	expect(
		actual,
		"Actual fork/original equality required; stop on mismatch",
	).toEqual(trial.after);
}

export function lastRequest(runtime: Runtime) {
	return required(
		runtime.s.player?.requests.at(-1),
		"Missing actual player request",
	);
}

/** Bind the host answer to its exact public decision and received offer book,
 * rather than treating a host journal line as native consent. Speech ingress
 * uses the owner's published +1ms frame; the host request retains its prior time. */
export function nativeAnswer(runtime: Runtime) {
	const request = lastRequest(runtime);
	const decision = required(
		runtime.s.owner
			.actor(request.targetId)
			.trace.findLast(
				(record) =>
					record.at === nativeMilliseconds(request.at) + 1 &&
					(
						record.suggestions ?? (record.suggestion ? [record.suggestion] : [])
					).some((answer) => answer.voiceId === "player"),
			),
		"Missing native player advice decision at the actual request time",
	);
	const answer = required(
		(
			decision.suggestions ?? (decision.suggestion ? [decision.suggestion] : [])
		).find((answer) => answer.voiceId === "player"),
		"Missing actual native answer",
	);
	expect(request.answer.verdict).toBe(answer.verdict);
	expect(request.answer.counterOffer).toEqual(answer.counterOffer);
	const inputs = readRunHistory(runtime.export().owner.run)
		.flatMap((entry) => entry.inputs)
		.filter((input) => input.at === decision.at);
	expect(
		inputs.some(
			(input) =>
				input.kind === "offers.received" &&
				input.payload.person === request.targetId &&
				input.payload.offers.length > 0 &&
				input.payload.offers.some((offer) => offer.id === request.affordanceId),
		),
	).toBe(true);
	expect(
		inputs.some(
			(input) =>
				input.kind === "suggestion.received" &&
				input.payload.person === request.targetId &&
				input.payload.received.kind === "ordinary" &&
				input.payload.received.suggestion.voiceId === "player" &&
				input.payload.received.suggestion.affordanceId ===
					request.affordanceId &&
				(input.payload.received.suggestion.insist === true) ===
					(request.mode === "urge"),
		),
	).toBe(true);
	expect(
		inputs.some(
			(input) =>
				input.kind === "coercion.received" &&
				input.payload.person === request.targetId &&
				input.payload.offerId === request.affordanceId,
		),
	).toBe(false);
	return { request, decision, answer };
}

export function stepUntil(
	runtime: Runtime,
	done: () => boolean,
	rounds: number,
	failure?: () => string,
) {
	for (let round = 0; round < rounds && !done(); round++) runtime.step();
	expect(
		done(),
		`Producer prerequisite not reached within ${rounds} actual rounds${!done() && failure ? `\n${failure()}` : ""}`,
	).toBe(true);
}

/** Diagnostic delegation only. Original status assertions and wait predicates
 * retain authority. Full checkpoints are retained at named cuts only, privately
 * on failure. The error contains bounded IDs/causes, never the native hash map. */
export function speechDiagnostics(
	runtime: Runtime,
	run: (cut: (label: string, checkpoint?: boolean) => void) => void,
) {
	const owner = runtime.s.owner;
	const advance = owner.advance;
	const step = runtime.step;
	const rows: unknown[] = [];
	const checkpoints: { label: string; value: ReturnType<Runtime["export"]> }[] =
		[];
	const traces = new Map(
		Object.entries(owner.current.people).map(([id, actor]) => [
			id,
			actor.trace.length,
		]),
	);
	const acceptedIds = new Set<string>();
	const cut = (label: string, checkpoint = false) => {
		const current = owner.current;
		const targetIds = Object.keys(current.people);
		rows.push(
			structuredClone({
				label,
				hostAt: runtime.s.now,
				round: runtime.s.round,
				nativeAt: current.at,
				requests: runtime.s.player?.requests,
				requestObservations: runtime.s.player?.requests.map((request) => ({
					id: request.id,
					state:
						request.status === "dropped" && !request.decision
							? "dropped-without-decision"
							: request.waits &&
									!request.decision &&
									runtime.actor(request.targetId).job
								? "still-busy"
								: "consult-actual-choices-and-suggestions",
				})),
				submittedForLastActualStep: owner.lastRequest?.inputs.map(
					({ id, at, kind }) => ({
						id,
						at,
						kind,
						accepted: acceptedIds.has(id),
					}),
				),
				targets: targetIds.map((id) => ({
					id,
					job: runtime.actor(id).job,
					activity: current.people[id]?.activity,
					review: current.people[id]?.review,
					offers: current.offers[id],
					choices: current.people[id]?.trace
						.slice(traces.get(id) ?? 0)
						.map((decision) => ({
							id: decision.id,
							at: decision.at,
							chosenAffordanceId: decision.chosenAffordanceId,
							suggestions: decision.suggestions,
							suggestion: decision.suggestion,
						})),
				})),
				// Scheduled queue is public current. Submitted-but-not-accepted owner
				// inputs are identified separately at the actual advance below.
				scheduled: current.queue.map(({ id, at }) => ({ id, at })),
			}),
		);
		for (const [id, actor] of Object.entries(current.people))
			traces.set(id, actor.trace.length);
		if (checkpoint) checkpoints.push({ label, value: runtime.export() });
	};
	owner.advance = function (...args) {
		const result = advance.apply(this, args);
		const current = this.current;
		for (const input of this.lastRequest?.inputs ?? [])
			acceptedIds.add(input.id);
		rows.push(
			structuredClone({
				label: "actual-native-step",
				hostAt: runtime.s.now,
				nativeAt: current.at,
				until: this.lastRequest?.until,
				inputs: this.lastRequest?.inputs.map((input) => ({
					id: input.id,
					at: input.at,
					kind: input.kind,
					source: input.source,
					payload:
						input.kind === "offers.received"
							? {
									person: input.payload.person,
									revision: input.payload.revision,
									offers: input.payload.offers.map(({ id, actionId }) => ({
										id,
										actionId,
									})),
								}
							: input.kind === "action.resolved"
								? {
										requestId: input.payload.requestId,
										person: input.payload.person,
										activityId: input.payload.activityId,
										stage: input.payload.stage,
										disposition: input.payload.disposition,
									}
								: input.payload,
					accepted: true,
				})),
				boundary: result.boundary,
				rootEvents: result.events.map(({ id, at, person, causeIds, data }) => ({
					id,
					at,
					person,
					causeIds,
					data:
						data.kind === "input-disposed" ||
						data.kind === "suggestion-resolved"
							? data
							: { kind: data.kind },
				})),
				dispositions: result.events.flatMap((event) =>
					event.data.kind === "input-disposed" ? [event.data.disposition] : [],
				),
				choices: result.events.flatMap((event) => {
					if (event.data.kind !== "decision") return [];
					const decision = event.data.decision;
					return [
						{
							person: event.person,
							id: decision.id,
							at: decision.at,
							chosenAffordanceId: decision.chosenAffordanceId,
							suggestions: decision.suggestions,
							suggestion: decision.suggestion,
						},
					];
				}),
			}),
		);
		cut("post-native-step");
		return result;
	};
	runtime.step = function (...args) {
		try {
			return step.apply(this, args);
		} finally {
			cut("each-host-round");
		}
	};
	try {
		run(cut);
	} catch (error) {
		cut("failure");
		const directory = mkdtempSync(join(tmpdir(), "neighbours-speech-failure-"));
		chmodSync(directory, 0o700);
		const files = checkpoints.map(({ label, value }, index) => {
			const json = JSON.stringify(value);
			// Never print, shorten or silently omit a full cut. Cap failure is explicit.
			if (new TextEncoder().encode(json).length > 50 * 1024 * 1024)
				throw Error(`Private diagnostic checkpoint cap exceeded: ${label}`);
			const file = join(directory, `${index}-${label}.json`);
			writeFileSync(file, json, { mode: 0o600 });
			return { label, file };
		});
		const message = JSON.stringify({
			kind: "OBSERVATION_ONLY",
			statusCause: "UNKNOWN_UNTIL_TRACE",
			files,
			rows,
		});
		// The original complete JSON string is the wire contract. Normalize once
		// through JSON.parse, including omitted undefined fields and null entries.
		type Value =
			| null
			| boolean
			| number
			| string
			| Value[]
			| { [key: string]: Value };
		type Node =
			| ["p", null | boolean | number | string]
			| ["a", number[]]
			| ["o", [number, number][]];
		const nodes: Node[] = [];
		const interned = new Map<string, number>();
		const intern = (value: Value): number => {
			const node: Node =
				value === null || typeof value !== "object"
					? ["p", value]
					: Array.isArray(value)
						? ["a", value.map(intern)]
						: [
								"o",
								Object.entries(value).map(([key, entry]): [number, number] => [
									intern(key),
									intern(entry),
								]),
							];
			const key = JSON.stringify(node);
			const known = interned.get(key);
			if (known !== undefined) return known;
			const id = nodes.length;
			nodes.push(node);
			interned.set(key, id);
			return id;
		};
		// p holds a primitive; a holds ordered child IDs; o holds ordered
		// [string-key node ID, value node ID] pairs. No sorting or projection.
		const root = intern(JSON.parse(message));
		const encoded = JSON.stringify({
			codec: "neighbours-json-intern/1",
			root,
			nodes,
		});
		const wire = JSON.parse(encoded) as { root: number; nodes: Node[] };
		const decoded = new Map<number, Value>();
		const decode = (id: number): Value => {
			const cached = decoded.get(id);
			if (cached !== undefined) return cached;
			const node = required(wire.nodes[id], "Missing interned node");
			const value: Value =
				node[0] === "p"
					? node[1]
					: node[0] === "a"
						? node[1].map(decode)
						: Object.fromEntries(
								node[1].map(([key, entry]) => [decode(key), decode(entry)]),
							);
			decoded.set(id, value);
			return value;
		};
		if (JSON.stringify(decode(wire.root)) !== message)
			throw Error(
				`Lossless speech diagnostic round trip failed; checkpoints ${directory}`,
				{ cause: error },
			);
		const originalBytes = new TextEncoder().encode(message).length;
		const encodedBytes = new TextEncoder().encode(encoded).length;
		const file = join(directory, "diagnostic.json");
		const summary = `Speech diagnostic ${file}\noriginalBytes=${originalBytes} encodedBytes=${encodedBytes}`;
		if (encodedBytes > 1_048_576)
			throw Error(
				`Complete speech diagnostic exceeds 1MiB; FAIL STOP\n${summary}`,
				{ cause: error },
			);
		writeFileSync(file, encoded, { mode: 0o600 });
		throw Error(summary, { cause: error });
	} finally {
		owner.advance = advance;
		runtime.step = step;
	}
}

/** An observer around the unchanged public finish method, not a mock. Only
 * runtime.step calls it. Capture the actual frozen boundary before delegation;
 * require matching real native start and finish receipts after the step. */
export function finishObserver(
	runtime: Runtime,
	arm?: "ordinary" | "authored-open-hall",
) {
	const prepare = runtime.prepareBoundary;
	const apply = runtime.apply;
	const hook = TownRunOwner.onStepRequest;
	const advance = runtime.s.owner.advance;
	const rows: unknown[] = [];
	let bytes = 0;
	let omitted = 0;
	let dispositionCount = 0;
	const counts = new Map<
		string,
		{
			actor: string;
			action: string;
			offered: number;
			chosen: number;
			start: number;
			finish: number;
			interrupt: number;
		}
	>();
	const offerActions = new Map<string, string>();
	const requestActions = new Map<string, string>();
	let observedCurrent: TownRunOwner["current"] | undefined;
	const count = (actor: string, action: string) => {
		const key = JSON.stringify([actor, action]);
		let entry = counts.get(key);
		if (!entry) {
			entry = {
				actor,
				action,
				offered: 0,
				chosen: 0,
				start: 0,
				finish: 0,
				interrupt: 0,
			};
			counts.set(key, entry);
		}
		return entry;
	};
	const compactState = (current: TownRunOwner["current"]) => {
		return structuredClone({
			at: runtime.s.now,
			nativeAt: current.at,
			round: runtime.s.round,
			hall: runtime.s.hall,
			hallSafe: runtime.s.hallSafe,
			tools: runtime.s.tools,
			produced: runtime.s.produced,
			consumed: runtime.s.consumed,
			places: runtime.s.places.map(({ id, stock, reserved, capacity }) => ({
				id,
				stock,
				reserved,
				capacity,
			})),
			people: runtime.s.people.map((person) => ({
				id: person.id,
				place: person.place,
				wealth: person.wealth,
				job: person.job,
				body: Object.fromEntries(
					Object.entries(
						required(current.people[person.id], "Missing native compact person")
							.body,
					).filter(
						([, value]) =>
							value === null ||
							["number", "boolean", "string"].includes(typeof value),
					),
				),
				condition: (() => {
					const body = required(
						current.people[person.id],
						"Missing native compact condition",
					).body;
					return {
						downed: body.downed,
						doze: body.doze,
						bladder: body.bladder,
						injuries: body.injuries,
						illnesses: body.illnesses,
						exposures: body.exposures,
						lastSleep: body.lastSleep,
						lastDowned: body.lastDowned,
					};
				})(),
			})),
		});
	};
	let initial: ReturnType<typeof compactState> | undefined;
	let final: ReturnType<typeof compactState> | undefined;

	let frozen:
		| ReturnType<Runtime["export"]>["boundary"]["witnesses"]
		| undefined;
	// Reserve over 100 KiB for metadata, missing halves and JSON framing.
	const record = (row: unknown) => {
		const json = JSON.stringify(row);
		const size = new TextEncoder().encode(json).length + 1;
		if (bytes + size > 900_000) {
			omitted++;
			return;
		}
		bytes += size;
		rows.push(JSON.parse(json));
	};
	const ids = ["ada", "elin", "jo", "noor", "ravi", "sam"];
	const snapshot = () => {
		const current = runtime.s.owner.current;
		observedCurrent = current;
		const native = current.people;
		if (arm) {
			final = compactState(current);
			initial ??= final;
			for (const [id, book] of Object.entries(current.offers))
				for (const offer of book.offers)
					offerActions.set(JSON.stringify([id, offer.id]), offer.actionId);
		}
		const nativeDispositions =
			current.receipts.dispositions.slice(dispositionCount);
		dispositionCount = current.receipts.dispositions.length;
		expect(runtime.s.people.map((person) => person.id).sort()).toEqual(ids);
		expect(Object.keys(native).sort()).toEqual(ids);
		return {
			at: runtime.s.now,
			round: runtime.s.round,
			revision: current.world.revision,
			hall: runtime.s.hall,
			hallSafe: runtime.s.hallSafe,
			tools: runtime.s.tools,
			produced: runtime.s.produced,
			consumed: runtime.s.consumed,
			places: runtime.s.places.map(({ id, stock, reserved, capacity }) => ({
				id,
				stock,
				reserved,
				capacity,
			})),
			nativeDispositions,
			people: runtime.s.people.map((person) => {
				const actor = required(
					native[person.id],
					"Missing native observer person",
				);
				const activity = actor.activity;
				const chosen = actor.trace.at(-1);
				return {
					id: person.id,
					place: person.place,
					wealth: person.wealth,
					job: person.job,
					body: {
						alive: actor.body.alive,
						asleep: actor.body.asleep,
						downed: actor.body.downed,
						since: actor.body.since,
					},
					activity: activity
						? {
								id: activity.id,
								offerId: activity.offer.id,
								startedAt: activity.startedAt,
								endsAt: activity.endsAt,
								reviewAt: activity.reviewAt,
								interrupt: activity.interrupt,
							}
						: undefined,
					chosen: chosen
						? { at: chosen.at, chosenAffordanceId: chosen.chosenAffordanceId }
						: undefined,
				};
			}),
		};
	};
	if (arm) {
		runtime.s.owner.advance = function (...args) {
			const result = advance.apply(this, args);
			// A successful public step commits every submitted input. Inspect/current
			// receipt and trace windows are bounded; never count by their array length.
			for (const input of this.lastRequest?.inputs ?? []) {
				if (input.kind === "offers.received") {
					for (const offer of input.payload.offers) {
						offerActions.set(
							JSON.stringify([input.payload.person, offer.id]),
							offer.actionId,
						);
						count(input.payload.person, offer.actionId).offered++;
					}
				} else if (input.kind === "action.resolved") {
					const payload = input.payload;
					const action = required(
						payload.outcome?.actionId ?? requestActions.get(payload.requestId),
						"Missing actual action in complete rollup",
					);
					if (payload.stage === "start" && payload.disposition === "accepted")
						count(payload.person, action).start++;
					if (payload.stage === "finish")
						count(payload.person, action).finish++;
					if (payload.stage === "interrupt")
						count(payload.person, action).interrupt++;
				}
			}
			for (const event of result.events) {
				if (event.data.kind !== "decision") continue;
				const id = required(event.person, "Missing actual deciding actor");
				const offer = event.data.decision.chosenAffordanceId;
				const action =
					offer === null
						? "<no-choice>"
						: required(
								offerActions.get(JSON.stringify([id, offer])),
								"Missing actual chosen action in complete rollup",
							);
				count(id, action).chosen++;
			}
			return result;
		};
		record({ kind: "initial", state: snapshot() });
		TownRunOwner.onStepRequest = (request) => {
			hook?.(request);
			// Actual offer books/revisions and action receipts, including rejections.
			record({
				kind: "submitted",
				until: request.until,
				inputs: request.inputs.flatMap((input): unknown[] => {
					if (input.kind === "offers.received")
						return [
							{
								id: input.id,
								at: input.at,
								kind: input.kind,
								person: input.payload.person,
								revision: input.payload.revision,
								offers: input.payload.offers.map((offer) => ({
									id: offer.id,
									actionId: offer.actionId,
									place: offer.place,
									durationMs: offer.durationMs,
								})),
							},
						];
					return input.kind === "action.resolved" ||
						input.kind === "decision.requested"
						? [input]
						: [];
				}),
			});
		};
		runtime.prepareBoundary = function () {
			const result = prepare.call(this);
			// Same post-acceptStep physical boundary as captureWitnesses; no full export.
			frozen = structuredClone(
				this.s.people.map(({ id, name, place, job, idleSince }) => ({
					id,
					name,
					place,
					...(job ? { job } : {}),
					...(idleSince === undefined ? {} : { idleSince }),
				})),
			);
			record({ kind: "boundary", result, state: snapshot() });
			return result;
		};
		runtime.apply = function (requestId, actionId) {
			const pending = observedCurrent?.pending.find(
				(item) => item.id === requestId,
			);
			if (pending?.kind === "action")
				requestActions.set(
					requestId,
					required(
						offerActions.get(JSON.stringify([pending.person, pending.offerId])),
						"Missing real action for physical request",
					),
				);
			record({ kind: "chosen-response", requestId, actionId });
			try {
				return apply.call(this, requestId, actionId);
			} finally {
				record({ kind: "after-apply", requestId, state: snapshot() });
			}
		};
	}
	const original = runtime.finishPhysical;
	type Finish = {
		person: string;
		job: NonNullable<ReturnType<Runtime["actor"]>["job"]>;
		boundary: ReturnType<Runtime["export"]>["boundary"]["witnesses"];
		teachers: string[];
		outcome: ReturnType<Runtime["finishPhysical"]>;
		wealthBefore: number;
		wealthAfter: number;
		hallSafe: boolean;
	};
	const finishes: Finish[] = [];
	const finishSummaries: unknown[] = [];
	runtime.finishPhysical = function (person, request, boundary) {
		const job = structuredClone(
			required(person.job, "Missing actual finish job"),
		);
		const witnesses = boundary
			? boundary.map(({ owner: _owner, ...witness }) =>
					structuredClone(witness),
				)
			: (frozen ?? this.export().boundary.witnesses);
		const teachers = witnesses
			.filter(
				(witness) =>
					witness.id !== person.id &&
					witness.job?.offer.action === "teach" &&
					overlapMinutes(
						job,
						{ ...witness, owner: this.s.owner },
						this.s.now,
					) >= 15,
			)
			.map((witness) => witness.id);
		const awakeOverlap = arm
			? witnesses.map((witness) => ({
					id: witness.id,
					minutes: overlapMinutes(
						job,
						{ ...witness, owner: this.s.owner },
						this.s.now,
					),
					asleep: this.s.owner.actor(witness.id).body.asleep,
					awakeSince: this.s.owner.actor(witness.id).body.since,
				}))
			: undefined;
		const wealthBefore = person.wealth;
		const outcome = original.call(this, person, request, boundary);
		finishes.push({
			person: person.id,
			job,
			boundary: witnesses,
			teachers,
			outcome: structuredClone(outcome),
			wealthBefore,
			wealthAfter: person.wealth,
			hallSafe: this.s.hallSafe,
		});
		if (arm) {
			finishSummaries.push(
				structuredClone({ ...finishes.at(-1), awakeOverlap }),
			);
			record({ kind: "real-finish", finish: finishes.at(-1), awakeOverlap });
		}
		return outcome;
	};
	return {
		finishes,
		failure(missing: string[]) {
			// Drain the final accepted receipts even when verbose rows are already full.
			const finalSnapshot = snapshot();
			const rollup = {
				complete: true,
				initial,
				final,
				counts: [...counts.values()],
				finishes: finishSummaries,
			};
			// Mandatory complete rollup reserves space before retaining verbose rows.
			if (new TextEncoder().encode(JSON.stringify(rollup)).length > 1_000_000)
				throw Error("Complete physical rollup exceeds cap; FAIL STOP");
			record({ kind: "final", state: finalSnapshot });
			while (
				rows.length &&
				new TextEncoder().encode(JSON.stringify({ rollup, rows })).length >
					1_000_000
			) {
				rows.pop();
				omitted++;
			}
			// Private failure message only. Bounded valid JSON; truncation is explicit.
			const message = JSON.stringify({
				kind: "OBSERVATION_ONLY",
				arm,
				seed: 42,
				rounds: 16,
				missing,
				omitted,
				rollup,
				rows,
			});
			expect(new TextEncoder().encode(message).length).toBeLessThanOrEqual(
				1_048_576,
			);
			return message;
		},
		stop() {
			runtime.finishPhysical = original;
			if (arm) {
				runtime.s.owner.advance = advance;
				runtime.prepareBoundary = prepare;
				runtime.apply = apply;
				TownRunOwner.onStepRequest = hook;
			}
			rows.length = 0;
			frozen = undefined;
		},
		assertNative(finish: Finish) {
			const inputs = readRunHistory(runtime.export().owner.run).flatMap(
				(entry) => entry.inputs,
			);
			expect(
				inputs.some(
					(input) =>
						input.kind === "offers.received" &&
						input.payload.person === finish.person &&
						input.payload.offers.some(
							(offer) => offer.id === finish.job.offer.id,
						),
				),
			).toBe(true);
			expect(
				inputs.some(
					(input) =>
						input.kind === "action.resolved" &&
						input.payload.person === finish.person &&
						input.payload.activityId === finish.job.activityId &&
						input.payload.stage === "start" &&
						input.payload.disposition === "accepted",
				),
			).toBe(true);
			const receipts = inputs.filter(
				(input) =>
					input.kind === "action.resolved" &&
					input.payload.stage === "finish" &&
					input.payload.activityId === finish.job.activityId,
			);
			expect(receipts).toHaveLength(1);
			const receipt = receipts[0];
			if (receipt?.kind !== "action.resolved")
				throw Error("Missing native finish receipt");
			expect(receipt.payload.person).toBe(finish.person);
			expect(receipt.payload.outcome).toEqual(finish.outcome);
			expect(receipt.payload.disposition).toBe(finish.outcome.status);
		},
	};
}
