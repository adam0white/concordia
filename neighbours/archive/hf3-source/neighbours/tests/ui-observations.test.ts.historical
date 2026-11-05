import { describe, expect, it } from "vitest";
import type { TownEvent, TownView } from "../src/contracts";
import { observe } from "../src/ui/observations";

const event = (id: number, actorId: string): TownEvent => ({
	id,
	at: id,
	actorId,
	kind: "started",
	text: `Event ${id}`,
	causes: [],
	importance: 0.3,
});
const town = (now: number, events: TownEvent[], seed = 42) =>
	({
		seed,
		now,
		events,
		people: [{ id: "ada", known: true, history: [] }],
	}) as unknown as TownView;
describe("observed UI feed", () => {
	it("keeps actual familiar events when a background burst fills the next packet", () => {
		const first = observe(undefined, town(10, [event(1, "ada")]));
		const burst = observe(
			first,
			town(
				20,
				Array.from({ length: 200 }, (_, i) => event(i + 2, "background")),
			),
		);
		expect(burst.events).toEqual([event(1, "ada")]);
	});
	it("clears later observations on rewind and on a different seed", () => {
		const first = observe(undefined, town(20, [event(10, "ada")]));
		expect(observe(first, town(5, [event(2, "ada")])).events).toEqual([
			event(2, "ada"),
		]);
		expect(observe(first, town(30, [], 99)).events).toEqual([]);
	});
	it("bounds retained evidence without changing original event IDs or ancestry", () => {
		const result = observe(
			undefined,
			town(
				300,
				Array.from({ length: 220 }, (_, i) => event(i, "ada")),
			),
		);
		expect(result.events).toHaveLength(160);
		expect(result.events[0]?.id).toBe(60);
	});
});
it("groups class outcomes only with a shared delivered cohort identifier", async () => {
	const { groupStories } = await import("../src/ui/observations");
	const view = {
		...town(10, []),
		stories: [
			{
				id: "s1",
				kind: "lesson",
				title: "Class",
				summary: "Ada learned",
				eventIds: [1],
				groupId: "lesson:10:school",
			},
			{
				id: "s2",
				kind: "lesson",
				title: "Class",
				summary: "Musa learned",
				eventIds: [2],
				groupId: "lesson:10:school",
			},
			{
				id: "s3",
				kind: "lesson",
				title: "Class",
				summary: "Jo learned later",
				eventIds: [3],
				groupId: "lesson:20:school",
			},
		],
	};
	const groups = groupStories(view, undefined);
	expect(groups).toHaveLength(2);
	expect(groups[0]?.eventIds).toEqual([1, 2]);
	expect(groups[0]?.summaries).toEqual(["Ada learned", "Musa learned"]);
});

it("retains significant background consequences on the normalized importance scale", () => {
	const major = {
		...event(1, "background"),
		importance: 0.9,
		kind: "hall-open",
	};
	expect(
		observe(undefined, town(10, [major, event(2, "background")])).events,
	).toEqual([major]);
});
it("preserves declared pruned ancestry when grouping stories", async () => {
	const { groupStories } = await import("../src/ui/observations");
	const view = {
		...town(10, []),
		stories: [
			{
				id: "s",
				kind: "hall-open",
				title: "Opened",
				summary: "Actual opening",
				eventIds: [1, 2],
				missingEventIds: [1],
			},
		],
	};
	expect(groupStories(view, undefined)[0]?.missingEventIds).toEqual([1]);
});
