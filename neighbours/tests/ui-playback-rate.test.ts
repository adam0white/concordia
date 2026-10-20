import { expect, it } from "vitest";
import { playbackRate } from "../src/ui/playback-rate";

it("slows an unresolved conversation to one minute per second without replacing the chosen speed", () => {
	expect(playbackRate(120, true)).toEqual({
		interval: 15000,
		label: "Slow · 1 min/s · conversation",
	});
	expect(playbackRate(120, false)).toEqual({
		interval: 120,
		label: "10× · 125 min/s",
	});
});
it("labels each chosen rate in simulation minutes per real second", () => {
	for (const [interval, speed, minutes] of [
		[2400, "½×", "6.25"],
		[1200, "1×", "12.5"],
		[400, "3×", "37.5"],
	] as const)
		expect(playbackRate(interval, false)).toEqual({
			interval,
			label: `${speed} · ${minutes} min/s`,
		});
});
