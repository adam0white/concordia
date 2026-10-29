/** Isolated physical faculties. Explicit jobs/ledger inputs are host fixtures;
 * actual Run bodies and time remain public. These are not natural town scenes. */
import type { ActionRequest } from "@adam0white/human-framework";
import { expect, it } from "vitest";
import {
	locatedAt,
	overlapMinutes,
	presentAt,
} from "../src/core/encounters.ts";
import { MINUTE, nativeMilliseconds } from "../src/core/hf4-run.ts";
import { placeOf, required } from "../src/core/invariants.ts";
import { recordSocialContacts } from "../src/core/social-contact.ts";
import type { Resident } from "../src/core/state.ts";
import { createRuntime } from "./current-town.ts";

function job(
	runtime: ReturnType<typeof createRuntime>,
	person: Resident,
	action: string,
	minutes = 60,
) {
	const start = runtime.s.now;
	person.place = "hall";
	person.job = {
		personId: person.id,
		activityId: `physical:${action}:${person.id}`,
		startedAt: nativeMilliseconds(start),
		offer: {
			id: action,
			action,
			label: action,
			placeId: "hall",
			duration: minutes,
			effort: 0.1,
			advertises: {},
		},
		from: "hall",
		arrive: start,
		end: start + minutes,
		event: runtime.event(
			"started",
			`Physical ${action} fixture.`,
			person.id,
			"hall",
		),
		food: 0,
		tools: 0,
	};
	placeOf(runtime.s, "hall").reserved++;
}
function advance(runtime: ReturnType<typeof createRuntime>, minutes: number) {
	runtime.s.owner.advance(nativeMilliseconds(runtime.s.now + minutes));
	runtime.s.now = runtime.s.owner.at / MINUTE;
}
it("keeps two paid starts as the daytime limit and pays exactly two only at actual physical completion", () => {
	const runtime = createRuntime(42, 6),
		person = runtime.actor("ada");
	expect(
		runtime.affordances(person.id).some((offer) => offer.action === "work"),
	).toBe(true);
	person.paidWork = { day: 0, starts: 2, minutes: 60, totalMinutes: 60 };
	expect(
		runtime.affordances(person.id).some((offer) => offer.action === "work"),
	).toBe(false);
	const wealth = person.wealth;
	job(runtime, person, "work");
	expect(person.wealth).toBe(wealth);
	advance(runtime, 60);
	const current = required(person.job, "Missing physical shift");
	const request: ActionRequest = {
		kind: "action",
		id: "physical-shift-finish",
		person: person.id,
		activityId: current.activityId,
		offerId: "work",
		offerRevision: 1,
		issuedAt: runtime.s.owner.at,
		boundaryAt: runtime.s.owner.at,
		stage: "finish",
		worldRevision: runtime.s.owner.revision,
		requestHash: "isolated-physical-fixture",
		participants: [],
	};
	const outcome = runtime.finishPhysical(person, request, []);
	expect(person.wealth).toBe(wealth + 2);
	expect(person.paidWork).toEqual({
		day: 0,
		starts: 2,
		minutes: 120,
		totalMinutes: 120,
	});
	expect(outcome.actual.material).toBe(2);
	expect(() => runtime.finishPhysical(person, request, [])).toThrow(
		/Missing physical job/,
	);
	expect(person.wealth).toBe(wealth + 2);
});
it("records one bilateral social receipt for real unequal overlaps, excluding repair bystanders and late arrivals", () => {
	const runtime = createRuntime(42, 6),
		a = runtime.actor("ada"),
		b = runtime.actor("sam"),
		other = runtime.actor("jo");
	job(runtime, a, "talk", 60);
	job(runtime, b, "talk", 30);
	job(runtime, other, "repair", 60);
	advance(runtime, 15);
	recordSocialContacts(runtime);
	expect(a.job?.socialContacts).toEqual([
		{ otherId: b.id, event: b.job?.event },
	]);
	expect(b.job?.socialContacts).toEqual([
		{ otherId: a.id, event: a.job?.event },
	]);
	expect(other.job?.socialContacts).toBeUndefined();
	const before = runtime.export();
	recordSocialContacts(runtime);
	expect(runtime.export()).toEqual(before);
	const aj = required(a.job, "Missing talk");
	const bj = required(b.job, "Missing talk");
	bj.arrive = runtime.s.now;
	expect(overlapMinutes(aj, b, runtime.s.now)).toBe(0);
});
it("distinguishes actual sleeping physical presence from social availability and excludes a traveller", () => {
	const runtime = createRuntime(42, 6);
	runtime.step();
	const sleeper = runtime.actor("elin");
	expect(runtime.s.owner.actor(sleeper.id).body.asleep).toBe(true);
	expect(locatedAt(sleeper, "homes", runtime.s.now)).toBe(true);
	expect(presentAt(sleeper, "homes", runtime.s.now)).toBe(false);
	const traveller = runtime.actor("ada");
	expect(traveller.job).toBeDefined();
	const travelling = required(traveller.job, "Missing actual journey");
	expect(travelling.arrive).toBeGreaterThan(travelling.startedAt / MINUTE);
	expect(
		locatedAt(
			traveller,
			travelling.offer.placeId ?? "",
			travelling.startedAt / MINUTE,
		),
	).toBe(false);
});
