import { expect, it } from "vitest";
import { TownRunOwner } from "../src/core/hf4-owner.ts";
import { createTownRun } from "../src/core/hf4-run.ts";
import type { Affordance } from "../src/core/host-types.ts";

it("asks through actual advice and decision inputs and preserves the real pending action", () => {
	const owner = new TownRunOwner(createTownRun(42, 6));
	const offers: Affordance[] = [
		{
			id: "rest",
			action: "rest",
			label: "Rest at home",
			placeId: "homes",
			duration: 45,
			effort: 0,
			advertises: { leisure: 0.3 },
		},
		{
			id: "drink",
			action: "drink",
			label: "Drink water here",
			placeId: "homes",
			duration: 15,
			effort: 0,
			advertises: { water: 0.7 },
		},
	];
	const before = owner.export();
	const preview = owner.previewAdvice("ada", offers, {
		voiceId: "player",
		affordanceId: "drink",
		strength: 0.5,
	});
	expect(preview.voiceId).toBe("player");
	expect(owner.export()).toEqual(before);
	const response = owner.requestAdvice("ada", offers, {
		voiceId: "player",
		affordanceId: "drink",
		strength: 0.5,
	});
	expect(response.voiceId).toBe("player");
	expect(
		owner
			.export()
			.run.history.at(-1)
			?.inputs.some((input) => input.kind === "suggestion.received"),
	).toBe(true);
	expect(owner.last?.boundary.type).toBe("world-required");
});
