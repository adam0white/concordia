import { required } from "../src/core/invariants.ts";
/** Isolated handcart physical faculty fixture with one actual six-person public
 * Run. Synthetic physical jobs test the meeting/receipt contract; this is not a
 * natural canonical hall/cart trajectory or a model/player experiment.
 */

import { replay } from "@adam0white/human-framework";
import { expect, it } from "vitest";
import {
	cartSupplyBonus,
	finishHandcart,
	settleCartReceipts,
} from "../src/core/handcart.ts";
import { TownRunOwner } from "../src/core/hf4-owner.ts";
import { MINUTE, nativeMilliseconds } from "../src/core/hf4-run.ts";
import { type NativeTownArchive, Runtime } from "../src/core/runtime.ts";
import type { Resident } from "../src/core/state.ts";
import { createRuntime } from "./current-town.ts";

function fixture() {
	const runtime = createRuntime(42, 6);
	runtime.s.handcart = {
		version: 1,
		activatedAt: runtime.s.now,
		progress: 0,
		work: [],
		requests: [],
	};
	return runtime;
}
function physicalMeeting(runtime: Runtime, person: Resident, action: string) {
	const start = runtime.s.now;
	const location = person.place;
	const event = runtime.event(
		"started",
		`Physical ${action} fixture started.`,
		person.id,
		location,
	);
	person.job = {
		personId: person.id,
		activityId: `physical-fixture:${event}`,
		startedAt: nativeMilliseconds(start),
		offer: {
			id: action,
			action,
			label: action,
			placeId: location,
			targetId:
				action === "cart-handover"
					? "jo"
					: person.id === "ravi"
						? "ada"
						: "ravi",
			duration: 15,
			effort: 0.1,
			tags: ["social"],
			advertises: {},
		},
		from: location,
		arrive: start,
		end: start + 15,
		event,
		food: 0,
		tools: 0,
	};
	runtime.s.owner.advance(nativeMilliseconds(start + 15));
	runtime.s.now = runtime.s.owner.at / MINUTE;
	const result = finishHandcart(runtime, person);
	delete person.job;
	person.idleSince = runtime.s.now;
	return result;
}
function received(runtime: Runtime) {
	runtime.s.owner.advance(runtime.s.owner.at + 1);
	runtime.s.now = runtime.s.owner.at / MINUTE;
	settleCartReceipts(runtime.s);
}
function coldFaculty(runtime: Runtime) {
	const packet = JSON.parse(
		JSON.stringify(runtime.export()),
	) as NativeTownArchive;
	expect(replay(packet.owner.run).ok).toBe(true);
	return Runtime.hydrate(packet, TownRunOwner.restore(packet.owner));
}
it("waits for actual received request/agreement, cold continues pending receipts and settles exactly once", () => {
	const live = fixture();
	const result = physicalMeeting(live, live.actor("ravi"), "cart-ask");
	expect(result.pending).toBe(true);
	expect(live.s.handcart?.pending).toHaveLength(1);
	expect(live.s.handcart?.requests).toEqual([]);
	expect(live.s.handcart?.bench).toBeUndefined();
	settleCartReceipts(live.s);
	expect(live.s.handcart?.requests).toEqual([]);
	const cold = coldFaculty(live);
	received(live);
	received(cold);
	expect(cold.export()).toEqual(live.export());
	expect(live.s.handcart?.requests).toHaveLength(1);
	expect(physicalMeeting(live, live.actor("ada"), "cart-agree").pending).toBe(
		true,
	);
	expect(live.s.handcart?.bench).toBeUndefined();
	const agreedCold = coldFaculty(live);
	received(live);
	received(agreedCold);
	expect(agreedCold.export()).toEqual(live.export());
	const bench = live.s.handcart?.bench;
	expect(bench).toBeDefined();
	expect(live.s.handcart?.requests[0]?.reply).toBe("agree");
	const before = live.export();
	settleCartReceipts(live.s);
	expect(live.export()).toEqual(before);
	live.s.owner.advance(live.s.owner.at + 1);
	expect(
		live.s.owner
			.actor("ada")
			.agenda.commitments.some(
				(commitment) => commitment.id === bench?.commitmentId,
			),
	).toBe(true);
});
it("retains a genuine refusal without a bench reservation or duplicate promise", () => {
	const runtime = fixture();
	physicalMeeting(runtime, runtime.actor("ravi"), "cart-ask");
	received(runtime);
	physicalMeeting(runtime, runtime.actor("ada"), "cart-refuse");
	expect(runtime.s.handcart?.bench).toBeUndefined();
	received(runtime);
	expect(runtime.s.handcart?.requests[0]?.reply).toBe("refuse");
	expect(runtime.s.handcart?.bench).toBeUndefined();
	expect(runtime.s.handcart?.requests[0]?.commitmentId).toBeUndefined();
});
it("keeps completed cart sections separate from actual attended handover", () => {
	const runtime = fixture();
	const c = required(runtime.s.handcart, "Missing cart");
	c.progress = 3;
	expect(cartSupplyBonus(runtime.s, "jo", "supply")).toBe(0);
	// A remote recipient does not turn physical cart completion into handover.
	expect(
		physicalMeeting(runtime, runtime.actor("ravi"), "cart-handover").delivered,
	).toBe(false);
	expect(c.handover).toBeUndefined();
	expect(cartSupplyBonus(runtime.s, "jo", "supply")).toBe(0);
	runtime.actor("ravi").place = "quay";
	const local = physicalMeeting(
		runtime,
		runtime.actor("ravi"),
		"cart-handover",
	);
	expect(local.pending).toBe(true);
	expect(c.handover).toBeUndefined();
	const cold = coldFaculty(runtime);
	received(runtime);
	received(cold);
	expect(cold.export()).toEqual(runtime.export());
	expect(c.handover?.kind).toBe("cart-returned");
	expect(cartSupplyBonus(runtime.s, "jo", "supply")).toBe(1);
});

