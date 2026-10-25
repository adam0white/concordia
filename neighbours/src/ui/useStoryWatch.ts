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
