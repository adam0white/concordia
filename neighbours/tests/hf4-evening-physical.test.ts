/** Isolated current host faculty controls. Explicit physical schedules exercise
 * allowance and room rules; these are not a natural reopened-hall trajectory. */
import { expect, it } from "vitest";
import {
	type EveningCycle,
	type EveningEvent,
	interveneEvening,
	roomBooking,
	weeklySupportRemaining,
} from "../src/core/evenings.ts";
import { required } from "../src/core/invariants.ts";
import { createRuntime, restoreRuntime } from "./current-town.ts";

function fixture() {
	const runtime = createRuntime(42, 6),
		s = runtime.s;
	const events: EveningEvent[] = (["class", "meal"] as const).map((kind) => ({
		id: `weekly-0-${kind}`,
		cycle: 0,
		kind,
		organiserId: kind === "class" ? "ada" : "sam",
		startsAt: 10800,
		endsAt: 10860,
		stage: "candidate",
		replies: {},
	}));
	const cycle: EveningCycle = { index: 0, purposes: {}, events };
	s.socialEvenings = {
		version: 1,
		openedAt: s.now,
		lastCountAt: s.now,
		events: [],
		recurrence: {
			version: 1,
			startedAt: s.now,
			firstStartsAt: 10800,
			cycles: [cycle],
		},
	};
	return {
		runtime,
		s,
		cycle,
		classEvent: required(events[0], "Missing class"),
		mealEvent: required(events[1], "Missing meal"),
	};
}
it("moves one unposted date, records ancestry, spends weekly credit before original allowance and refuses a repeated action", () => {
	const { runtime, s, cycle, classEvent, mealEvent } = fixture();
	s.controls = 1;
	expect(weeklySupportRemaining(s, classEvent)).toBe(1);
	const original = classEvent.startsAt;
	interveneEvening(runtime, "open-evening-slot", classEvent.id);
	expect(classEvent.startsAt).toBe(original + 1440);
	expect(mealEvent.startsAt).toBe(original);
	expect(s.controls).toBe(1);
	expect(cycle.supportSpent?.eventId).toBe(classEvent.id);
	expect(cycle.supportSpent?.receipt.kind).toBe("intervention");
	expect(cycle.openedSlot?.from).toBe(original);
	expect(cycle.openedSlot?.to).toBe(classEvent.startsAt);
	expect(weeklySupportRemaining(s, mealEvent)).toBe(0);
	const before = runtime.export();
	expect(() =>
		interveneEvening(runtime, "open-evening-slot", mealEvent.id),
	).toThrow();
	expect(runtime.export()).toEqual(before);
	const notice = runtime.event(
		"evening-proposed",
		"Sam invited neighbours to supper.",
		"sam",
		"hall",
	);
	mealEvent.notice = required(
		s.events.find((event) => event.id === notice),
		"Missing notice",
	);
	mealEvent.stage = "proposed";
	interveneEvening(runtime, "advertise-evening", mealEvent.id);
	expect(s.controls).toBe(0);
	expect(mealEvent.advertisement?.causes).toEqual([notice]);
	const spent = runtime.export();
	expect(() =>
		interveneEvening(runtime, "advertise-evening", mealEvent.id),
	).toThrow();
	expect(runtime.export()).toEqual(spent);
});
it("never spends weekly support on ordinary tools and reserves the same room across programme dates", () => {
	const { runtime, s, classEvent, mealEvent } = fixture();
	s.controls = 0;
	expect(() => runtime.intervene({ kind: "lend-tools" })).toThrow(/allowance/);
	expect(weeklySupportRemaining(s, classEvent)).toBe(1);
	mealEvent.stage = "prepared";
	expect(roomBooking(s, classEvent)).toBe(mealEvent);
	mealEvent.startsAt += 1440;
	mealEvent.endsAt += 1440;
	expect(roomBooking(s, classEvent)).toBeUndefined();
	const notice = runtime.event(
		"evening-proposed",
		"Nora posted an invitation.",
		"ada",
		"hall",
	);
	classEvent.notice = required(
		s.events.find((event) => event.id === notice),
		"Missing notice",
	);
	classEvent.stage = "proposed";
	const before = runtime.export();
	expect(() =>
		interveneEvening(runtime, "open-evening-slot", classEvent.id),
	).toThrow();
	expect(runtime.export()).toEqual(before);
});
it("rejects a forged weekly receipt even when both retained host copies agree, preserving the valid live archive", () => {
	const runtime = createRuntime(42, 6);
	runtime.step();
	const baseline = runtime.export();
	expect(restoreRuntime(baseline).export()).toEqual(baseline);
	const forged = structuredClone(baseline);
	forged.physical.socialEvenings = fixture().s.socialEvenings;
	const cycle = required(
		forged.physical.socialEvenings?.recurrence?.cycles[0],
		"Missing forged cycle",
	);
	const receipt = {
		id: forged.physical.nextEvent,
		at: forged.physical.now,
		kind: "intervention",
		text: "Forged weekly credit.",
		causes: [],
		importance: 0.5,
	};
	forged.physical.events.push(receipt);
	cycle.supportSpent = {
		version: 1,
		kind: "open-evening-slot",
		eventId: "weekly-0-class",
		receipt: structuredClone(receipt),
	};
	expect(() => restoreRuntime(forged)).toThrow(/replay|host rules/);
	expect(runtime.export()).toEqual(baseline);
});

