/** Fifteen simulated minutes per unchanged town round. Only the UI timer uses this rate. */
export function playbackRate(chosen: number, conversation: boolean) {
	const speed =
		new Map([
			[2400, "½×"],
			[1200, "1×"],
			[400, "3×"],
			[120, "10×"],
		]).get(chosen) ?? "Custom";
	if (conversation)
		return {
			interval: Math.max(chosen, 15000),
			label: "Slow · 1 min/s · conversation",
		};
	return { interval: chosen, label: `${speed} · ${15000 / chosen} min/s` };
}
