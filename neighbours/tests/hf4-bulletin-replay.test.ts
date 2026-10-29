import { readRunHistory } from "@adam0white/human-framework";
import { expect, it } from "vitest";
import { required } from "../src/core/invariants.ts";
import { createRuntime, restoreRuntime } from "./current-town.ts";

it("cold restores a genuine default-town pending bulletin with complete wire replay and receives it once without redelivery", () => {
	const live = createRuntime(42, 6);
	live.intervene({ kind: "share-news" });
	const event = required(
		live.s.events.findLast((item) => item.source === "town-bulletin"),
		"Missing actual bulletin",
	);
	const perceptId = `town:${event.id}:ada`;
	expect(live.s.owner.attention("ada", perceptId)).toBeNull();
	expect(
		live.actor("ada").received?.some((item) => item.id === event.id),
	).not.toBe(true);
	const checkpoint = live.export(),
		cold = restoreRuntime(checkpoint);
	expect(cold.export()).toEqual(checkpoint);
	live.step();
	cold.step();
	expect(cold.export()).toEqual(live.export());
	expect(live.s.owner.attention("ada", perceptId)).toBeGreaterThan(0);
	expect(
		live.actor("ada").received?.filter((item) => item.id === event.id),
	).toHaveLength(1);
	const card = required(
		live.actor("ada").received?.find((item) => item.id === event.id),
		"Missing attended card",
	);
	expect(card.source).toBe("town-bulletin");
	expect(card.targetId).toBe("ada");
	live.step();
	cold.step();
	expect(cold.export()).toEqual(live.export());
	expect(
		live.actor("ada").received?.filter((item) => item.id === event.id),
	).toHaveLength(1);
	const deliveries = readRunHistory(live.s.owner.export().run)
		.flatMap((transaction) => transaction.inputs)
		.filter(
			(input) =>
				input.kind === "observation.received" &&
				input.payload.person === "ada" &&
				input.payload.percepts.some((percept) => percept.id === perceptId),
		);
	expect(deliveries).toHaveLength(1);
});
