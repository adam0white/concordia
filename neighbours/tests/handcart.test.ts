import assert from "node:assert/strict";
import {
	begin,
	decide,
	finish,
	restore,
	tick,
} from "@adam0white/human-framework";
import { expect, it } from "vitest";
import type { TownEvent } from "../src/contracts.ts";
import { updateEvenings } from "../src/core/evenings.ts";
import {
	blocksMainBench,
	cartSupplyBonus,
	finishHandcart,
	HANDCART_MINUTES,
	handcartOffers,
	interruptHandcart,
	updateHandcart,
	validateHandcart,
} from "../src/core/handcart.ts";
import type { HandcartSave } from "../src/core/handcart-state.ts";
import type { Resident } from "../src/core/state.ts";
import { createRuntime } from "./historical-runtime.ts";

function host() {
	const s = createRuntime(42, 8).export() as HandcartSave;
	const h = {
		s,
		event(
			kind: string,
			text: string,
			actorId?: string,
			placeId?: string,
			causes: number[] = [],
		) {
			const event: TownEvent = {
				id: s.nextEvent++,
				at: s.now,
				kind,
				text,
				importance: 0.6,
				causes,
				...(actorId ? { actorId } : {}),
				...(placeId ? { placeId } : {}),
			};
			s.events.push(event);
			return event.id;
		},
	};
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
		r.place = ["ada", "ravi"].includes(r.person.id)
			? "workshop"
			: r.person.id === "jo"
				? "quay"
				: "homes";
		r.idleSince = s.now;
	}
	updateEvenings(h);
	updateHandcart(h);
	return h;
}
type Host = ReturnType<typeof host>;
function actor(h: Host, id: string): Resident {
	const r = h.s.people.find((p) => p.person.id === id);
	assert(r);
	return r;
}
function advance(h: Host, at: number) {
	h.s.now = at;
	h.s.round = (at - 480) / 15;
	for (const r of h.s.people) tick(r.person, at);
	updateHandcart(h);
}
function start(h: Host, id: string, action: string) {
	const r = actor(h, id),
		offer = handcartOffers(h.s, r).find((a) => a.id === action);
	assert(offer, `Missing ${action}`);
	const record = {
		id: `test-${h.s.nextEvent}`,
		at: h.s.now,
		chosenAction: offer.action,
		chosenAffordanceId: offer.id,
		considered: [],
		intention: offer.label,
		narration: offer.label,
	};
	assert(begin(r.person, offer, record));
	const event = h.event("started", offer.label, id, offer.placeId);
	r.job = {
		offer,
		from: r.place,
		end: h.s.now + offer.duration,
		arrive: h.s.now + offer.duration - (HANDCART_MINUTES[action] ?? 0),
		event,
		food: 0,
		tools: 0,
	};
	return r;
}
function complete(h: Host, r: Resident) {
	const j = r.job;
	assert(j);
	advance(h, j.end);
	r.place = j.offer.placeId ?? r.place;
	const result = finishHandcart(h, r);
	finish(r.person, {
		at: h.s.now,
		affordanceId: j.offer.id,
		action: j.offer.action,
		status: result.delivered ? "completed" : "failed",
		needs: result.delivered ? j.offer.advertises : {},
		material: 0,
	});
	delete r.job;
	r.idleSince = h.s.now;
	return result;
}
function act(h: Host, id: string, action: string) {
	return complete(h, start(h, id, action));
}
function agreement() {
	const h = host();
	expect(act(h, "ravi", "cart-ask").delivered).toBe(true);
	expect(act(h, "ada", "cart-agree").delivered).toBe(true);
	return h;
}
function validate(h: Host) {
	validateHandcart(h.s, new Set(h.s.people.map((r) => r.person.id)));
}
it("a received request is needed before Ada can lend or refuse the bench", () => {
	const h = host();
	expect(
		handcartOffers(h.s, actor(h, "ada")).some((a) => a.id === "cart-agree"),
	).toBe(false);
	const request = start(h, "ravi", "cart-ask");
	actor(h, "ada").place = "homes";
	expect(complete(h, request).delivered).toBe(false);
	expect(h.s.handcart?.requests).toEqual([]);
	actor(h, "ada").place = "workshop";
	actor(h, "ada").idleSince = h.s.now;
	expect(act(h, "ravi", "cart-ask").delivered).toBe(true);
	expect(handcartOffers(h.s, actor(h, "ada")).map((a) => a.id)).toEqual([
		"cart-agree",
		"cart-refuse",
		"cart-later",
	]);
	validate(h);
});
it("refusal alone creates no negative relationship judgement", () => {
	const h = host();
	act(h, "ravi", "cart-ask");
	const before = structuredClone(actor(h, "ravi").person.social.relationships);
	act(h, "ada", "cart-refuse");
	expect(h.s.handcart?.bench).toBeUndefined();
	expect(actor(h, "ravi").person.social.relationships).toEqual(before);
	validate(h);
});
it("only a completed and received agreement reserves the future bench", () => {
	const h = host();
	act(h, "ravi", "cart-ask");
	const r = start(h, "ada", "cart-agree");
	interruptHandcart(h.s, r);
	expect(h.s.handcart?.bench).toBeUndefined();
	actor(h, "ravi").place = "homes";
	expect(complete(h, r).delivered).toBe(false);
	expect(h.s.handcart?.bench).toBeUndefined();
	validate(h);
});
it("main bench excludes paid work only during the actual agreed interval", () => {
	const h = agreement(),
		b = h.s.handcart?.bench;
	assert(b);
	const paid = {
		id: "work",
		action: "work",
		label: "Paid carpentry",
		placeId: "workshop",
		duration: 60,
		effort: 0.15,
		advertises: { competence: 0.3 },
	};
	expect(blocksMainBench(h.s, "ada", paid)).toBe(false);
	advance(h, b.from);
	expect(blocksMainBench(h.s, "ada", paid)).toBe(true);
	expect(
		handcartOffers(h.s, actor(h, "ravi")).some((a) => a.id === "cart-fast"),
	).toBe(true);
	advance(h, b.until);
	expect(blocksMainBench(h.s, "ada", paid)).toBe(false);
	validate(h);
});
it("fast work and slow work each restore one section at different physical durations", () => {
	const fast = agreement(),
		b = fast.s.handcart?.bench;
	assert(b);
	advance(fast, b.from);
	const fastJob = start(fast, "ravi", "cart-fast");
	expect(fastJob.job?.offer.duration).toBe(60);
	expect(complete(fast, fastJob).delivered).toBe(true);
	const slow = host(),
		slowJob = start(slow, "ravi", "cart-slow");
	expect(slowJob.job?.offer.duration).toBe(120);
	expect(complete(slow, slowJob).delivered).toBe(true);
	expect(fast.s.handcart?.progress).toBe(1);
	expect(slow.s.handcart?.progress).toBe(1);
	validate(fast);
	validate(slow);
});
it("a main-bench job cannot overlap somebody's already active paid shift", () => {
	const h = agreement(),
		b = h.s.handcart?.bench;
	assert(b);
	advance(h, b.from);
	actor(h, "ada").job = {
		offer: {
			id: "work",
			action: "work",
			label: "Previously started paid shift",
			placeId: "workshop",
			duration: 60,
			effort: 0.15,
			advertises: {},
		},
		event: 1,
		from: "workshop",
		arrive: h.s.now - 15,
		end: h.s.now + 45,
		food: 0,
		tools: 0,
	};
	expect(
		handcartOffers(h.s, actor(h, "ravi")).some((a) => a.id === "cart-fast"),
	).toBe(false);
});
it("a finished cart changes Jo's supply only after a separate attended handover", () => {
	const h = host();
	for (let i = 0; i < 3; i++) act(h, "ravi", "cart-slow");
	expect(cartSupplyBonus(h.s, "jo", "supply")).toBe(0);
	expect(act(h, "ravi", "cart-handover").delivered).toBe(true);
	expect(cartSupplyBonus(h.s, "jo", "supply")).toBe(1);
	expect(cartSupplyBonus(h.s, "musa", "supply")).toBe(0);
	expect(cartSupplyBonus(h.s, "jo", "grow")).toBe(0);
	validate(h);
});
it("an interrupted fast job retains the agreed window without inventing progress", () => {
	const h = agreement(),
		b = h.s.handcart?.bench;
	assert(b);
	advance(h, b.from);
	const r = start(h, "ravi", "cart-fast");
	interruptHandcart(h.s, r);
	expect(h.s.handcart?.bench).toBeDefined();
	expect(h.s.handcart?.progress).toBe(0);
});
it("actual bench use produces HF social terms that change a later request", () => {
	const h = agreement(),
		b = h.s.handcart?.bench;
	assert(b);
	advance(h, b.from);
	act(h, "ravi", "cart-fast");
	expect(h.s.handcart?.requests[0]?.benefitReceived).toBe(true);
	const relation = actor(h, "ravi").person.social.relationships.find(
		(r) => r.otherId === "ada",
	);
	expect(relation?.trust).toBeGreaterThan(0.5);
	advance(h, b.until + 1440);
	actor(h, "ada").place = "workshop";
	actor(h, "ada").idleSince = h.s.now;
	const offer = handcartOffers(h.s, actor(h, "ravi")).find(
		(a) => a.id === "cart-ask",
	);
	assert(offer);
	const p = actor(h, "ravi").person,
		retained = decide(structuredClone(p), [offer]);
	const ablated = structuredClone(p);
	ablated.social.relationships = [];
	const control = decide(ablated, [offer]);
	expect(
		retained.considered[0]?.terms.filter((t) => t.source === "social:ada"),
	).not.toEqual(
		control.considered[0]?.terms.filter((t) => t.source === "social:ada"),
	);
});

