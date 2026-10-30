import { describe, expect, it } from "vitest";
import type { TownView } from "../src/contracts";
import { skipStopReason } from "../src/ui/playback-rate";

function town(overrides: Partial<TownView> = {}): TownView {
	return {
		seed: 42,
		now: 540,
		stories: [],
		people: [],
		controlsRemaining: 3,
		player: { placeId: "hall", notices: 0 },
		...overrides,
	} as TownView;
}
const person = (placeId: string, known = true) =>
	({ id: "ada", known, placeId }) as TownView["people"][number];
const job = (kind: "travel" | "work") =>
	({ kind, endsAt: 600 }) as NonNullable<
		NonNullable<TownView["player"]>["job"]
	>;

describe("UI skip stops on the first relevant actual round", () => {
	it("continues across a round with no event", () => {
		const start = town();
		expect(skipStopReason(start, start, town({ now: 555 }), 1)).toBeUndefined();
	});
	it.each(["travel", "work"] as const)(
		"stops when the player's %s ends",
		(kind) => {
			const start = town({
				player: { ...town().player, job: job(kind) } as NonNullable<
					TownView["player"]
				>,
			});
			expect(skipStopReason(start, start, town({ now: 600 }), 4)).toMatch(
				/ended/,
			);
		},
	);
	it("stops on a new or repeated headline", () => {
		const story = {
			id: "one",
			title: "A promise kept",
			eventIds: [1],
		} as TownView["stories"][number];
		const start = town({ stories: [story] });
		expect(
			skipStopReason(
				start,
				start,
				town({ stories: [{ ...story, eventIds: [1, 2] }] }),
				1,
			),
		).toBe("A promise kept");
	});
	it("stops on familiar arrival but ignores a background arrival", () => {
		const start = town({ people: [person("quay")] });
		expect(
			skipStopReason(start, start, town({ people: [person("hall")] }), 1),
		).toBe("A familiar neighbour arrived");
		expect(
			skipStopReason(
				start,
				start,
				town({ people: [person("hall", false)] }),
				1,
			),
		).toBeUndefined();
	});
	it("stops on replies, next morning, and the round cap", () => {
		const start = town();
		expect(
			skipStopReason(
				start,
				start,
				town({
					player: { ...start.player, notices: 1 } as NonNullable<
						TownView["player"]
					>,
				}),
				1,
			),
		).toBeDefined();
		expect(skipStopReason(start, start, town({ now: 1800 }), 84)).toBe(
			"The next morning",
		);
		expect(skipStopReason(start, start, town({ now: 555 }), 672)).toBe(
			"Seven days have passed",
		);
	});
	it("uses the immediately following six o'clock when skipping before dawn", () => {
		const start = town({ now: 300 });
		expect(skipStopReason(start, start, town({ now: 360 }), 4)).toBe(
			"The next morning",
		);
	});
});

it("stops when a new actionable evening appears even while another choice remains", () => {
	const evening = (id: string) =>
		({
			id,
			canOpenSlot: true,
			endsAt: 1200,
			startsAt: 1000,
			stage: "open",
		}) as NonNullable<TownView["evenings"]>[number];
	const start = town({ evenings: [evening("first")] });
	expect(
		skipStopReason(
			start,
			start,
			town({ evenings: [evening("first"), evening("next")] }),
			1,
		),
	).toBe("Evening choices are available");
});

it("returns the new player notice instead of an unchanged old story", () => {
	const story = {
		id: "one",
		title: "An older story",
		eventIds: [1],
	} as TownView["stories"][number];
	const start = town({ stories: [story] });
	const next = town({
		stories: [story],
		player: {
			...start.player,
			notices: 1,
			latestNotice: { text: "Ada replied", at: 555, eventId: 2 },
		} as NonNullable<TownView["player"]>,
	});
	expect(skipStopReason(start, start, next, 1)).toBe("Ada replied");
});
