import { expect, it } from "vitest";
import { nativeMilliseconds } from "../src/core/hf4-run.ts";
import { clock as playerClock } from "../src/core/player.ts";
import { clock } from "../src/ui/format.ts";

it("formats a real one-millisecond public ingress as a minute without changing the actual clock", () => {
	const at = 480 + 1 / 60000;
	expect(nativeMilliseconds(at)).toBe(28800001);
	expect(clock(at)).toBe("08:00");
	expect(playerClock(at)).toBe("Day 1, 08:00");
	expect(nativeMilliseconds(at)).toBe(28800001);
});
