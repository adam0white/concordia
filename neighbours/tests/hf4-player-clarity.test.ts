import { expect, it } from "vitest";
import { createRuntime, restoreRuntime } from "./current-town.ts";

it("previews a present person's offers without changing the town or supplying an answer", () => {
	const live = createRuntime(42, 6);
	const before = live.export();
	const preview = live.predictSpeech("elin");
	expect(preview.targetId).toBe("elin");
	expect(preview.offers.length).toBeGreaterThan(0);
	expect(Object.keys(preview).sort()).toEqual([
		"at",
		"offers",
		"read",
		"targetId",
	]);
	for (const offer of preview.offers)
		expect(Object.keys(offer).sort()).toEqual(["affordanceId", "label"]);
	expect(live.export()).toEqual(before);
});

it("refuses invalid speech and speech while travelling without changing the live export", () => {
	const live = createRuntime(42, 6);
	const before = live.export();
	expect(() =>
		live.intervene({
			kind: "player-speak",
			actorId: "elin",
			affordanceId: "not-an-offer",
			mode: "ask",
		}),
	).toThrow();
	expect(live.export()).toEqual(before);
	live.intervene({ kind: "player-move", placeId: "hall" });
	const travelling = live.export();
	expect(() =>
		live.intervene({
			kind: "player-speak",
			actorId: "elin",
			affordanceId: "rest",
			mode: "ask",
		}),
	).toThrow("still travelling");
	expect(live.export()).toEqual(travelling);
});

it("rejects malformed player checkpoint state without changing the live town", () => {
	const live = createRuntime(42, 6);
	live.intervene({ kind: "player-move", placeId: "hall" });
	const before = live.export();
	const forged = structuredClone(before);
	if (!forged.physical.player) throw Error("Missing player after movement");
	forged.physical.player.place = "not-a-place";
	expect(() => restoreRuntime(forged)).toThrow();
	expect(live.export()).toEqual(before);
});
