import assert from "node:assert/strict";
import { tick } from "@adam0white/human-framework";
import { describe, expect, it } from "vitest";
import {
	allEvenings,
	canOpenEveningSlot,
	eveningOffers,
	finishEvening,
	MAX_EVENING_CYCLES,
	roomBooking,
	updateEvenings,
} from "../src/core/evenings.ts";
import { createRuntime, restoreRuntime } from "../src/core/index.ts";
import { Runtime } from "../src/core/runtime.ts";
import type { Save } from "../src/core/state.ts";

function opened() {
	const host = new Runtime(createRuntime(42, 8).export() as Save);
	host.s.hall = 12;
	host.s.hallSafe = true;
	updateEvenings(host);
	return host;
}
function moveClock(host: Runtime, now: number) {
	host.s.now = now;
	host.s.round = (now - 480) / 15;
	for (const resident of host.s.people) {
		const body = structuredClone(resident.person.body);
		tick(resident.person, now);
		resident.person.body = { ...body, since: now };
	}
	updateEvenings(host);
}
function recurring() {
	const host = opened();
	const first = host.s.socialEvenings?.recurrence?.firstStartsAt;
	assert(first);
	moveClock(host, first - 4 * 1440);
	const cycle = host.s.socialEvenings?.recurrence?.cycles[0];
	assert(cycle);
	return { host, cycle };
}
function post(host: Runtime, eventId: string, organiserId: string) {
	const organiser = host.actor(organiserId);
	organiser.place = "hall";
	for (const id of host.prepareRound()) {
		host.apply(id, id === organiserId ? `propose:${eventId}` : "rest");
	}
	for (let i = 0; i < 2; i++) {
		for (const id of host.prepareRound())
			host.apply(id, host.actor(id).job?.offer.id ?? "rest");
	}
	const e = allEvenings(host.s).find((e) => e.id === eventId);
	assert(e?.notice);
	return e;
}

describe("feasible proposal prerequisites", () => {
	it("withholds a 17:30 promise that cannot fit posting and preparation before 18:00", () => {
		const host = opened();
		const e = allEvenings(host.s)[1];
		assert(e);
		host.actor("sam").place = "hall";
		moveClock(host, e.startsAt - 30);
		expect(
			eveningOffers(host.s, host.actor("sam")).some(
				(o) => o.id === `propose:${e.id}`,
			),
		).toBe(false);
		moveClock(host, e.startsAt - 15);
		e.stage = "proposed";
		expect(
			eveningOffers(host.s, host.actor("sam")).some(
				(o) => o.id === `prepare:${e.id}`,
			),
		).toBe(false);
	});
	it("allows exactly enough local time and includes travel time", () => {
		const host = opened();
		const e = allEvenings(host.s)[1];
		assert(e);
		host.actor("sam").place = "hall";
		moveClock(host, e.startsAt - 45);
		expect(
			eveningOffers(host.s, host.actor("sam")).some(
				(o) => o.id === `propose:${e.id}`,
			),
		).toBe(true);
		host.actor("sam").place = "homes";
		expect(
			eveningOffers(host.s, host.actor("sam")).some(
				(o) => o.id === `propose:${e.id}`,
			),
		).toBe(false);
	});
});

