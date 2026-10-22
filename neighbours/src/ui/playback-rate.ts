import type { TownView } from "../contracts";
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
