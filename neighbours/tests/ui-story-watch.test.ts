import { describe, expect, it } from "vitest";
import {
	advanceStoryWatch,
	type StoryWatchInput,
	type StoryWatchState,
} from "../src/ui/useStoryWatch";

const initial: StoryWatchInput = {
	enabled: true,
	playing: true,
	seed: 42,
	now: 480,
	storyId: "first",
};
function sequence(inputs: StoryWatchInput[]) {
	let state: StoryWatchState | undefined;
	return inputs.map((input) => {
		const result = advanceStoryWatch(state, input);
		state = result.state;
		return result;
	});
}
describe("optional story watch", () => {
	it("does not pause on initial load, enabling, or resuming an existing story", () => {
		const results = sequence([
			initial,
			{ ...initial, enabled: false },
			{ ...initial, now: 495, storyId: "next" },
			{ ...initial, now: 510, storyId: "next" },
			{ ...initial, playing: false },
			initial,
		]);
		expect(results.every((result) => !result.pause)).toBe(true);
	});
	it("pauses once for a new latest story during forward playback and retains its status while paused", () => {
		const next = { ...initial, now: 495, storyId: "next" };
		const results = sequence([
			initial,
			next,
			next,
			{ ...next, playing: false },
			{ ...next, playing: true },
			{ ...next, now: 510 },
		]);
		expect(results.map((result) => result.pause)).toEqual([
			false,
			true,
			false,
			false,
			false,
			false,
		]);
		expect(results[3]?.state.pausedFor?.storyId).toBe("next");
		expect(results[4]?.state.pausedFor).toBeUndefined();
	});
	it("keeps continuous play when disabled", () => {
		expect(
			sequence([
				{ ...initial, enabled: false },
				{ ...initial, enabled: false, now: 495, storyId: "next" },
			]).some((result) => result.pause),
		).toBe(false);
	});
	it("baselines manual steps and forward imports while paused, new seeds, rewinds and loading", () => {
		const inputs = [
			initial,
			{ ...initial, playing: false },
			{ ...initial, playing: false, now: 900, storyId: "imported" },
			{ ...initial, now: 900, storyId: "imported" },
			{ ...initial, seed: 73, now: 915, storyId: "new-town" },
			{ ...initial, seed: 73, now: 500, storyId: "restored" },
			{ ...initial, seed: undefined, now: undefined, storyId: undefined },
			initial,
		];
		expect(sequence(inputs).some((result) => result.pause)).toBe(false);
	});
	it("clears the explanation after an explicit manual reset and never calls same-time changes new playback", () => {
		const stopped = { ...initial, now: 495, storyId: "next" };
		const results = sequence([
			initial,
			stopped,
			{ ...stopped, playing: false },
			{ ...stopped, playing: false, now: 510 },
			{ ...stopped, storyId: "other" },
		]);
		expect(
			advanceStoryWatch(undefined, { ...stopped, playing: false, now: 510 })
				.state.pausedFor,
		).toBeUndefined();
		expect(results[4]?.pause).toBe(false);
	});
	it("can stop at the first real story after an empty playback baseline", () => {
		expect(
			sequence([
				{ ...initial, storyId: undefined },
				{ ...initial, now: 495 },
			])[1]?.pause,
		).toBe(true);
	});
});

it("keeps the same story explanation when an already-pending round arrives after the pause, but clears on rewind", () => {
	const next = { ...initial, now: 495, storyId: "next" };
	const results = sequence([
		initial,
		next,
		{ ...next, playing: false, now: 510 },
		{ ...next, playing: false, now: 525 },
		{ ...next, playing: false, now: 510 },
	]);
	expect(results.map((result) => result.pause)).toEqual([
		false,
		true,
		false,
		false,
		false,
	]);
	expect(results[2]?.state.pausedFor?.storyId).toBe("next");
	expect(results[3]?.state.pausedFor?.storyId).toBe("next");
	expect(results[4]?.state.pausedFor).toBeUndefined();
});
