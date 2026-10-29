import { expect, it } from "vitest";
import { scheduledFoodDelivery } from "../src/core/supply.ts";

it("supplies roughly three daily meals per resident at both supported scales", () => {
	for (const population of [8, 208, 300]) {
		let total = 0;
		for (let round = 16; round <= 96 * 30; round += 16)
			total += scheduledFoodDelivery(42, round, population, 0);
		expect(total / population / 30).toBeGreaterThan(2.4);
		expect(total / population / 30).toBeLessThan(3.8);
	}
});
it("stops replenishment at a finite pantry and fills only available space", () => {
	expect(scheduledFoodDelivery(42, 16, 208, 1248)).toBe(0);
	expect(scheduledFoodDelivery(42, 16, 208, 1246)).toBe(2);
});
it("keeps delivery weather independent of resident order and delivery finite", () => {
	const first = scheduledFoodDelivery(42, 16, 208, 0);
	expect(scheduledFoodDelivery(42, 16, 208, 0)).toBe(first);
	expect(first).toBeGreaterThanOrEqual(Math.floor(208 * 0.4));
	expect(first).toBeLessThanOrEqual(Math.ceil(208 * 0.6));
	expect(scheduledFoodDelivery(42, 15, 208, 0)).toBe(0);
});
