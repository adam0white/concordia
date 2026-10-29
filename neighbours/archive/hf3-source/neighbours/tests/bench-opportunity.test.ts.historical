import assert from "node:assert/strict";
import * as hf from "@adam0white/human-framework";

vi.mock("@adam0white/human-framework", { spy: true });

import { begin, decide, finish, tick } from "@adam0white/human-framework";
import { describe, expect, it, vi } from "vitest";
import {
	canProposeBench,
	proposeBenchWindow,
} from "../src/core/bench-opportunity.ts";
import { updateEvenings } from "../src/core/evenings.ts";
import {
	finishHandcart,
	handcartOffers,
	updateHandcart,
	validateHandcart,
} from "../src/core/handcart.ts";
import { Runtime } from "../src/core/runtime.ts";
import { createRuntime, restoreRuntime } from "./historical-runtime.ts";

const proposal = (slot = "soon") => ({
	schema: "neighbours-bench-proposal@1",
	kind: "bench-window",
	slot,
});
/** Controlled physical fixture, not a claim about a natural run's arrival or choices. */
function fixture() {
	const s = structuredClone(createRuntime(42, 8).export()) as Runtime["s"];
	const h = new Runtime(s);
	s.hall = 12;
	s.hallSafe = true;
	updateEvenings(h);
	const evening = s.socialEvenings?.events[0];
	assert(evening);
	s.now = Math.ceil((evening.endsAt + 15) / 1440) * 1440 + 480;
	s.round = (s.now - 480) / 15;
	for (const r of s.people) {
		const body = structuredClone(r.person.body);
		tick(r.person, s.now);
		r.person.body = { ...body, since: s.now };
		r.place = ["ada", "ravi"].includes(r.person.id) ? "workshop" : "homes";
		r.idleSince = s.now;
	}
	updateEvenings(h);
	updateHandcart(h);
	return h;
}
function act(h: Runtime, id: string, action: string) {
	const r = h.actor(id);
	const offer = handcartOffers(h.s, r).find((a) => a.action === action);
	assert(offer, action);
	const record = decide(r.person, [offer]);
	begin(r.person, offer, record);
	const event = h.event("started", offer.label, id, offer.placeId);
	r.job = {
		offer,
		end: h.s.now + offer.duration,
		arrive: h.s.now,
		from: r.place,
		event,
		food: 0,
		tools: 0,
	};
	h.s.now = r.job.end;
	h.s.round = (h.s.now - 480) / 15;
	for (const p of h.s.people) tick(p.person, h.s.now);
	const result = finishHandcart(h, r);
	finish(r.person, {
		at: h.s.now,
		action,
		affordanceId: offer.id,
		status: result.delivered ? "completed" : "failed",
	});
	delete r.job;
	r.idleSince = h.s.now;
	return result;
}
function validate(h: Runtime) {
	validateHandcart(h.s, new Set(h.s.people.map((p) => p.person.id)));
}

