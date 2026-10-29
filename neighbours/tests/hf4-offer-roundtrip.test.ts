import { expect, it } from "vitest";
import { reviewOffers } from "../src/core/activity-reviews.ts";
import { handcartOffers } from "../src/core/handcart.ts";
import { addCommitment, addGoal } from "../src/core/hf4-effects.ts";
import { nativeOffer, physicalOffer } from "../src/core/hf4-offers.ts";
import { required } from "../src/core/invariants.ts";
import { createRuntime, restoreRuntime } from "./current-town.ts";

// SCOPE: actual six-person HF repair choice and complete host/native cold replay;
// separate authored handcart offer fixture, not a natural cart acceptance/day proof.
// The 15s allowance covers actual choice, complete native cold replay and next-step correctness.
it("preserves authored repair demands through the actual job and continuation review", () => {
	const live = createRuntime(42, 6);
	for (let round = 0; round < 5; round++) live.step();
	const ada = live.actor("ada");
	const job = required(ada.job, "Missing actual repair job");
	expect(job.offer.id).toBe("repair");
	const registered = required(
		live.s.owner.offers(ada.id).find((offer) => offer.id === "repair"),
		"Missing native repair",
	);
	expect(registered.demands.skill).toEqual({
		id: "repair",
		difficulty: 0.4,
		domain: "motor",
	});
	expect(nativeOffer(ada.id, job.offer)).toEqual(registered);
	const continued = required(
		reviewOffers(live.s, ada).find((offer) => offer.id === "repair"),
		"Missing continuation",
	);
	expect(nativeOffer(ada.id, continued)).toEqual({
		...registered,
		durationMs: Math.round((job.end - live.s.now) * 60000),
	});
	const cold = restoreRuntime(live.export());
	expect(cold.export()).toEqual(live.export());
	live.step();
	cold.step();
	expect(cold.export()).toEqual(live.export());
}, 15000);
it("preserves every mapped field of actual authored fast and slow handcart offers", () => {
	const town = createRuntime(42, 6);
	town.s.handcart = {
		version: 1,
		activatedAt: town.s.now,
		progress: 0,
		work: [],
		requests: [],
	};
	const cart = town.s.handcart;
	cart.raviGoalId = addGoal(town.s, "ravi", {
		label: "Isolated cart offer roundtrip",
		serves: ["competence"],
		importance: 0.5,
		advancedBy: [{ action: "cart-fast", amount: 1 }],
	}).id;
	const from = town.s.now,
		until = from + 60;
	const commitmentId = addCommitment(town.s, "ada", {
		kind: "abstain",
		toId: "ravi",
		actions: [],
		violatedBy: ["work"],
		from,
		until,
		importance: 0.5,
		label: "Isolated cart offer window",
	}).id;
	cart.bench = { requestId: 1, from, until, commitmentId };
	const offers = handcartOffers(town.s, town.actor("ravi"));
	for (const id of ["cart-fast", "cart-slow"]) {
		const authored = required(
			offers.find((offer) => offer.id === id),
			`Missing ${id}`,
		);
		const native = nativeOffer("ravi", authored);
		expect(native.demands.skill).toEqual({
			id: "repair",
			difficulty: 0.4,
			domain: "motor",
		});
		expect(nativeOffer("ravi", physicalOffer(native))).toEqual(native);
	}
});