describe("retained recurring hall opportunities", () => {
	it("keeps the four legacy events and adds a new received purpose per weekly cycle", () => {
		const { host, cycle } = recurring();
		expect(host.s.socialEvenings?.events).toHaveLength(4);
		expect(cycle.events).toHaveLength(2);
		expect(cycle.events[0]?.startsAt).toBe(cycle.events[1]?.startsAt);
		expect(cycle.purposes).toEqual({});
		const priorGoals = host.actor("sam").person.agenda.goals.map((g) => g.id);
		host.actor("sam").place = "hall";
		updateEvenings(host);
		const purpose = cycle.purposes.sam;
		assert(purpose?.goalId);
		expect(
			host.actor("sam").received?.some((e) => e.id === purpose.notice.id),
		).toBe(true);
		expect(priorGoals).not.toContain(purpose.goalId);
		expect(cycle.purposes.lea).toBeUndefined();
		expect(
			host.actor("sam").person.agenda.goals.find((g) => g.id === purpose.goalId)
				?.label,
		).toContain("week 1");
		updateEvenings(host);
		expect(
			host
				.actor("sam")
				.person.agenda.goals.filter((g) => g.id === purpose.goalId),
		).toHaveLength(1);
	});
	it("continues an old town from its current day without fabricating past notices", () => {
		const host = opened();
		delete host.s.socialEvenings?.recurrence;
		moveClock(host, 30 * 1440 + 480);
		const recurrence = (host.export() as Save).socialEvenings?.recurrence;
		assert(recurrence);
		expect(recurrence.startedAt).toBe(host.s.now);
		expect(recurrence.firstStartsAt).toBeGreaterThan(host.s.now + 3 * 1440);
		expect(allEvenings(host.s).filter((e) => e.notice)).toHaveLength(0);
		expect(restoreRuntime(host.export()).export()).toEqual(host.export());
	});
	it("retains all twelve bounded cycles without dropping the original events", () => {
		const { host } = recurring();
		const first = host.s.socialEvenings?.recurrence?.firstStartsAt;
		assert(first);
		for (let index = 1; index < MAX_EVENING_CYCLES + 2; index++)
			moveClock(host, first + index * 7 * 1440 - 4 * 1440);
		expect(host.s.socialEvenings?.recurrence?.cycles).toHaveLength(
			MAX_EVENING_CYCLES,
		);
		expect(allEvenings(host.s)).toHaveLength(4 + MAX_EVENING_CYCLES * 2);
		expect(host.view().eveningSchedule?.finished).toBe(true);
		expect(restoreRuntime(host.export()).export()).toEqual(host.export());
	});
	it("reserves the same room across original and recurring events", () => {
		const { host, cycle } = recurring();
		const [lesson, meal] = cycle.events;
		assert(lesson && meal);
		lesson.stage = "prepared";
		lesson.bookingEvent = 1;
		expect(roomBooking(host.s, meal)).toBe(lesson);
		meal.stage = "proposed";
		expect(
			eveningOffers(host.s, host.actor("sam")).some(
				(o) => o.id === `prepare:${meal.id}`,
			),
		).toBe(false);
	});
});

describe("scarce player influence", () => {
	it("moves only one unposted recurring option, retains the old date and spends one weekly support choice", () => {
		const { host, cycle } = recurring();
		const [lesson, meal] = cycle.events;
		assert(lesson && meal);
		const old = lesson.startsAt;
		host.intervene({ kind: "open-evening-slot", eventId: lesson.id });
		expect(host.s.controls).toBe(3);
		expect(lesson.startsAt).toBe(old + 1440);
		expect(meal.startsAt).toBe(old);
		expect(cycle.openedSlot).toMatchObject({
			eventId: lesson.id,
			from: old,
			to: old + 1440,
		});
		expect(canOpenEveningSlot(host.s, meal)).toBe(false);
		expect(() =>
			host.intervene({ kind: "open-evening-slot", eventId: meal.id }),
		).toThrow();
		expect(host.s.controls).toBe(3);
		expect(restoreRuntime(host.export()).export()).toEqual(host.export());
	});
	it("does not move posted promises or let failed interventions spend allowance", () => {
		const { host, cycle } = recurring();
		const meal = cycle.events[1];
		assert(meal);
		post(host, meal.id, "sam");
		const old = meal.startsAt;
		expect(() =>
			host.intervene({ kind: "open-evening-slot", eventId: meal.id }),
		).toThrow();
		expect(host.s.controls).toBe(3);
		expect(meal.startsAt).toBe(old);
		expect(() =>
			host.intervene({ kind: "advertise-evening", eventId: "missing" }),
		).toThrow();
		expect(host.s.controls).toBe(3);
	});
	it("broadcasts only an existing invitation to waking listeners with source provenance, never acceptance or attendance", () => {
		const { host, cycle } = recurring();
		const meal = cycle.events[1];
		assert(meal);
		post(host, meal.id, "sam");
		const ada = host.actor("ada"),
			musa = host.actor("musa");
		ada.person.body.asleep = false;
		musa.person.body.asleep = true;
		delete ada.job;
		delete musa.job;
		delete meal.replies.ada;
		delete meal.replies.musa;
		host.intervene({ kind: "advertise-evening", eventId: meal.id });
		expect(host.s.controls).toBe(3);
		expect(host.view().evenings?.find((e) => e.id === meal.id)).toMatchObject({
			advertisementReceipt: meal.advertisement,
			roomReserved: false,
		});
		expect(meal.advertisement).toMatchObject({
			source: "town-bulletin",
			causes: [meal.notice?.id],
		});
		expect(ada.received?.some((e) => e.id === meal.advertisement?.id)).toBe(
			true,
		);
		expect(meal.replies.ada).toMatchObject({
			bulletinEvent: meal.advertisement?.id,
			attendedMinutes: 0,
		});
		expect(
			allEvenings(host.export() as Save).find((e) => e.id === meal.id)?.replies
				.ada?.reply,
		).toBeUndefined();
		expect(meal.replies.musa).toBeUndefined();
		expect(() =>
			host.intervene({ kind: "advertise-evening", eventId: meal.id }),
		).toThrow();
		expect(host.s.controls).toBe(3);
	});
	it("a second date changes room feasibility at the same checkpoint without changing HF choices or delivery", () => {
		const { host, cycle } = recurring();
		const [lesson, meal] = cycle.events;
		assert(lesson && meal);
		const before = structuredClone(host.export()) as Save;
		host.intervene({ kind: "open-evening-slot", eventId: lesson.id });
		const control = new Runtime(before);
		const controlMeal = allEvenings(control.s).find((e) => e.id === meal.id);
		const controlClass = allEvenings(control.s).find((e) => e.id === lesson.id);
		assert(controlMeal && controlClass);
		meal.stage = controlMeal.stage = "prepared";
		lesson.stage = controlClass.stage = "proposed";
		expect(roomBooking(control.s, controlClass)?.id).toBe(meal.id);
		expect(roomBooking(host.s, lesson)).toBeUndefined();
		expect(host.s.people.map((r) => r.person)).toEqual(
			control.s.people.map((r) => r.person),
		);
		expect(lesson.replies).toEqual({});
		expect(finishEvening(host, host.actor("lea")).delivered).toBe(false);
	});
});

