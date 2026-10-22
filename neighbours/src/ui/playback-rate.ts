import type { TownView } from "../contracts";
import { hallOpportunities } from "../hall-choice";
export type PacingMode = "automatic" | "slow" | "steady" | "fast";
export const STORY_READING_MS = 8000;
export function automaticPlaybackRate(
	mode: PacingMode,
	inspecting: boolean,
	held: boolean,
	occupied = false,
) {
	const speed = mode === "slow" ? 2400 : mode === "fast" ? 400 : 1200;
	return held
		? { interval: 0, label: "Time holds while you read" }
		: {
				interval: inspecting
					? Math.max(2400, speed)
					: occupied
						? Math.max(1200, speed)
						: speed,
				label: inspecting ? "Slowed while you look" : "Time passing",
			};
}
/** Compare consecutive real rounds. UI timing never enters saved state. */
export function skipStopReason(
	start: TownView,
	previous: TownView,
	view: TownView,
	rounds: number,
): string | undefined {
	if (
		storyReadingKey({ ...previous, player: undefined }) !==
		storyReadingKey({ ...view, player: undefined })
	)
		return (
			view.stories[0]?.title ?? view.player?.latestNotice?.text ?? "A new story"
		);
	if (previous.player?.job && !view.player?.job)
		return previous.player.job.kind === "travel"
			? "Your walk ended"
			: "Your work hour ended";
	if (
		view.player?.placeId &&
		view.people.some(
			(person) =>
				person.known &&
				person.placeId === view.player?.placeId &&
				!person.journey &&
				!previous.people.some(
					(old) =>
						old.id === person.id &&
						old.placeId === view.player?.placeId &&
						!old.journey,
				),
		)
	)
		return "A familiar neighbour arrived";
	if ((view.player?.notices ?? 0) > (previous.player?.notices ?? 0))
		return view.player?.latestNotice?.text ?? "A reply or request arrived";
	const choices = (town: TownView) =>
		hallOpportunities(town)
			.filter(
				(event) =>
					(event.canOpenSlot || event.canAdvertise) &&
					town.controlsRemaining + (event.supportRemaining ?? 0) > 0,
			)
			.map((event) => event.id);
	const previousChoices = new Set(choices(previous));
	if (choices(view).some((id) => !previousChoices.has(id)))
		return "Evening choices are available";
	const nextMorning = (Math.floor((start.now - 360) / 1440) + 1) * 1440 + 360;
	if (view.now >= nextMorning) return "The next morning";
	if (rounds >= 672) return "Seven days have passed";
	return undefined;
}
/** Fifteen simulated minutes per unchanged town round. UI timing never enters saves. */
export function playbackRate(
	conversation: boolean,
	occupied = false,
	speed = 1200,
) {
	return conversation
		? { interval: 0, label: "Time held · conversation" }
		: {
				interval: occupied ? Math.max(1200, speed) : speed,
				label: "Time passing",
			};
}

/** Newest-first stories may retain their id when repeated events are collapsed. */
export function storyReadingKey(
	view: Pick<TownView, "seed" | "stories" | "player">,
) {
	const latest = view.stories[0];
	return `${view.seed}:${latest?.id ?? ""}:${latest?.eventIds.join(",") ?? ""}:${view.player?.notices ?? 0}`;
}
