import { expect, it } from "vitest";
import { playbackRate, storyReadingKey } from "../src/ui/playback-rate";

it("holds an actual conversation and keeps empty stretches brisk", () => {
	expect(playbackRate(true).interval).toBe(0);
	expect(playbackRate(false).interval).toBe(1200);
	expect(playbackRate(false, false, 120).interval).toBe(120);
	expect(playbackRate(false, true, 120).interval).toBe(1200);
	expect(playbackRate(false, true).interval).toBe(1200);
});

it("notices newest-first stories and repeats whose retained id stays the same", () => {
	const first = {
		seed: 42,
		stories: [
			{ id: "new", eventIds: [2] },
			{ id: "old", eventIds: [1] },
		],
	} satisfies {
		seed: number;
		stories: [
			{ id: string; eventIds: number[] },
			{ id: string; eventIds: number[] },
		];
	};
	const view = (value: typeof first) =>
		value as unknown as import("../src/contracts").TownView;
	const key = storyReadingKey(view(first));
	expect(
		storyReadingKey(
			view({
				...first,
				stories: [
					{ ...first.stories[0], id: "newer", eventIds: [3] },
					first.stories[1],
				],
			}),
		),
	).not.toBe(key);
	expect(
		storyReadingKey(
			view({
				...first,
				stories: [{ ...first.stories[0], eventIds: [2, 3] }, first.stories[1]],
			}),
		),
	).not.toBe(key);
});
