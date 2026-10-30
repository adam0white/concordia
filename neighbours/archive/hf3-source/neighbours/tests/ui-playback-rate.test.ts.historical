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

it("uses menu pacing choices while inspection and occupation apply their own slowdowns", async () => {
	const { automaticPlaybackRate } = await import("../src/ui/playback-rate");
	expect(automaticPlaybackRate("automatic", false, false).interval).toBe(1200);
	expect(automaticPlaybackRate("slow", false, false).interval).toBe(2400);
	expect(automaticPlaybackRate("steady", false, false).interval).toBe(1200);
	expect(automaticPlaybackRate("fast", false, false).interval).toBe(400);
	expect(automaticPlaybackRate("fast", true, false).interval).toBe(2400);
	expect(automaticPlaybackRate("fast", false, false, true).interval).toBe(1200);
	expect(automaticPlaybackRate("fast", true, true).interval).toBe(0);
});

it("holds each fresh headline for eight seconds with the story watch detector", async () => {
	const { STORY_READING_MS } = await import("../src/ui/playback-rate");
	expect(STORY_READING_MS).toBe(8000);
});
