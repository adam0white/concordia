import { readRunHistory } from "@adam0white/human-framework";
import { expect, it } from "vitest";
import { presentAt } from "../src/core/encounters.ts";
import { TownRunOwner } from "../src/core/hf4-owner.ts";
import { privateConversationOffers } from "../src/core/player.ts";
import { createRuntime, restoreRuntime } from "./current-town.ts";

// SCOPE: physical locations of both private choices at an actual arrived job.
// Current controls below retain hearing, actual choice, one-minute completion and cold replay.
it("places both private alternatives at the resident's arrived destination", () => {
	const live = createRuntime(42, 6);
	live.intervene({ kind: "player-move", placeId: "hall" });
	expect(() =>
		live.intervene({ kind: "player-private", actorId: "noor" }),
	).toThrow("still travelling");
	for (let round = 0; round < 4; round++) live.step();
	const noor = live.actor("noor");
	expect(noor.place).toBe("homes");
	expect(noor.job?.offer.placeId).toBe("hall");
	expect(presentAt(noor, "hall", live.s.now)).toBe(true);
	expect(presentAt(noor, "homes", live.s.now)).toBe(false);
	const offers = privateConversationOffers(noor, live.s.now);
	expect(
		offers.map((offer) => [offer.id, offer.placeId, offer.duration]),
	).toEqual([
		["private-share", "hall", 1],
		["private-decline", "hall", 1],
	]);
});

it("finishes an arrived resident's actual private choice for one minute at the same place", () => {
	const live = createRuntime(42, 6);
	live.intervene({ kind: "player-move", placeId: "hall" });
	for (let round = 0; round < 4; round++) live.step();
	let requests = 0;
	// Diagnostic bound catches repeated requests for the same already-reached instant.
	// It changes no host/native clock, activity duration or product deadline.
	TownRunOwner.onStepRequest = () => {
		if (++requests > 50)
			throw Error("Private completion made no bounded progress");
	};
	try {
		expect(() =>
			live.intervene({ kind: "player-private", actorId: "noor" }),
		).not.toThrow();
	} finally {
		TownRunOwner.onStepRequest = undefined;
	}
	const packet = live.export();
	const noor = live.actor("noor");
	const decision = live.s.owner
		.actor("noor")
		.trace.findLast((record) =>
			["private-share", "private-decline"].includes(
				record.chosenAffordanceId ?? "",
			),
		);
	expect(decision).toBeDefined();
	expect(noor.privateConversation).toBeUndefined();
	expect(noor.place).toBe("hall");
	const answer = live.s.events.findLast(
		(event) => event.kind === "player-answer",
	);
	expect(answer?.placeId).toBe("hall");
	if (decision?.chosenAffordanceId === "private-share")
		expect(noor.disclosures?.at(-1)?.text).toBe(answer?.text);
	else {
		expect(noor.disclosures).toBeUndefined();
		expect(answer?.text).toContain("keeps the matter private");
	}
	const resolutions = readRunHistory(packet.owner.run)
		.flatMap((entry) => entry.inputs)
		.filter(
			(input) =>
				input.kind === "action.resolved" &&
				input.payload.person === "noor" &&
				input.payload.outcome?.offerId === decision?.chosenAffordanceId &&
				input.payload.outcome?.status === "completed",
		);
	expect(resolutions).toHaveLength(1);
	const outcome = resolutions[0];
	if (outcome?.kind !== "action.resolved" || !outcome.payload.outcome)
		throw Error("Missing actual completed private action");
	expect(outcome.payload.outcome.end - outcome.payload.outcome.start).toBe(
		60000,
	);
	const cold = restoreRuntime(packet);
	const journalCold = restoreRuntime(live.exportJournal());
	expect(cold.export()).toEqual(packet);
	expect(journalCold.export()).toEqual(packet);
	live.step();
	cold.step();
	journalCold.step();
	expect(cold.export()).toEqual(live.export());
	expect(journalCold.export()).toEqual(live.export());
});

it("refuses private speech while the resident travels past the stationary player", () => {
	const live = createRuntime(42, 6);
	live.step();
	const noor = live.actor("noor");
	expect(noor.place).toBe("homes");
	expect(noor.job?.offer.placeId).toBe("hall");
	expect(noor.job?.arrive).toBeGreaterThan(live.s.now);
	expect(presentAt(noor, "homes", live.s.now)).toBe(false);
	const before = live.export();
	expect(() =>
		live.intervene({ kind: "player-private", actorId: "noor" }),
	).toThrow("not here and awake");
	expect(live.export()).toEqual(before);
});
