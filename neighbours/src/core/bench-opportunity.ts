import {
	perceive,
	type ReceivedConsequence,
} from "@adam0white/human-framework";
import { parseProposalOrigin } from "./assistance.ts";
import { benchWindow, validateBenchProposal } from "./bench-window.ts";
import { holder, requireHolder } from "./cast.ts";
import { presentAt } from "./encounters.ts";
import type { HandcartHost } from "./handcart.ts";
import type { HandcartSave } from "./handcart-state.ts";

export const BENCH_HALF_LIFE = 120;
const CONSEQUENCE_ID = "cart-bench-window";
export function canProposeBench(s: HandcartSave): boolean {
	const c = s.handcart;
	const ravi = holder(s, "cartRepairer");
	return !!(
		s.controls &&
		c?.observation &&
		c.raviGoalId &&
		c.progress < 3 &&
		!c.handover &&
		!c.premise &&
		!c.bench &&
		!c.requests.some((q) => !q.reply && s.now < q.proposedUntil) &&
		ravi &&
		presentAt(ravi, "workshop", s.now) &&
		ravi.person.agenda.goals.some(
			(g) => g.id === c.raviGoalId && g.status === "active",
		)
	);
}
/** Frozen engineering probabilities, not a fitted prediction of the lender's agreement. HF applies live source trust. */
export function benchConsequence(
	p: NonNullable<HandcartSave["handcart"]>["premise"],
	lenderId: string,
): ReceivedConsequence {
	if (!p) throw Error("Missing bench premise");
	return {
		id: CONSEQUENCE_ID,
		revision: 0,
		trigger: { action: "cart-ask", targetId: lenderId, placeId: "workshop" },
		successor: {
			action: "cart-fast",
			placeId: "workshop",
			duration: 60,
			effort: 0.15,
		},
		availableFrom: p.from,
		availableUntil: p.until,
		expiresAt: p.until,
		chance: 0.5,
		confidence: 0.8,
	};
}
/** Scenario opt-in is separate from attention: missed knowledge arms keep identical temporal goals. */
export function proposeBenchWindow(
	host: HandcartHost,
	input: unknown,
	provenance: unknown = { kind: "authored" },
): void {
	const slot = validateBenchProposal(input),
		origin = parseProposalOrigin(provenance);
	if (!canProposeBench(host.s))
		throw Error("A bench discussion premise is not available");
	const s = host.s,
		c = s.handcart;
	if (!c) throw Error("Missing handcart");
	const ravi = holder(s, "cartRepairer"),
		ada = requireHolder(s, "benchHolder");
	const goal = ravi?.person.agenda.goals.find((g) => g.id === c.raviGoalId);
	if (!ravi || !goal || !c.observation)
		throw Error("Missing observed cart purpose");
	const window = benchWindow(s.now, slot);
	const id = host.event(
		"intervention",
		`Town bulletin: ${ravi.person.name} could ask ${ada.person.name} to use the main bench during ${benchWindowLabel(window)}. One cart section takes an hour there. ${ada.person.name} still decides whether to lend it. She also uses the bench for her paid work.`,
		undefined,
		"workshop",
		[c.observation.id],
	);
	const event = s.events.find((e) => e.id === id);
	if (!event) throw Error("Missing bench premise event");
	event.source = "town-bulletin";
	event.targetId = ravi.person.id;
	const premise = {
		slot,
		at: s.now,
		...window,
		event: structuredClone(event),
		received: false,
		origin,
	};
	// Explicit host scenario configuration, not claimed learning or goal progress.
	goal.temporal = { halfLifeMinutes: BENCH_HALF_LIFE };
	s.controls--;
	const attended = perceive(ravi.person, [
		{
			at: s.now,
			channel: "told",
			actorId: "town-bulletin",
			targetId: ravi.person.id,
			placeId: "workshop",
			kind: "bench-window",
			salience: 0.9,
			summary: event.text,
			consequences: [benchConsequence(premise, ada.person.id)],
		},
	]);
	premise.received = attended.length > 0;
	if (premise.received)
		ravi.received = [...(ravi.received ?? []), structuredClone(event)].slice(
			-12,
		);
	c.premise = premise;
}
export function receivedBenchWindow(
	s: HandcartSave,
	afterAsk = false,
): { from: number; until: number } | undefined {
	const p = s.handcart?.premise;
	return p?.received &&
		s.now + (afterAsk ? 15 : 30) <= p.from &&
		s.now < p.until
		? { from: p.from, until: p.until }
		: undefined;
}
export function benchWindowLabel(window: {
	from: number;
	until: number;
}): string {
	const time = (at: number) =>
		`${String(Math.floor((at % 1440) / 60)).padStart(2, "0")}:${String(at % 60).padStart(2, "0")}`;
	return `Day ${Math.floor(window.from / 1440) + 1}, ${time(window.from)}–${time(window.until)}`;
}