describe("received bench discussion premise", () => {
	it("keeps the received soon window askable at the first genuine decision boundary", () => {
		const h = fixture();
		proposeBenchWindow(h, proposal());
		const proposedAt = h.s.now;
		h.prepareRound();
		expect(h.s.now).toBe(proposedAt + 15);
		expect(h.s.pending).toContain("ravi");
		expect(
			handcartOffers(h.s, h.actor("ravi")).some(
				(offer) => offer.action === "cart-ask",
			),
		).toBe(true);
		expect(h.s.handcart?.bench).toBeUndefined();
	});
	it("admits one strict proposal, spends allowance, and creates knowledge without bench authority", () => {
		const h = fixture();
		const ravi = h.actor("ravi");
		const before = h.s.controls;
		expect(canProposeBench(h.s)).toBe(true);
		proposeBenchWindow(h, proposal());
		expect(h.s.controls).toBe(before - 1);
		expect(h.s.handcart?.premise?.received).toBe(true);
		expect(h.s.handcart?.bench).toBeUndefined();
		expect(h.s.handcart?.requests).toEqual([]);
		expect(
			ravi.person.agenda.goals.find((g) => g.id === h.s.handcart?.raviGoalId)
				?.temporal,
		).toEqual({ halfLifeMinutes: 120 });
		expect(ravi.person.prospection?.entries[0]?.sourceId).toBe("town-bulletin");
		expect(canProposeBench(h.s)).toBe(false);
		validate(h);
	});
	it.each([
		undefined,
		{},
		{ ...proposal(), permission: true },
		proposal("unbounded"),
	])("rejects malformed premise atomically", (input) => {
		const h = fixture();
		const before = structuredClone(h.s);
		expect(() => proposeBenchWindow(h, input)).toThrow();
		expect(h.s).toEqual(before);
	});
	it("does not change legacy goal valuation until the scenario opts in", () => {
		const h = fixture();
		const goal = h
			.actor("ravi")
			.person.agenda.goals.find((g) => g.id === h.s.handcart?.raviGoalId);
		expect(goal?.temporal).toBeUndefined();
	});
	it("keeps temporal mode in a controlled missed-delivery arm without reconstructing knowledge", () => {
		const h = fixture();
		const spy = vi.mocked(hf.perceive).mockReturnValueOnce([]);
		try {
			proposeBenchWindow(h, proposal());
		} finally {
			spy.mockClear();
		}
		expect(h.s.handcart?.premise?.received).toBe(false);
		expect(h.actor("ravi").person.prospection).toBeUndefined();
		expect(
			h
				.actor("ravi")
				.person.agenda.goals.find((g) => g.id === h.s.handcart?.raviGoalId)
				?.temporal,
		).toEqual({ halfLifeMinutes: 120 });
		validate(h);
	});
	it("rejects unavailable listeners and a second proposal without spending more allowance", () => {
		const h = fixture();
		h.actor("ravi").place = "homes";
		const before = structuredClone(h.s);
		expect(() => proposeBenchWindow(h, proposal())).toThrow("not available");
		expect(h.s).toEqual(before);
		h.actor("ravi").place = "workshop";
		proposeBenchWindow(h, proposal());
		const admitted = structuredClone(h.s);
		expect(() => proposeBenchWindow(h, proposal())).toThrow("not available");
		expect(h.s).toEqual(admitted);
	});
	it("restores the complete proposal save exactly without delivering the premise again", () => {
		const h = fixture();
		proposeBenchWindow(h, proposal("tomorrow"));
		const packet = h.export();
		expect(restoreRuntime(packet).export()).toEqual(packet);
	});
	it("brief access cannot fit the one-hour successor and grants no fast work", () => {
		const h = fixture();
		proposeBenchWindow(h, proposal("brief"));
		const ask = handcartOffers(h.s, h.actor("ravi")).find(
			(a) => a.action === "cart-ask",
		);
		assert(ask);
		expect(
			hf.consequenceEvidence(h.actor("ravi").person, ask).entries[0]?.feasible,
		).toBe(false);
		expect(
			handcartOffers(h.s, h.actor("ravi")).some(
				(a) => a.action === "cart-fast",
			),
		).toBe(false);
		validate(h);
	});
	it("does not replace a missed received window with tomorrow under the same valued request", () => {
		const h = fixture();
		proposeBenchWindow(h, proposal());
		h.s.now += 30;
		h.s.round += 2;
		for (const r of h.s.people) tick(r.person, h.s.now);
		const offers = handcartOffers(h.s, h.actor("ravi"));
		expect(offers.some((a) => a.action === "cart-ask")).toBe(false);
		expect(offers.some((a) => a.action === "cart-slow")).toBe(true);
	});
	it("separates received route terms from matched removed knowledge on actual cart offers", () => {
		const h = fixture();
		proposeBenchWindow(h, proposal());
		const ravi = h.actor("ravi");
		const offers = handcartOffers(h.s, ravi);
		const intact = hf.restore(hf.snapshot(ravi.person));
		const removed = hf.restore(hf.snapshot(ravi.person));
		delete removed.prospection;
		expect(removed.agenda.goals).toEqual(intact.agenda.goals);
		const intactRecord = decide(intact, offers),
			removedRecord = decide(removed, offers);
		const askWith = intactRecord.considered.find(
			(c) => c.action === "cart-ask",
		);
		const askWithout = removedRecord.considered.find(
			(c) => c.action === "cart-ask",
		);
		assert(askWith && askWithout);
		expect(
			askWith.terms.some((t) => t.source.startsWith("prospection:cost:")),
		).toBe(true);
		expect(askWith.utility).toBeGreaterThan(askWithout.utility);
		expect(
			askWithout.terms.some((t) => t.source.startsWith("prospection:")),
		).toBe(false);
	});
	it("uses the exact received window in the actual request and reserves only after Ada's received reply", () => {
		const h = fixture();
		proposeBenchWindow(h, proposal());
		const p = h.s.handcart?.premise;
		assert(p);
		expect(act(h, "ravi", "cart-ask").delivered).toBe(true);
		const request = h.s.handcart?.requests[0];
		assert(request);
		expect([request.proposedFrom, request.proposedUntil]).toEqual([
			p.from,
			p.until,
		]);
		expect(request.event.causes).toContain(p.event.id);
		expect(h.s.handcart?.bench).toBeUndefined();
		expect(act(h, "ada", "cart-agree").delivered).toBe(true);
		expect(h.s.handcart?.bench?.from).toBe(p.from);
		validate(h);
	});
	it("retains Ada’s actual refusal without inventing a bulletin withdrawal", () => {
		const h = fixture();
		proposeBenchWindow(h, proposal());
		act(h, "ravi", "cart-ask");
		act(h, "ada", "cart-refuse");
		expect(h.s.handcart?.bench).toBeUndefined();
		const ravi = h.actor("ravi");
		expect(
			ravi.received?.some(
				(event) => event.kind === "bench-reply" && event.actorId === "ada",
			),
		).toBe(true);
		expect(
			h.s.events.some(
				(event) =>
					event.kind === "bench-window-withdrawn" ||
					event.text.startsWith("Town bulletin update:"),
			),
		).toBe(false);
		expect(ravi.person.prospection?.entries[0]?.triggeredAt).toBeDefined();
		expect(ravi.person.prospection?.entries[0]?.sourceId).toBe("town-bulletin");
		validate(h);
	});
	it("validates restored window and event ancestry without reconstructing missed knowledge", () => {
		const h = fixture();
		proposeBenchWindow(h, proposal());
		validate(h);
		const before = structuredClone(h.s.handcart);
		validate(h);
		expect(h.s.handcart).toEqual(before);
		const p = h.s.handcart?.premise;
		assert(p);
		p.until++;
		expect(() => validate(h)).toThrow();
	});
});