it("restores the broadcast receipt and keeps continued HF choices exact", () => {
	const { host, cycle } = recurring();
	const meal = cycle.events[1];
	assert(meal);
	post(host, meal.id, "sam");
	host.intervene({ kind: "advertise-evening", eventId: meal.id });
	const copy = restoreRuntime(host.export());
	expect(copy.export()).toEqual(host.export());
	for (let index = 0; index < 96 * 8; index++) {
		host.step();
		copy.step();
	}
	expect(copy.export()).toEqual(host.export());
	const packet = host.export() as Save;
	const restoredMeal = allEvenings(packet).find((e) => e.id === meal.id);
	assert(restoredMeal?.advertisement);
	restoredMeal.advertisement.causes = [];
	const support = packet.socialEvenings?.recurrence?.cycles[0]?.supportSpent;
	if (support) support.receipt.causes = [];
	expect(() => restoreRuntime(packet)).toThrow("Invalid evening advertisement");
});

it("a real multiweek HF town generates later cycles and restores exactly", () => {
	const host = opened();
	for (let round = 0; round < 96 * 31; round++) host.step();
	expect(
		host.s.socialEvenings?.recurrence?.cycles.length,
	).toBeGreaterThanOrEqual(4);
	const copy = restoreRuntime(host.export());
	for (let round = 0; round < 96; round++) {
		host.step();
		copy.step();
	}
	expect(copy.export()).toEqual(host.export());
	expect(host.s.controls).toBe(3);
}, 20000);

it("a matched advertisement changes received legal options without creating a promise", () => {
	const { host, cycle } = recurring();
	const meal = cycle.events[1];
	assert(meal);
	post(host, meal.id, "sam");
	const target = host.s.people.find(
		(r) =>
			!meal.replies[r.person.id] &&
			r.person.body.alive &&
			!r.person.body.asleep &&
			r.job?.offer.mode !== "sleep",
	);
	assert(target);
	const control = restoreRuntime(host.export()) as Runtime;
	expect(
		eveningOffers(control.s, control.actor(target.person.id)).some(
			(o) => o.id === `accept:${meal.id}`,
		),
	).toBe(false);
	host.intervene({ kind: "advertise-evening", eventId: meal.id });
	expect(
		eveningOffers(host.s, target).some((o) => o.id === `accept:${meal.id}`),
	).toBe(true);
	expect(target.person.agenda.commitments).toEqual(
		control.actor(target.person.id).person.agenda.commitments,
	);
	expect(meal.replies[target.person.id]?.attendedMinutes).toBe(0);
	expect(restoreRuntime(host.export()).export()).toEqual(host.export());
});

