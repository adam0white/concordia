/** Isolated host completion faculty. Physical jobs and request DTOs are explicit
 * test inputs, never submitted as native receipts. Actors/attention/method
 * retention use one actual public Run; no body, RNG or native time is edited. */

import type { ActionRequest, Input } from "@adam0white/human-framework";
import { expect, it } from "vitest";
import {
	HOST_SOURCE,
	MINUTE,
	nativeMilliseconds,
} from "../src/core/hf4-run.ts";
import { placeOf, required } from "../src/core/invariants.ts";
import { createRuntime } from "./current-town.ts";

function completion(reverse: boolean, remote = false, sleeping = false) {
	const runtime = createRuntime(42, 6),
		teacher = runtime.actor("ada"),
		learner = runtime.actor("ravi");
	if (sleeping) {
		const owner = runtime.s.owner;
		owner.requestDecision(
			learner.id,
			[
				{
					id: "sleep",
					action: "sleep",
					label: "Actual sleep faculty control",
					placeId: "homes",
					duration: 240,
					effort: 0,
					mode: "sleep",
					advertises: {},
				},
			],
			"isolated sleeping-body negative",
		);
		const request = required(
			owner.pending.find((request) => request.kind === "action"),
			"Missing actual sleep request",
		);
		if (request.kind !== "action") throw Error("Unexpected communication");
		const input: Input = {
			id: owner.allocate("sleep-faculty-receipt"),
			at: owner.at,
			source: HOST_SOURCE,
			kind: "action.resolved",
			payload: {
				requestId: request.id,
				requestHash: request.requestHash,
				person: request.person,
				activityId: request.activityId,
				stage: request.stage,
				worldRevision: request.worldRevision,
				disposition: "accepted",
				worldChange: {
					expectedRevision: owner.revision,
					revision: owner.revision + 1,
					put: [],
					remove: [],
					hostState: { engineeringFixture: "actual-sleeping-learner" },
				},
				observations: [],
			},
		};
		owner.advance(owner.at, [input]);
		owner.advance(owner.at + 1);
		runtime.s.now = owner.at / MINUTE;
		expect(owner.actor(learner.id).body.asleep).toBe(true);
	}
	const start = runtime.s.now;
	for (const [person, action, duration] of [
		[teacher, "teach", 120],
		[learner, "learn", 60],
	] as const) {
		const began = start + 120 - duration,
			place = remote && person === teacher ? "homes" : "school";
		person.place = place;
		person.job = {
			personId: person.id,
			activityId: `physical-class:${person.id}`,
			startedAt: nativeMilliseconds(began),
			offer: {
				id: action,
				action,
				label: action,
				placeId: place,
				duration,
				effort: 0.1,
				advertises: { competence: 0.3, belonging: 0.2 },
			},
			from: place,
			arrive: began,
			end: start + 120,
			event: runtime.event(
				"started",
				"Physical class faculty fixture.",
				person.id,
				place,
			),
			food: 0,
			tools: 0,
		};
		placeOf(runtime.s, place).reserved++;
	}
	runtime.s.owner.advance(nativeMilliseconds(start + 120));
	runtime.s.now = runtime.s.owner.at / MINUTE;
	expect(runtime.s.owner.actor(teacher.id).body.asleep).toBe(false);
	expect(runtime.s.owner.actor(learner.id).body.asleep).toBe(sleeping);
	const boundary = runtime.s.people.map((person) => ({
		...person,
		job: person.job ? structuredClone(person.job) : undefined,
	}));
	for (const person of reverse ? [learner, teacher] : [teacher, learner]) {
		const job = required(person.job, "Missing completion job");
		const request: ActionRequest = {
			kind: "action",
			id: `physical-fixture:${person.id}`,
			person: person.id,
			activityId: job.activityId,
			offerId: job.offer.id,
			offerRevision: 1,
			issuedAt: runtime.s.owner.at,
			boundaryAt: runtime.s.owner.at,
			stage: "finish",
			worldRevision: runtime.s.owner.revision,
			requestHash: "physical-unit-fixture",
			participants: [],
		};
		runtime.finishPhysical(person, request, boundary);
	}
	runtime.s.owner.advance(runtime.s.owner.at + 1);
	runtime.s.now = runtime.s.owner.at / MINUTE;
	runtime.s.owner.advance(runtime.s.owner.at + 1);
	runtime.s.now = runtime.s.owner.at / MINUTE;
	return runtime.s.owner
		.actor(learner.id)
		.methods.rules.filter((rule) => rule.id === "hall-section-inspection")
		.map((rule) => ({
			id: rule.id,
			evidence: rule.evidence.map((item) => ({
				sourceId: item.sourceId,
				outcome: item.outcome,
			})),
		}));
}
it("retains actual attended teaching in either same-boundary physical completion order", () => {
	const learnerFirst = completion(true);
	expect(learnerFirst).toHaveLength(2);
	expect(completion(false)).toEqual(learnerFirst);
});
it("does not teach remotely even when physical completion times match", () => {
	expect(completion(false, true)).toEqual([]);
});
it("does not turn a physical attendance claim into learning while the actual Run body is sleeping", () => {
	expect(completion(false, false, true)).toEqual([]);
	expect(completion(true, false, true)).toEqual([]);
});
