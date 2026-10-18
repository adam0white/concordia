import { expect, it } from "vitest";
import type { TownView } from "../src/contracts.ts";
import { hasHallChoice } from "../src/hall-choice.ts";

it("stops only at a hall action with town or weekly support to use it", () => {
	const event = { canOpenSlot: true, supportRemaining: 0 } as NonNullable<
		TownView["evenings"]
	>[number];
	expect(hasHallChoice({ controlsRemaining: 0, evenings: [event] })).toBe(
		false,
	);
	expect(hasHallChoice({ controlsRemaining: 1, evenings: [event] })).toBe(true);
	expect(
		hasHallChoice({
			controlsRemaining: 0,
			evenings: [{ ...event, supportRemaining: 1 }],
		}),
	).toBe(true);
	expect(
		hasHallChoice({
			controlsRemaining: 3,
			evenings: [{ ...event, canOpenSlot: false }],
		}),
	).toBe(false);
});
