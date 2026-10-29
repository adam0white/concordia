/** Synthetic engineering faculty: fixed seed42 / host start-event42. Not a
 * natural trajectory, frequency estimate or native RNG/body/time edit. */
import type {
	ActionRequest,
	Input,
	ObservedOutcome,
} from "@adam0white/human-framework";
import { readRunHistory, replay } from "@adam0white/human-framework";
import { expect, it } from "vitest";
import {
	HOST_SOURCE,
	MINUTE,
	nativeMilliseconds,
} from "../src/core/hf4-run.ts";
import { placeOf, required } from "../src/core/invariants.ts";
import { botchedUnderProtest } from "../src/core/protest.ts";
import { createRuntime } from "./current-town.ts";
import { facultyProof } from "./faculty-proof.ts";

// Retain the original protest guard’s 120-second deadline.
it("withholds every botched work benefit and resolves a real native protest as failed with reservation cleanup", () => {
	for (const action of ["grow", "supply", "work", "repair"]) {
		const town = createRuntime(42, 6),
			owner = town.s.owner,
			person = town.actor("ada");
		const proof = facultyProof(owner, `protest-${action}`);
		const offer = required(
			town.affordances(person.id).find((offer) => offer.action === action),
			`Missing legal ${action}`,
		);
		const rest = required(
			town.affordances(person.id).find((offer) => offer.action === "rest"),
			"Missing legal rest",
		);
		owner.requestAdvice(person.id, [offer, rest], {
			voiceId: "player",
			affordanceId: offer.id,
			strength: 1,
			insist: true,
		});
		const start = required(
			owner.pending.find((request) => request.kind === "action"),
			"Missing actual native start",
		);
		if (start.kind !== "action") throw Error("Expected action");
		expect(owner.actor(person.id).activity?.protest).toBe(true);
		expect(start.offerId).toBe(offer.id);
		town.s.now = owner.at / MINUTE;
		town.s.nextEvent = 42;
		const before = {
			produced: town.s.produced,
			wealth: person.wealth,
			hall: town.s.hall,
			tools: town.s.tools,
			reserved: placeOf(town.s, offer.placeId).reserved,
		};
		town.startPhysical(person, offer, start);
		const job = required(person.job, "Missing physical job");
		expect(job.event).toBe(42);
		expect(botchedUnderProtest(town.s, person, job)).toBe(true);
		const receipt = (
			request: ActionRequest,
			disposition: "accepted" | "failed",
			outcome?: ObservedOutcome,
		): Input => ({
			id: owner.allocate("protest-faculty-receipt"),
			at: owner.at,
			source: HOST_SOURCE,
			kind: "action.resolved",
			payload: {
				requestId: request.id,
				requestHash: request.requestHash,
				person: request.person,
				activityId: request.activityId,
				stage: request.stage,
				worldRevision: owner.revision,
				disposition,
				worldChange: {
					expectedRevision: owner.revision,
					revision: owner.revision + 1,
					put: [],
					remove: [],
					hostState: { physicalFaculty: "protest-work", action, jobEvent: 42 },
				},
				observations: [],
				...(outcome ? { outcome } : {}),
			},
		});
		owner.advance(owner.at, [receipt(start, "accepted")]);
		const finishResult = owner.advance(nativeMilliseconds(job.end));
		const finish = required(
			finishResult.boundary.type === "world-required"
				? finishResult.boundary.requests.find(
						(request) =>
							request.kind === "action" && request.person === person.id,
					)
				: undefined,
			"Missing native completion",
		);
		if (finish.kind !== "action") throw Error("Expected physical finish");
		expect(finish.stage).toBe("finish");
		town.s.now = owner.at / MINUTE;
		const outcome = town.finishPhysical(person, finish, []);
		expect(outcome.status).toBe("failed");
		expect(
			required(
				town.s.events.find(
					(event) =>
						event.kind === "attempt-failed" && event.causes.includes(42),
				),
				"Missing actual failed host event",
			).text,
		).toContain("The work was done under protest and went wrong");
		expect(outcome.actual.material).toBe(0);
		expect({
			produced: town.s.produced,
			wealth: person.wealth,
			hall: town.s.hall,
			tools: town.s.tools,
			reserved: placeOf(town.s, offer.placeId).reserved,
		}).toEqual(before);
		expect(person.job).toBeUndefined();
		owner.advance(owner.at, [receipt(finish, "failed", outcome)]);
		expect(
			owner.last?.events
				.filter(
					(event) =>
						event.data.kind === "action-settled" &&
						event.data.requestId === finish.id,
				)
				.map((event) =>
					event.data.kind === "action-settled"
						? event.data.disposition
						: "other",
				),
		).toEqual(["failed"]);
		const failed = readRunHistory(owner.export().run)
			.flatMap((transaction) => transaction.inputs)
			.filter(
				(input) =>
					input.kind === "action.resolved" && input.payload.stage === "finish",
			);
		expect(failed).toHaveLength(1);
		expect(
			failed[0]?.kind === "action.resolved" &&
				failed[0].payload.outcome?.status,
		).toBe("failed");
		expect(replay(owner.export().run).ok).toBe(true);
		proof({ before, physical: town.export().physical, failed });
	}
}, 120_000);