it("the last fast period completes at the reservation deadline", () => {
	const h = agreement(),
		b = h.s.handcart?.bench;
	assert(b);
	advance(h, b.until - 60);
	expect(act(h, "ravi", "cart-fast").delivered).toBe(true);
	expect(h.s.handcart?.progress).toBe(1);
	expect(h.s.handcart?.bench).toBeUndefined();
	validate(h);
});
it("saved HF persons and bench state continue exactly", () => {
	const h = agreement(),
		copy = host();
	Object.assign(copy.s, JSON.parse(JSON.stringify(h.s)));
	for (const p of copy.s.people) p.person = restore(p.person);
	validate(copy);
	const from = h.s.handcart?.bench?.from;
	assert(from);
	advance(h, from);
	advance(copy, from);
	act(h, "ravi", "cart-fast");
	act(copy, "ravi", "cart-fast");
	expect(copy.s).toEqual(h.s);
});
it("imported progress cannot be invented without distinct completed work receipts", () => {
	const h = host();
	assert(h.s.handcart);
	h.s.handcart.progress = 3;
	expect(() => validate(h)).toThrow("Invalid cart work history");
});

it("a forged benefit flag without completed main work is rejected", () => {
	const h = agreement();
	assert(h.s.handcart?.requests[0]);
	h.s.handcart.requests[0].benefitReceived = true;
	expect(() => validate(h)).toThrow();
});
it("a completed main period retains agreement ancestry and an observed benefit receipt", () => {
	const h = agreement(),
		b = h.s.handcart?.bench;
	assert(b);
	advance(h, b.from);
	actor(h, "ada").place = "homes";
	act(h, "ravi", "cart-fast");
	const request = h.s.handcart?.requests[0];
	assert(request?.replyEvent);
	expect(h.s.handcart?.work[0]?.event.causes).toContain(request.replyEvent.id);
	expect(request.benefitEvent?.causes).toContain(
		h.s.handcart?.work[0]?.event.id,
	);
	expect(request.benefitEvent?.causes).toContain(request.replyEvent.id);
	validate(h);
});
it("a saved agreement cannot claim a reply after its offered window begins", () => {
	const h = agreement(),
		request = h.s.handcart?.requests[0];
	assert(request?.replyEvent);
	advance(h, request.proposedFrom);
	request.replyEvent.at = request.proposedFrom;
	expect(() => validate(h)).toThrow();
});
it("Ada's actual paid-shift observation is retained across attention retries", () => {
	const h = host();
	assert(h.s.handcart);
	const id = h.s.handcart.adaObservation?.id;
	expect(id).toBeDefined();
	delete h.s.handcart.adaGoalId;
	updateHandcart(h);
	expect(h.s.handcart.adaObservation?.id).toBe(id);
	expect(h.s.events.filter((e) => e.kind === "bench-work")).toHaveLength(1);
});