it("does not open a second date across another already posted appointment", () => {
	const { host, cycle } = recurring();
	const meal = cycle.events[1];
	const other = host.s.socialEvenings?.events[0];
	assert(meal && other);
	other.startsAt = meal.startsAt + 1440;
	other.endsAt = other.startsAt + 60;
	other.notice = {
		id: 1,
		at: host.s.now,
		kind: "evening-proposed",
		text: "already posted",
		causes: [],
		importance: 0.5,
	};
	expect(canOpenEveningSlot(host.s, meal)).toBe(false);
	expect(() =>
		host.intervene({ kind: "open-evening-slot", eventId: meal.id }),
	).toThrow();
	expect(host.s.controls).toBe(3);
});

it("restores beyond a full programme after HF prunes old closed promises", () => {
	const host = new Runtime(createRuntime(42, 8).export() as Save);
	for (let round = 0; round < 96 * 110; round++) host.step();
	expect(host.s.socialEvenings?.recurrence?.cycles).toHaveLength(12);
	const pruned = allEvenings(host.s).flatMap((e) =>
		Object.entries(e.replies).filter(
			([id, reply]) =>
				reply.reply === "accepted" &&
				!host
					.actor(id)
					.person.agenda.commitments.some((c) => c.id === reply.commitmentId),
		),
	);
	expect(pruned.length).toBeGreaterThan(0);
	const copy = restoreRuntime(host.export());
	for (let round = 0; round < 96; round++) {
		host.step();
		copy.step();
	}
	expect(copy.export()).toEqual(host.export());
	const recent = allEvenings(host.s)
		.toReversed()
		.flatMap((e) =>
			Object.entries(e.replies).map(([id, reply]) => ({ e, id, reply })),
		)
		.find(
			({ id, reply }) =>
				reply.reply === "accepted" &&
				host
					.actor(id)
					.person.agenda.commitments.some((c) => c.id === reply.commitmentId),
		);
	assert(recent);
	const broken = host.export() as Save;
	const person = broken.people.find((p) => p.person.id === recent.id);
	assert(person);
	person.person.agenda.commitments = person.person.agenda.commitments.filter(
		(c) => c.id !== recent.reply.commitmentId,
	);
	expect(() => restoreRuntime(broken)).toThrow(
		"Evening promise differs from reply",
	);
}, 30000);

function exhaustOriginalControls(host: Runtime) {
	// Model tools lent before the repairs finished, then resume the completed hall.
	const hall = host.s.hall;
	host.s.hall = 0;
	for (let i = 0; i < 3; i++) host.intervene({ kind: "lend-tools" });
	host.s.hall = hall;
	expect(host.s.controls).toBe(0);
}

it("a progressed town with no original allowance gets one shared support choice each week", () => {
	const { host, cycle } = recurring();
	exhaustOriginalControls(host);
	const [lesson, meal] = cycle.events;
	assert(lesson && meal);
	expect(
		host.view().evenings?.find((e) => e.id === lesson.id)?.supportRemaining,
	).toBe(1);
	host.intervene({ kind: "open-evening-slot", eventId: lesson.id });
	expect(host.s.controls).toBe(0);
	expect(host.view().stats.interventionsSpent).toBe(4);
	expect(
		host.view().evenings?.find((e) => e.id === meal.id)?.supportRemaining,
	).toBe(0);
	post(host, meal.id, "sam");
	expect(() =>
		host.intervene({ kind: "advertise-evening", eventId: meal.id }),
	).toThrow("No intervention allowance remains");
	expect(meal.advertisement).toBeUndefined();
	expect(host.view().stats.interventionsSpent).toBe(4);
	const copy = restoreRuntime(host.export());
	for (let round = 0; round < 96 * 8; round++) {
		host.step();
		copy.step();
	}
	expect(copy.export()).toEqual(host.export());
	const nextCycle = host.s.socialEvenings?.recurrence?.cycles[1];
	assert(nextCycle?.events[0]);
	expect(nextCycle.supportSpent).toBeUndefined();
	expect(
		host.view().evenings?.find((e) => e.id === nextCycle.events[0]?.id)
			?.supportRemaining,
	).toBe(1);
	host.intervene({
		kind: nextCycle.events[0].notice
			? "advertise-evening"
			: "open-evening-slot",
		eventId: nextCycle.events[0].id,
	});
	expect(host.view().stats.interventionsSpent).toBe(5);
	expect(host.s.controls).toBe(0);
	expect(restoreRuntime(host.export()).export()).toEqual(host.export());
});

