import { expect, it } from "vitest";
import type { TownView } from "../src/contracts.ts";
import { hallOpportunities, hasHallChoice } from "../src/hall-choice.ts";

type Evening = NonNullable<TownView["evenings"]>[number];
const event = (changes: Partial<Evening> = {}): Evening => ({
	id: "weekly-0-class",
	kind: "class",
	organiserId: "lea",
	title: "Class",
	startsAt: 1000,
	endsAt: 1060,
	stage: "candidate",
	recurring: true,
	heard: 0,
	accepted: 0,
	attended: 0,
	participantIds: [],
	canOpenSlot: true,
	supportRemaining: 0,
	...changes,
});
const view = (events: Evening[], controlsRemaining = 0, now = 480) => ({
	now,
	controlsRemaining,
	evenings: events,
});
it("stops only at a displayed evening action with town or weekly support to use it", () => {
	expect(hasHallChoice(view([event()]))).toBe(false);
	expect(hasHallChoice(view([event()], 1))).toBe(true);
	expect(hasHallChoice(view([event({ supportRemaining: 1 })]))).toBe(true);
	expect(hasHallChoice(view([event({ canOpenSlot: false })], 3))).toBe(false);
});
it("includes active initial legal invitations as well as recurring opportunities", () => {
	const initial = event({
		id: "initial-meal",
		recurring: false,
		canOpenSlot: false,
		canAdvertise: true,
		startsAt: 900,
	});
	expect(hallOpportunities(view([event(), initial]))).toEqual([
		initial,
		event(),
	]);
	expect(hasHallChoice(view([initial], 1))).toBe(true);
	expect(
		hallOpportunities(
			view(
				[event({ recurring: false, canOpenSlot: false, canAdvertise: false })],
				1,
			),
		),
	).toEqual([]);
});
it("uses exactly the earliest two displayed opportunities rather than a hidden later action", () => {
	const first = event({ id: "first", startsAt: 800, canOpenSlot: false });
	const second = event({ id: "second", startsAt: 900, canOpenSlot: false });
	const third = event({ id: "third", startsAt: 1000, canOpenSlot: true });
	const current = view([third, second, first], 1);
	expect(hallOpportunities(current).map((e) => e.id)).toEqual([
		"first",
		"second",
	]);
	expect(hasHallChoice(current)).toBe(false);
});
it("does not stop on expired or closed opportunities, and preserves unfunded display", () => {
	expect(
		hasHallChoice(
			view([event({ endsAt: 480 }), event({ stage: "closed" })], 3),
		),
	).toBe(false);
	expect(hallOpportunities(view([event()]))).toEqual([event()]);
});
it("does not mutate the view or treat an annex situation as an evening choice", () => {
	const current = {
		...view(
			[event({ startsAt: 2000 }), event({ id: "second", startsAt: 1000 })],
			0,
		),
		assistance: { opened: false },
	};
	const before = structuredClone(current);
	hallOpportunities(current);
	hasHallChoice(current);
	expect(current).toEqual(before);
	expect(hasHallChoice({ ...current, evenings: [] })).toBe(false);
});
