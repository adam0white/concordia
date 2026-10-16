import { useEffect, useRef, useState } from "react";

export interface StoryWatchInput {
	enabled: boolean;
	playing: boolean;
	seed?: number;
	now?: number;
	storyId?: string;
}
type StoryStop = { seed: number; now: number; storyId: string };
export interface StoryWatchState extends StoryWatchInput {
	pausedFor?: StoryStop;
}
/** A story change counts only across uninterrupted forward playback. */
export function advanceStoryWatch(
	previous: StoryWatchState | undefined,
	input: StoryWatchInput,
): { state: StoryWatchState; pause: boolean } {
	const pause = Boolean(
		previous?.enabled &&
			previous.playing &&
			input.enabled &&
			input.playing &&
			input.seed !== undefined &&
			input.seed === previous.seed &&
			input.now !== undefined &&
			previous.now !== undefined &&
			input.now > previous.now &&
			input.storyId &&
			input.storyId !== previous.storyId,
	);
	const held = previous?.pausedFor;
	const pausedFor = pause
		? {
				seed: input.seed as number,
				now: input.now as number,
				storyId: input.storyId as string,
			}
		: !(input.playing && !previous?.playing) &&
				input.enabled &&
				held &&
				held.seed === input.seed &&
				input.now !== undefined &&
				previous.now !== undefined &&
				input.now >= previous.now &&
				held.now <= input.now &&
				held.storyId === input.storyId
			? held.now === input.now
				? held
				: { ...held, now: input.now }
			: undefined;
	return { state: { ...input, pausedFor }, pause };
}
export function useStoryWatch(
	input: Omit<StoryWatchInput, "enabled">,
	pause: () => void,
) {
	const [enabled, setEnabled] = useState(true);
	const [pausedFor, setPausedFor] = useState<StoryStop>();
	const previous = useRef<StoryWatchState | undefined>(undefined);
	const { playing, seed, now, storyId } = input;
	useEffect(() => {
		const result = advanceStoryWatch(previous.current, {
			enabled,
			playing,
			seed,
			now,
			storyId,
		});
		previous.current = result.state;
		setPausedFor(result.state.pausedFor);
		if (result.pause) pause();
	}, [enabled, playing, seed, now, storyId, pause]);
	return {
		enabled,
		setEnabled,
		resetBaseline: () => {
			previous.current = undefined;
			setPausedFor(undefined);
		},
		paused:
			Boolean(pausedFor) &&
			!playing &&
			pausedFor?.seed === seed &&
			pausedFor?.now === now &&
			pausedFor?.storyId === storyId,
	};
}