it("retains fast/slow physical durations, inclusive deadline and paid-work conflict without shortening the agreed window", async () => {
	const { handcartOffers, blocksMainBench } = await import(
		"../src/core/handcart.ts"
	);
	const { addGoal, addCommitment } = await import("../src/core/hf4-effects.ts");
	const runtime = fixture(),
		s = runtime.s,
		c = required(s.handcart, "Missing cart"),
		repairer = runtime.actor("ravi"),
		lender = runtime.actor("ada");
	repairer.place = "workshop";
	lender.place = "workshop";
	c.raviGoalId = addGoal(s, repairer.id, {
		label: "Isolated cart faculty purpose",
		serves: ["competence"],
		importance: 0.5,
		advancedBy: [{ action: "cart-fast", amount: 1 }],
	}).id;
	const from = s.now,
		until = s.now + 60;
	const commitmentId = addCommitment(s, lender.id, {
		kind: "abstain",
		toId: repairer.id,
		actions: [],
		violatedBy: ["work"],
		from,
		until,
		importance: 0.5,
		label: "Isolated physical bench faculty window",
	}).id;
	// Explicit host window fixture, not an assertion of a received agreement. The
	// separate receipt control above tests genuine completion+received admission.
	c.bench = { requestId: 1, from, until, commitmentId };
	const offers = handcartOffers(s, repairer),
		fast = required(
			offers.find((offer) => offer.action === "cart-fast"),
			"Missing inclusive fast offer",
		),
		slow = required(
			offers.find((offer) => offer.action === "cart-slow"),
			"Missing slow offer",
		);
	expect(fast.duration).toBe(60);
	expect(slow.duration).toBe(120);
	expect(s.now + fast.duration).toBe(until);
	expect(
		blocksMainBench(s, lender.id, {
			id: "work",
			action: "work",
			label: "Paid work",
			placeId: "workshop",
			duration: 60,
			effort: 0.1,
			advertises: {},
		}),
	).toBe(true);
	const event = runtime.event(
		"started",
		"Actual physical paid-shift conflict fixture.",
		lender.id,
		"workshop",
	);
	lender.job = {
		personId: lender.id,
		activityId: "physical-conflicting-shift",
		startedAt: s.owner.at,
		offer: {
			id: "work",
			action: "work",
			label: "Paid work",
			placeId: "workshop",
			duration: 60,
			effort: 0.1,
			advertises: {},
		},
		from: "workshop",
		arrive: s.now,
		end: s.now + 60,
		event,
		food: 0,
		tools: 0,
	};
	expect(
		handcartOffers(s, repairer).some((offer) => offer.action === "cart-fast"),
	).toBe(false);
	delete lender.job;
	c.progress = 3;
	const handedOver = runtime.event(
		"cart-returned",
		"Separate physical handover fixture.",
		repairer.id,
		"quay",
	);
	c.handover = structuredClone(
		required(
			s.events.find((event) => event.id === handedOver),
			"Missing handover fixture event",
		),
	);
	expect(c.bench).toEqual({ requestId: 1, from, until, commitmentId });
	expect(
		blocksMainBench(s, lender.id, {
			id: "work",
			action: "work",
			label: "Paid work",
			placeId: "workshop",
			duration: 60,
			effort: 0.1,
			advertises: {},
		}),
	).toBe(true);
	delete c.handover;
	c.progress = 0;
	const workEvent = runtime.event(
		"started",
		"Physical fast-work completion fixture.",
		repairer.id,
		"workshop",
	);
	repairer.job = {
		personId: repairer.id,
		activityId: "physical-fast-work",
		startedAt: s.owner.at,
		offer: fast,
		from: "workshop",
		arrive: s.now,
		end: until,
		event: workEvent,
		food: 0,
		tools: 0,
	};
	s.owner.advance(nativeMilliseconds(until));
	s.now = s.owner.at / MINUTE;
	expect(finishHandcart(runtime, repairer).delivered).toBe(true);
	expect(c.progress).toBe(1);
	expect(c.work).toHaveLength(1);
	expect(c.work[0]).toMatchObject({
		mode: "main",
		startedAt: from,
		endedAt: until,
	});
	expect(c.bench).toBeUndefined();
});