it("keeps the organiser seat free, requires an accepted received notice, and releases interrupted preparation", async () => {
	const { eveningOffers, beginEvening, interruptEvening } = await import(
		"../src/core/evenings.ts"
	);
	const { runtime, s, classEvent } = fixture();
	const guest = runtime.actor("ravi"),
		organiser = runtime.actor("ada");
	classEvent.startsAt = s.now + 30;
	classEvent.endsAt = s.now + 90;
	classEvent.stage = "prepared";
	guest.place = "hall";
	organiser.place = "hall";
	const hall = required(
		s.places.find((place) => place.id === "hall"),
		"Missing hall",
	);
	hall.capacity = 10;
	expect(
		eveningOffers(s, guest).some((offer) => offer.action === "attend-class"),
	).toBe(false);
	classEvent.replies[guest.id] = { heardAt: s.now, attendedMinutes: 0 };
	expect(
		eveningOffers(s, guest).some((offer) => offer.action === "attend-class"),
	).toBe(false);
	required(classEvent.replies[guest.id], "Missing received reply").reply =
		"accepted";
	hall.reserved = 8;
	expect(
		eveningOffers(s, guest).some((offer) => offer.action === "attend-class"),
	).toBe(true);
	hall.reserved = 9;
	expect(
		eveningOffers(s, guest).some((offer) => offer.action === "attend-class"),
	).toBe(false);
	expect(
		eveningOffers(s, organiser).some((offer) => offer.action === "host-class"),
	).toBe(true);
	const event = runtime.event(
		"started",
		"Physical preparation fixture.",
		organiser.id,
		"hall",
	);
	organiser.job = {
		personId: organiser.id,
		activityId: "physical-preparation",
		startedAt: s.owner.at,
		offer: {
			id: `prepare:${classEvent.id}`,
			action: "prepare-class",
			label: "Prepare class",
			placeId: "hall",
			duration: 30,
			effort: 0.1,
			advertises: {},
		},
		from: "hall",
		arrive: s.now,
		end: s.now + 30,
		event,
		food: 0,
		tools: 0,
	};
	classEvent.stage = "proposed";
	beginEvening(s, organiser);
	expect(classEvent.stage).toBe("preparing");
	expect(classEvent.bookingEvent).toBe(event);
	const conflicting = required(
		s.socialEvenings?.recurrence?.cycles[0]?.events.find(
			(event) => event.kind === "meal",
		),
		"Missing conflicting meal",
	);
	conflicting.startsAt = classEvent.startsAt;
	conflicting.endsAt = classEvent.endsAt;
	expect(roomBooking(s, conflicting)).toBe(classEvent);
	interruptEvening(s, organiser);
	expect(classEvent.stage).toBe("proposed");
	expect(classEvent.bookingEvent).toBeUndefined();
});
it("delivers a reserved meal only after an actual awake host interval and refunds an absent-host meal", async () => {
	const { updateEvenings } = await import("../src/core/evenings.ts");
	const { nativeMilliseconds, MINUTE } = await import("../src/core/hf4-run.ts");
	for (const withHost of [false, true]) {
		const { runtime, s, mealEvent } = fixture(),
			guest = runtime.actor("ravi"),
			organiser = runtime.actor("sam");
		mealEvent.startsAt = s.now;
		mealEvent.endsAt = s.now + 60;
		mealEvent.stage = "prepared";
		for (const person of [guest, ...(withHost ? [organiser] : [])]) {
			person.place = "hall";
			const host = person.id === organiser.id;
			const event = runtime.event(
				"started",
				"Physical evening faculty fixture.",
				person.id,
				"hall",
			);
			person.job = {
				personId: person.id,
				activityId: `physical-evening:${person.id}`,
				startedAt: s.owner.at,
				offer: {
					id: `${host ? "host" : "attend"}:${mealEvent.id}`,
					action: host ? "host-meal" : "attend-meal",
					label: host ? "Host meal" : "Attend meal",
					placeId: "hall",
					duration: 60,
					effort: 0.1,
					advertises: {},
				},
				from: "hall",
				arrive: s.now,
				end: s.now + 60,
				event,
				food: host ? 0 : 1,
				tools: 0,
			};
			mealEvent.replies[person.id] = {
				heardAt: s.now,
				reply: "accepted",
				attendedMinutes: 0,
			};
			required(
				s.places.find((place) => place.id === "hall"),
				"Missing hall",
			).reserved++;
		}
		const market = required(
				s.places.find((place) => place.id === "market"),
				"Missing market",
			),
			wealth = guest.wealth,
			stock = market.stock,
			consumed = s.consumed;
		market.stock--;
		guest.wealth--;
		s.owner.advance(nativeMilliseconds(s.now + 60));
		s.now = s.owner.at / MINUTE;
		updateEvenings(runtime);
		const { locatedAt } = await import("../src/core/encounters.ts");
		expect(s.owner.at).toBe(
			nativeMilliseconds(required(guest.job, "Missing physical interval").end),
		);
		expect(locatedAt(guest, "hall", s.now)).toBe(true);
		expect(locatedAt(guest, "hall", (s.owner.at + 1) / MINUTE)).toBe(false);
		expect(mealEvent.replies[guest.id]?.attendedMinutes).toBe(
			withHost ? 60 : 0,
		);
		const job = required(guest.job, "Missing guest job");
		runtime.finishPhysical(
			guest,
			{
				kind: "action",
				id: "physical-meal-finish",
				person: guest.id,
				activityId: job.activityId,
				offerId: job.offer.id,
				offerRevision: 1,
				issuedAt: s.owner.at,
				boundaryAt: s.owner.at,
				stage: "finish",
				worldRevision: s.owner.revision,
				requestHash: "isolated-physical-fixture",
				participants: [],
			},
			[],
		);
		expect(mealEvent.replies[guest.id]?.delivered).toBe(withHost);
		expect(guest.wealth).toBe(wealth - (withHost ? 1 : 0));
		expect(market.stock).toBe(stock - (withHost ? 1 : 0));
		expect(s.consumed).toBe(consumed + (withHost ? 1 : 0));
	}
});