it("finishing and returning the cart does not end Ada's agreed window early", () => {
	const h = host();
	act(h, "ravi", "cart-slow");
	act(h, "ravi", "cart-slow");
	act(h, "ravi", "cart-ask");
	act(h, "ada", "cart-agree");
	const b = h.s.handcart?.bench;
	assert(b);
	advance(h, b.from);
	act(h, "ravi", "cart-fast");
	expect(h.s.handcart?.progress).toBe(3);
	expect(h.s.handcart?.bench).toEqual(b);
	act(h, "ravi", "cart-handover");
	expect(h.s.now).toBeLessThan(b.until);
	expect(h.s.handcart?.bench).toEqual(b);
	const commitment = actor(h, "ada").person.agenda.commitments.find(
		(c) => c.id === b.commitmentId,
	);
	expect(commitment?.status).toBe("pending");
	validate(h);
});
it("HF itself records working during the promised bench window as a broken abstention", () => {
	const h = agreement(),
		b = h.s.handcart?.bench;
	assert(b);
	advance(h, b.from);
	const ada = actor(h, "ada");
	const work = {
		id: "control-paid-work",
		action: "work",
		label: "Independent HF work control",
		duration: 60,
		effort: 0.15,
		advertises: { competence: 0.3 },
	};
	const record = {
		id: "control-paid-work-decision",
		at: h.s.now,
		chosenAction: "work",
		chosenAffordanceId: work.id,
		considered: [],
		intention: work.label,
		narration: work.label,
	};
	assert(begin(ada.person, work, record));
	advance(h, h.s.now + 60);
	finish(ada.person, {
		at: h.s.now,
		affordanceId: work.id,
		action: "work",
		status: "completed",
		needs: { competence: 0.3 },
		material: 0,
	});
	expect(
		ada.person.agenda.commitments.find((c) => c.id === b.commitmentId)?.status,
	).toBe("broken");
});
it("HF keeps the bench abstention when the window passes without paid work", () => {
	const h = agreement(),
		b = h.s.handcart?.bench;
	assert(b);
	// HF closes expired abstentions at its next hourly bookkeeping boundary.
	advance(h, b.until + 60);
	const promise = actor(h, "ada").person.agenda.commitments.find(
		(c) => c.id === b.commitmentId,
	);
	expect(promise?.status).toBe("kept");
	expect(promise?.label).toBe(
		"Leave the main bench for Ravi’s cart work from 08:00 to 12:00",
	);
});