it("uses weekly support first and spends original allowance only on a second action", () => {
	const { host, cycle } = recurring();
	const [lesson, meal] = cycle.events;
	assert(lesson && meal);
	host.intervene({ kind: "open-evening-slot", eventId: lesson.id });
	post(host, meal.id, "sam");
	host.intervene({ kind: "advertise-evening", eventId: meal.id });
	expect(host.s.controls).toBe(2);
	expect(cycle.supportSpent).toMatchObject({
		version: 1,
		kind: "open-evening-slot",
		eventId: lesson.id,
	});
	expect(host.view().stats.interventionsSpent).toBe(2);
	expect(restoreRuntime(host.export()).export()).toEqual(host.export());
});

it("a pilot invitation still uses original allowance and cannot use a future week's credit", () => {
	const host = opened();
	const meal = allEvenings(host.s)[1];
	assert(meal);
	post(host, meal.id, "sam");
	host.intervene({ kind: "advertise-evening", eventId: meal.id });
	expect(host.s.controls).toBe(2);
	expect(
		host.view().evenings?.find((e) => e.id === meal.id)?.supportRemaining,
	).toBeUndefined();
	expect(host.view().stats.interventionsSpent).toBe(1);
	expect(restoreRuntime(host.export()).export()).toEqual(host.export());
});

it("restoring a spent weekly choice does not refill it and rejects missing or contradictory receipts", () => {
	const { host, cycle } = recurring();
	exhaustOriginalControls(host);
	const lesson = cycle.events[0];
	assert(lesson);
	host.intervene({ kind: "open-evening-slot", eventId: lesson.id });
	const packet = host.export() as Save;
	const restored = restoreRuntime(packet);
	expect(restored.export()).toEqual(packet);
	expect(
		restored.view().evenings?.find((e) => e.id === lesson.id)?.supportRemaining,
	).toBe(0);
	const corrupt = structuredClone(packet);
	const spent = corrupt.socialEvenings?.recurrence?.cycles[0]?.supportSpent;
	assert(spent);
	spent.receipt.text += " fabricated";
	expect(() => restoreRuntime(corrupt)).toThrow(
		"Invalid weekly support receipt",
	);
	const missing = structuredClone(packet);
	delete missing.socialEvenings?.recurrence?.cycles[0]?.supportSpent;
	expect(() => restoreRuntime(missing)).toThrow(
		"Missing weekly support receipt",
	);
});

it("rejects forged weekly provenance even when both retained copies agree", () => {
	const { host, cycle } = recurring();
	const lesson = cycle.events[0];
	assert(lesson);
	host.intervene({ kind: "open-evening-slot", eventId: lesson.id });
	for (const corruptKind of ["actor", "causes", "time"]) {
		const packet = host.export() as Save;
		const corruptedCycle = packet.socialEvenings?.recurrence?.cycles[0];
		const slot = corruptedCycle?.openedSlot;
		const support = corruptedCycle?.supportSpent;
		assert(slot && support);
		if (corruptKind === "actor") slot.receipt.actorId = "sam";
		if (corruptKind === "causes") slot.receipt.causes = [slot.receipt.id - 1];
		if (corruptKind === "time") slot.receipt.at = slot.from - 4 * 1440 - 15;
		support.receipt = structuredClone(slot.receipt);
		expect(() => restoreRuntime(packet)).toThrow();
	}
});

it("an unused weekly choice expires with its cycle and cannot pay for ordinary interventions", () => {
	const { host, cycle } = recurring();
	exhaustOriginalControls(host);
	const oldEvent = cycle.events[0];
	assert(oldEvent);
	expect(() => host.intervene({ kind: "lend-tools" })).toThrow();
	for (let i = 0; i < 96 * 8; i++) host.step();
	expect(
		host.view().evenings?.find((e) => e.id === oldEvent.id)?.supportRemaining ??
			0,
	).toBe(0);
	const before = host.view().stats.interventionsSpent;
	expect(() =>
		host.intervene({ kind: "open-evening-slot", eventId: oldEvent.id }),
	).toThrow();
	expect(host.view().stats.interventionsSpent).toBe(before);
	expect(cycle.supportSpent).toBeUndefined();
	expect(restoreRuntime(host.export()).export()).toEqual(host.export());
});
