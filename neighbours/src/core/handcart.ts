import type { TownEvent } from "../contracts.ts";
import { parseProposalOrigin } from "./assistance.ts";
import {
	BENCH_HALF_LIFE,
	benchWindowLabel,
	receivedBenchWindow,
} from "./bench-opportunity.ts";
import { benchWindow, validateBenchProposal } from "./bench-window.ts";
import { requireHolder } from "./cast.ts";
import {
	overlapMinutes,
	type PhysicalWitness,
	presentAt,
	receiveEvent,
} from "./encounters.ts";
import { allEvenings } from "./evenings.ts";
import type { BenchRequest, HandcartSave } from "./handcart-state.ts";
import { addCommitment, addGoal } from "./hf4-effects.ts";
import type { Affordance } from "./host-types.ts";
import { placeOf } from "./invariants.ts";
import type { Resident, Save } from "./state.ts";
import { validateEvent } from "./validation.ts";
export interface HandcartHost {
	s: HandcartSave;
	event(
		kind: string,
		text: string,
		actorId?: string,
		placeId?: string,
		causes?: number[],
	): number;
}
export const HANDCART_MINUTES: Record<string, number> = {
	"cart-ask": 15,
	"cart-agree": 15,
	"cart-refuse": 15,
	"cart-later": 15,
	"cart-fast": 60,
	"cart-slow": 120,
	"cart-handover": 15,
};
function resident(s: Save, id: string) {
	const r = s.people.find((p) => p.id === id);
	if (!r) throw Error(`Missing ${id}`);
	return r;
}
/**
 * The episode's people come from occupations (see cast.ts), never from ids: the workshop mechanic restores the
 * cart, the carpenter whose paid work uses the main bench can lend it, and the ferry keeper owns the cart.
 * Save fields keep their first names (`raviGoalId`, `adaGoalId`) so older saves load unchanged.
 */
export function cartCast(s: Save) {
	return {
		repairer: requireHolder(s, "cartRepairer"),
		lender: requireHolder(s, "benchHolder"),
		owner: requireHolder(s, "cartOwner"),
	};
}
function retained(
	host: HandcartHost,
	kind: string,
	text: string,
	id: string,
	place: string,
	causes: number[] = [],
): TownEvent {
	const eventId = host.event(kind, text, id, place, causes);
	const e = host.s.events.find((e) => e.id === eventId);
	if (!e) throw Error("Missing handcart event");
	return structuredClone(e);
}
function socialReceipt(
	s: Save,
	from: string,
	to: string,
	event: TownEvent,
	kind = "chat",
	channel: "social" | "saw" = "social",
) {
	const receiver = resident(s, to);
	return receiveEvent(
		receiver,
		{ ...event, actorId: from, targetId: to, kind },
		channel,
	);
}

/** Only this domain's received meeting effects wait for actual attention. Ordinary
 * actions and time continue. No ingress is re-delivered during settlement. */
export function settleCartReceipts(s: HandcartSave): void {
	const c = s.handcart;
	if (!c?.pending) return;
	c.pending = c.pending.filter((pending) => {
		const attention = s.owner.attention(
			pending.person,
			`town:${pending.event.id}:${pending.person}`,
		);
		if (attention === null) return true;
		if (attention <= 0) return false;
		const { event, effect } = pending;
		const deliveredAt = s.owner.attentionTime(
			pending.person,
			`town:${event.id}:${pending.person}`,
		);
		if (deliveredAt === null)
			throw Error("Attended cart event lacks delivery time");
		const cast = cartCast(s);
		if (effect.type === "request") {
			if (!c.requests.some((request) => request.event.id === event.id))
				c.requests.push({
					id: c.requests.length + 1,
					event,
					heardAt: deliveredAt / 60000,
					proposedFrom: effect.from,
					proposedUntil: effect.until,
					...(effect.opportunityEventId === undefined
						? {}
						: { opportunityEventId: effect.opportunityEventId }),
				});
		} else if (effect.type === "reply") {
			const request = c.requests.find(
				(request) => request.id === effect.requestId,
			);
			if (request && !request.reply) {
				request.reply = effect.reply;
				request.replyEvent = event;
				if (effect.reply === "agree") {
					const window = {
						from: request.proposedFrom,
						until: request.proposedUntil,
					};
					const commitment = addCommitment(s, cast.lender.id, {
						kind: "abstain",
						toId: cast.repairer.id,
						actions: [],
						violatedBy: ["work"],
						...window,
						importance: 0.6,
						label: request.opportunityEventId
							? `Leave the main bench for ${cast.repairer.name}’s cart work ${benchWindowLabel(window)}`
							: `Leave the main bench for ${cast.repairer.name}’s cart work from 08:00 to 12:00`,
					});
					Object.assign(request, window, { commitmentId: commitment.id });
					c.bench = {
						requestId: request.id,
						...window,
						commitmentId: commitment.id,
					};
				}
			}
		} else if (effect.type === "benefit") {
			const request = c.requests.find(
				(request) => request.id === effect.requestId,
			);
			if (request && !request.benefitReceived) {
				request.benefitReceived = true;
				request.benefitEvent = event;
			}
		} else if (!c.handover) c.handover = event;
		return false;
	});
	if (!c.pending.length) delete c.pending;
}
function pendingCart(
	s: HandcartSave,
	person: string,
	event: TownEvent,
	effect: import("./handcart-state.ts").PendingCartReceipt["effect"],
): void {
	const c = s.handcart;
	if (!c) throw Error("No cart for receipt");
	c.pending ??= [];
	if (
		!c.pending.some(
			(pending) => pending.person === person && pending.event.id === event.id,
		)
	)
		c.pending.push({
			person,
			event: structuredClone(event),
			effect: structuredClone(effect),
		});
	settleCartReceipts(s);
}
function nextWindow(now: number) {
	const day = Math.floor(now / 1440);
	const from = (day + 1) * 1440 + 480;
	return { from, until: from + 240 };
}
function latest(s: HandcartSave): BenchRequest | undefined {
	return s.handcart?.requests.at(-1);
}
function meeting(
	s: Save,
	r: Resident,
	otherId: string,
	place: string,
	people: readonly PhysicalWitness[],
): boolean {
	const other = people.find((person) => person.id === otherId);
	if (!other) return false;
	return (
		!!r.job &&
		presentAt(r, place, s.now) &&
		presentAt(other, place, s.now) &&
		overlapMinutes(r.job, other, s.now) >= 15
	);
}
/** Activation follows the first scheduled evening; only seeing the cart creates its purpose. */
export function updateHandcart(host: HandcartHost): void {
	const s = host.s;
	settleCartReceipts(s);
	if (
		!s.handcart &&
		allEvenings(s).some((e) => e.stage === "closed" && e.endsAt < s.now)
	)
		s.handcart = {
			version: 1,
			activatedAt: s.now,
			progress: 0,
			work: [],
			requests: [],
		};
	const c = s.handcart;
	if (!c) return;
	if (
		c.bench &&
		((s.now >= c.bench.until &&
			!s.people.some(
				(p) =>
					p.job?.offer.action === "cart-fast" &&
					p.job.end === s.now &&
					p.job.end <= (c.bench?.until ?? -1),
			)) ||
			!cartCast(s).repairer.owner.actor(cartCast(s).repairer.id).body.alive ||
			!cartCast(s).lender.owner.actor(cartCast(s).lender.id).body.alive)
	)
		delete c.bench;
	if (c.handover) return;
	const { repairer: ravi, lender: ada, owner } = cartCast(s);
	if (presentAt(ravi, "workshop", s.now) && !c.raviGoalId) {
		c.observation ??= retained(
			host,
			"cart-observed",
			`${owner.name}’s flood-damaged handcart stands in the workshop. Repairing its axle, load platform and handles takes three work periods.`,
			ravi.id,
			"workshop",
		);
		if (receiveEvent(ravi, c.observation, "saw"))
			c.raviGoalId = addGoal(s, ravi.id, {
				label: `Restore ${owner.name}’s handcart and return it`,
				serves: ["competence", "meaning"],
				importance: 0.6,
				advancedBy: [
					{ action: "cart-fast", amount: 0.25 },
					{ action: "cart-slow", amount: 0.25 },
					{ action: "cart-handover", amount: 0.25 },
				],
			}).id;
	}
	if (presentAt(ada, "workshop", s.now) && !c.adaGoalId) {
		c.adaObservation ??= retained(
			host,
			"bench-work",
			`${ada.name} can earn two paid carpentry shifts each day at the main bench. Lending it means she must wait to work those shifts. It does not necessarily mean she will lose income.`,
			ada.id,
			"workshop",
		);
		if (receiveEvent(ada, c.adaObservation, "saw"))
			c.adaGoalId = addGoal(s, ada.id, {
				label: "Finish my own two paid carpentry shifts",
				serves: ["competence", "security"],
				importance: 0.6,
				advancedBy: [{ action: "work", amount: 0.5 }],
			}).id;
	}
}
/** The host filters new paid workshop actions; existing jobs always finish normally. */
export function blocksMainBench(
	s: HandcartSave,
	actorId: string,
	offer: Affordance,
): boolean {
	const b = s.handcart?.bench;
	if (
		!b ||
		actorId === cartCast(s).repairer.id ||
		offer.action !== "work" ||
		offer.placeId !== "workshop"
	)
		return false;
	const work = 60,
		arrival = s.now + offer.duration - work;
	return arrival < b.until && s.now + offer.duration > b.from;
}
export function handcartOffers(
	s: HandcartSave,
	r: Resident,
	historical?: Affordance,
): Affordance[] {
	const c = s.handcart;
	if (
		!c ||
		(!historical && (r.job || !r.owner.actor(r.id).body.alive || c.handover))
	)
		return [];
	const result: Affordance[] = [];
	const add = (
		action: string,
		label: string,
		dest: string,
		advertises: Affordance["advertises"],
		extra: Partial<Affordance> = {},
	) => {
		if (historical && historical.id !== action) return;
		const p = placeOf(s, dest),
			from = placeOf(s, r.place);
		if (!historical && p.reserved >= p.capacity) return;
		const travel =
			r.place === dest
				? 0
				: Math.ceil(
						Math.hypot(p.x - from.x, p.y - from.y) / (s.bus ? 35 : 20),
					) * 15;
		const duration = (HANDCART_MINUTES[action] ?? 0) + travel;
		// The received route needs a real ask and reply before the proposed window.
		// Do not offer a different future request under the still-live trigger identity.
		if (
			!historical &&
			action === "cart-ask" &&
			c.premise?.received &&
			s.now <= c.premise.until &&
			s.now + duration + 15 > c.premise.from
		)
			return;
		if (
			!historical &&
			(s.now % 1440 < 480 ||
				(s.now + duration) % 1440 > 1080 ||
				Math.floor(s.now / 1440) !== Math.floor((s.now + duration) / 1440))
		)
			return;
		result.push({
			id: action,
			action,
			label,
			placeId: dest,
			duration,
			effort: 0.15,
			advertises,
			...extra,
		});
	};
	const request = latest(s),
		{ repairer: ravi, lender: ada, owner: jo } = cartCast(s);
	if (r.id === ravi.id) {
		if (
			historical ||
			(c.progress < 3 &&
				c.raviGoalId &&
				!c.bench &&
				(!request ||
					(request.reply &&
						s.now - (request.replyEvent?.at ?? s.now) >= 1440) ||
					(!request.reply && s.now >= request.proposedUntil)) &&
				c.requests.length < 8 &&
				presentAt(ada, "workshop", s.now))
		)
			add(
				"cart-ask",
				receivedBenchWindow(s)
					? `Ask ${ada.name} for the main bench ${benchWindowLabel(receivedBenchWindow(s) ?? nextWindow(s.now + 15))}; her paid work needs it too`
					: `Ask ${ada.name} for tomorrow’s 08:00–12:00 main bench; her paid work needs it too`,
				"workshop",
				{ meaning: 0.2 },
				{ targetId: ada.id, tags: ["social"] },
			);
		if (historical || (c.progress < 3 && c.raviGoalId)) {
			add(
				"cart-slow",
				"Restore one cart section on the side bench · two hours",
				"workshop",
				{ competence: 0.35, meaning: 0.2 },
				{ skill: { id: "repair", difficulty: 0.4 }, tags: ["work"] },
			);
			const fastOffer: Affordance = {
				id: "cart-fast",
				action: "cart-fast",
				label: `Restore one cart section on ${ada.name}’s main bench · one hour`,
				placeId: "workshop",
				duration: 60,
				effort: 0.15,
				advertises: { competence: 0.35, meaning: 0.2 },
				skill: { id: "repair", difficulty: 0.4 },
				tags: ["work"],
			};
			const b = c.bench;
			const from = placeOf(s, r.place),
				dest = placeOf(s, "workshop"),
				travel =
					r.place === "workshop"
						? 0
						: Math.ceil(
								Math.hypot(dest.x - from.x, dest.y - from.y) /
									(s.bus ? 35 : 20),
							) * 15;
			const arrival = s.now + travel,
				end = arrival + 60;
			const busy = s.people.some(
				(o) =>
					o.id !== r.id &&
					o.job?.offer.placeId === "workshop" &&
					["work", "cart-fast"].includes(o.job.offer.action) &&
					o.job.arrive < end &&
					o.job.end > arrival,
			);
			if (historical || (b && arrival >= b.from && end <= b.until && !busy))
				add("cart-fast", fastOffer.label, "workshop", fastOffer.advertises, {
					skill: fastOffer.skill,
					tags: fastOffer.tags,
				});
		}
		if (
			historical ||
			(c.progress === 3 &&
				jo.owner.actor(jo.id).body.alive &&
				presentAt(jo, "quay", s.now))
		)
			add(
				"cart-handover",
				`Return the restored handcart to ${jo.name}`,
				"quay",
				{ meaning: 0.45, belonging: 0.2 },
				{ targetId: jo.id, tags: ["help"] },
			);
	}
	if (
		r.id === ada.id &&
		(historical ||
			(request &&
				!request.reply &&
				(s.now + 15 < request.proposedFrom ||
					(request.opportunityEventId !== undefined &&
						s.now + 15 === request.proposedFrom)) &&
				presentAt(ravi, "workshop", s.now)))
	) {
		add(
			"cart-agree",
			request?.opportunityEventId
				? `Lend ${ravi.name} the main bench ${benchWindowLabel({ from: request.proposedFrom, until: request.proposedUntil })}; postpone my paid carpentry`
				: `Lend ${ravi.name} the main bench tomorrow 08:00–12:00; postpone my paid carpentry`,
			"workshop",
			{ meaning: 0.25, belonging: 0.2 },
			{ targetId: ravi.id, tags: ["social"] },
		);
		add(
			"cart-refuse",
			"Keep the main bench for my paid work",
			"workshop",
			{ autonomy: 0.25 },
			{ targetId: ravi.id, tags: ["social"] },
		);
		add(
			"cart-later",
			`Tell ${ravi.name} to ask again another day`,
			"workshop",
			{ autonomy: 0.15 },
			{ targetId: ravi.id, tags: ["social"] },
		);
	}
	return result.filter(
		(offer) =>
			!c.pending?.some(
				(receipt) =>
					(receipt.effect.type === "request" && offer.action === "cart-ask") ||
					(receipt.effect.type === "reply" &&
						["cart-agree", "cart-refuse", "cart-later"].includes(
							offer.action,
						)) ||
					(receipt.effect.type === "handover" &&
						offer.action === "cart-handover"),
			),
	);
}
export function interruptHandcart(_s: HandcartSave, _r: Resident): void {
	// Interrupting one work period does not revoke a received agreement.
}
export function finishHandcart(
	host: HandcartHost,
	r: Resident,
	people: readonly PhysicalWitness[] = host.s.people,
): {
	handled: boolean;
	delivered: boolean;
	companions: string[];
	pending?: boolean;
} {
	const s = host.s,
		c = s.handcart,
		j = r.job,
		action = j?.offer.action;
	if (!c || !j || !action?.startsWith("cart-"))
		return { handled: false, delivered: false, companions: [] };
	let delivered = false;
	let pending = false;
	const companions: string[] = [];
	const { repairer: ravi, lender: ada, owner: jo } = cartCast(s);
	if (
		action === "cart-ask" &&
		r.id === ravi.id &&
		meeting(s, r, ada.id, "workshop", people) &&
		c.requests.length < 8
	) {
		const proposedWindow = receivedBenchWindow(s, true);
		const window = proposedWindow ?? nextWindow(s.now);
		const e = retained(
			host,
			"bench-request",
			proposedWindow
				? `${ravi.name} asked ${ada.name} to borrow the main bench ${benchWindowLabel(window)} for ${jo.name}’s handcart. ${ada.name}’s paid carpentry needs that bench too.`
				: `${ravi.name} asked ${ada.name} to borrow the main bench tomorrow from 08:00 to 12:00 for ${jo.name}’s handcart. ${ada.name}’s paid carpentry needs that bench too.`,
			ravi.id,
			"workshop",
			[j.event, ...(proposedWindow && c.premise ? [c.premise.event.id] : [])],
		);
		socialReceipt(s, ravi.id, ada.id, e, "bench-request");
		pendingCart(s, ada.id, e, {
			type: "request",
			...window,
			...(proposedWindow && c.premise
				? { opportunityEventId: c.premise.event.id }
				: {}),
		});
		delivered = c.requests.some((request) => request.event.id === e.id);
		pending = !!c.pending?.some((receipt) => receipt.event.id === e.id);
		if (delivered) companions.push(ada.id);
	} else if (
		["cart-agree", "cart-refuse", "cart-later"].includes(action) &&
		r.id === ada.id
	) {
		const request = latest(s);
		if (
			request &&
			!request.reply &&
			(s.now < request.proposedFrom ||
				(request.opportunityEventId !== undefined &&
					s.now === request.proposedFrom)) &&
			meeting(s, r, ravi.id, "workshop", people)
		) {
			const reply =
				action === "cart-agree"
					? "agree"
					: action === "cart-refuse"
						? "refuse"
						: "later";
			const e = retained(
				host,
				"bench-reply",
				reply === "agree"
					? request.opportunityEventId
						? `${ada.name} agreed to lend ${ravi.name} the main bench ${benchWindowLabel({ from: request.proposedFrom, until: request.proposedUntil })}. Her paid carpentry must wait.`
						: `${ada.name} agreed to lend ${ravi.name} the main bench tomorrow from 08:00 to 12:00. Her paid carpentry must wait.`
					: reply === "refuse"
						? `${ada.name} kept the main bench for her paid carpentry. ${ravi.name} can use the slower side bench.`
						: `${ada.name} asked ${ravi.name} to discuss the bench another day.`,
				ada.id,
				"workshop",
				[request.event.id, j.event],
			);
			socialReceipt(s, ada.id, ravi.id, e, "bench-reply");
			pendingCart(s, ravi.id, e, {
				type: "reply",
				requestId: request.id,
				reply,
			});
			delivered = !!request.reply;
			pending = !!c.pending?.some((receipt) => receipt.event.id === e.id);
			if (delivered) companions.push(ravi.id);
		}
	} else if (action === "cart-slow" || action === "cart-fast") {
		const b = c.bench;
		const legal =
			action === "cart-slow" || (b && j.arrive >= b.from && j.end <= b.until);
		if (r.id === ravi.id && c.progress < 3 && legal) {
			c.progress++;
			delivered = true;
			const workEvent = retained(
				host,
				"cart-progress",
				`${ravi.name} restored ${c.progress} of three cart sections using the ${action === "cart-fast" ? "main" : "side"} bench.`,
				ravi.id,
				"workshop",
				[
					j.event,
					...(action === "cart-fast"
						? [
								c.requests.find((q) => q.id === b?.requestId)?.replyEvent?.id ??
									0,
							]
						: []),
				],
			);
			c.work.push({
				event: workEvent,
				mode: action === "cart-fast" ? "main" : "side",
				startedAt: j.arrive,
				endedAt: j.end,
			});
			if (action === "cart-fast") {
				const request = c.requests.find((x) => x.id === b?.requestId);
				if (request && !request.benefitReceived) {
					const e = retained(
						host,
						"bench-used",
						`${ravi.name} saw the main bench was free during the period ${ada.name} had agreed to lend him, and completed his cart work there.`,
						ada.id,
						"workshop",
						[request.replyEvent?.id ?? request.event.id, workEvent.id],
					);
					socialReceipt(s, ada.id, ravi.id, e, "help", "saw");
					pendingCart(s, ravi.id, e, {
						type: "benefit",
						requestId: request.id,
					});
				}
			}
			if (c.bench && s.now >= c.bench.until) delete c.bench;
		}
	} else if (
		action === "cart-handover" &&
		r.id === ravi.id &&
		c.progress === 3 &&
		!c.handover &&
		meeting(s, r, jo.id, "quay", people)
	) {
		const e = retained(
			host,
			"cart-returned",
			`${ravi.name} returned the restored handcart to ${jo.name}. It can carry one extra unit of food on each supply trip ${jo.name} completes.`,
			ravi.id,
			"quay",
			[j.event],
		);
		socialReceipt(s, ravi.id, jo.id, e, "gift");
		pendingCart(s, jo.id, e, { type: "handover" });
		delivered = !!c.handover;
		pending = !!c.pending?.some((receipt) => receipt.event.id === e.id);
		if (delivered) companions.push(jo.id);
	}
	return {
		handled: true,
		delivered,
		companions,
		...(pending ? { pending: true } : {}),
	};
}
/** Called only after a physical supply trip completes; the cart is reusable. */
export function cartSupplyBonus(
	s: HandcartSave,
	id: string,
	action: string,
): number {
	return action === "supply" &&
		s.handcart?.handover &&
		id === cartCast(s).owner.id
		? 1
		: 0;
}
/** Closed bounded receipts make imported bench ownership checkable. */
export function validateHandcart(s: HandcartSave, ids: Set<string>): void {
	const c = s.handcart;
	if (c === undefined) return;
	const fields = (x: object, allowed: string[]) => {
		if (
			!x ||
			typeof x !== "object" ||
			Array.isArray(x) ||
			Object.keys(x).some((k) => !allowed.includes(k))
		)
			throw Error("Invalid handcart fields");
	};
	fields(c, [
		"pending",
		"version",
		"activatedAt",
		"progress",
		"work",
		"observation",
		"raviGoalId",
		"adaGoalId",
		"adaObservation",
		"premise",
		"requests",
		"bench",
		"handover",
	]);
	if (
		!allEvenings(s).some(
			(e) => e.stage === "closed" && e.endsAt < c.activatedAt,
		) ||
		c.version !== 1 ||
		!Number.isSafeInteger(c.activatedAt) ||
		c.activatedAt < 480 ||
		c.activatedAt > s.now ||
		!Number.isInteger(c.progress) ||
		c.progress < 0 ||
		c.progress > 3 ||
		!Array.isArray(c.requests) ||
		c.requests.length > 8
	)
		throw Error("Invalid handcart state");
	const cast = cartCast(s);
	for (const [key, id] of [
		["raviGoalId", cast.repairer.id],
		["adaGoalId", cast.lender.id],
	] as const) {
		if (
			c[key] !== undefined &&
			!s.owner.actor(id).agenda.goals.some((g) => g.id === c[key])
		)
			throw Error("Invalid cart purpose");
	}
	const evidence = (
		e: TownEvent,
		kind: string,
		actor: string,
		place: string,
	) => {
		validateEvent(e, s, ids);
		if (
			e.kind !== kind ||
			e.actorId !== actor ||
			e.placeId !== place ||
			e.at < c.activatedAt
		)
			throw Error("Invalid cart evidence");
	};
	if (c.observation)
		evidence(c.observation, "cart-observed", cast.repairer.id, "workshop");
	if (c.adaObservation)
		evidence(c.adaObservation, "bench-work", cast.lender.id, "workshop");
	if (c.premise) {
		const p = c.premise;
		fields(p, ["slot", "at", "from", "until", "event", "received", "origin"]);
		validateBenchProposal({
			schema: "neighbours-bench-proposal@1",
			kind: "bench-window",
			slot: p.slot,
		});
		parseProposalOrigin(p.origin);
		validateEvent(p.event, s, ids);
		const window = benchWindow(p.at, p.slot);
		const goal = cast.repairer.owner
			.actor(cast.repairer.id)
			.agenda.goals.find((g) => g.id === c.raviGoalId);
		if (
			!c.observation ||
			!goal ||
			goal.completionHalfLifeMs !== BENCH_HALF_LIFE * 60000 ||
			!["cart-fast", "cart-slow", "cart-handover"].every((action) =>
				goal.advancedBy.some(
					(rule) => rule.action === action && rule.amount === 0.25,
				),
			) ||
			p.at < c.observation.at ||
			p.at !== p.event.at ||
			p.from !== window.from ||
			p.until !== window.until ||
			typeof p.received !== "boolean" ||
			p.event.kind !== "intervention" ||
			p.event.source !== "town-bulletin" ||
			p.event.targetId !== cast.repairer.id ||
			p.event.placeId !== "workshop" ||
			p.event.actorId !== undefined ||
			!p.event.causes.includes(c.observation.id)
		)
			throw Error("Invalid received bench premise");
	}
	if (c.progress > 0 && (!c.observation || !c.raviGoalId))
		throw Error("Cart work lacks an observed purpose");
	for (const [index, q] of c.requests.entries()) {
		fields(q, [
			"id",
			"event",
			"heardAt",
			"proposedFrom",
			"proposedUntil",
			"opportunityEventId",
			"reply",
			"replyEvent",
			"from",
			"until",
			"commitmentId",
			"benefitReceived",
			"benefitEvent",
		]);
		evidence(q.event, "bench-request", cast.repairer.id, "workshop");
		const proposed =
			q.opportunityEventId === undefined
				? nextWindow(q.event.at)
				: c.premise?.received &&
						c.premise.event.id === q.opportunityEventId &&
						q.event.at >= c.premise.at &&
						q.event.causes.includes(q.opportunityEventId) &&
						q.event.at + 15 <= c.premise.from
					? c.premise
					: undefined;
		if (
			q.id !== index + 1 ||
			!proposed ||
			q.proposedFrom !== proposed.from ||
			q.proposedUntil !== proposed.until ||
			q.heardAt !== q.event.at ||
			(q.reply !== undefined &&
				!["agree", "refuse", "later"].includes(q.reply)) ||
			(q.benefitReceived !== undefined &&
				typeof q.benefitReceived !== "boolean")
		)
			throw Error("Invalid bench request");
		if (q.reply) {
			if (!q.replyEvent) throw Error("Missing bench reply");
			evidence(q.replyEvent, "bench-reply", cast.lender.id, "workshop");
			if (
				q.replyEvent.at < q.heardAt ||
				q.replyEvent.at > q.proposedFrom ||
				(q.replyEvent.at === q.proposedFrom &&
					q.opportunityEventId === undefined) ||
				!q.replyEvent.causes.includes(q.event.id)
			)
				throw Error("Invalid reply timing or ancestry");
		} else if (
			q.replyEvent ||
			q.commitmentId ||
			q.from !== undefined ||
			q.until !== undefined ||
			q.benefitReceived
		)
			throw Error("Unanswered bench request");
		if (q.reply === "agree") {
			const expected = { from: q.proposedFrom, until: q.proposedUntil };
			const promise = cast.lender.owner
				.actor(cast.lender.id)
				.agenda.commitments.find((p) => p.id === q.commitmentId);
			if (
				q.from !== expected.from ||
				q.until !== expected.until ||
				!promise ||
				promise.kind !== "abstain" ||
				promise.toId !== cast.repairer.id ||
				promise.from !== q.from ||
				promise.until !== q.until ||
				promise.actions.length !== 0 ||
				promise.violatedBy?.join() !== "work"
			)
				throw Error("Bench promise differs from agreement");
		} else if (
			q.commitmentId ||
			q.from !== undefined ||
			q.until !== undefined ||
			q.benefitReceived
		)
			throw Error("Unagreed bench reservation");
	}
	if (!Array.isArray(c.work) || c.work.length !== c.progress)
		throw Error("Invalid cart work history");
	let previousEnd = c.activatedAt;
	const workIds = new Set<number>();
	for (const w of c.work) {
		fields(w, ["event", "mode", "startedAt", "endedAt"]);
		evidence(w.event, "cart-progress", cast.repairer.id, "workshop");
		if (
			!["main", "side"].includes(w.mode) ||
			!Number.isSafeInteger(w.startedAt) ||
			w.startedAt < previousEnd ||
			workIds.has(w.event.id) ||
			(w.mode === "main" &&
				!c.requests.some(
					(q) =>
						q.reply === "agree" &&
						q.from !== undefined &&
						q.until !== undefined &&
						w.startedAt >= q.from &&
						w.endedAt <= q.until &&
						!!q.replyEvent &&
						w.event.causes.includes(q.replyEvent.id),
				)) ||
			w.endedAt !== w.event.at ||
			w.endedAt - w.startedAt !== (w.mode === "main" ? 60 : 120)
		)
			throw Error("Invalid completed cart work");
		previousEnd = w.endedAt;
		workIds.add(w.event.id);
	}

	for (const q of c.requests) {
		if (
			q.benefitReceived !== !!q.benefitEvent &&
			!(q.benefitReceived === undefined && !q.benefitEvent)
		)
			throw Error("Invalid retained bench benefit");
		if (q.benefitEvent) {
			evidence(q.benefitEvent, "bench-used", cast.lender.id, "workshop");
			const w = c.work.find(
				(w) =>
					w.mode === "main" &&
					q.from !== undefined &&
					q.until !== undefined &&
					w.startedAt >= q.from &&
					w.endedAt <= q.until &&
					q.benefitEvent?.causes.includes(w.event.id),
			);
			if (
				q.reply !== "agree" ||
				!q.replyEvent ||
				!w ||
				!q.benefitEvent.causes.includes(q.replyEvent.id) ||
				q.benefitEvent.at < w.endedAt ||
				q.benefitEvent.at > q.proposedUntil
			)
				throw Error("Unproven retained bench benefit");
		}
	}

	if (c.bench) {
		fields(c.bench, ["requestId", "from", "until", "commitmentId"]);
		const q = c.requests.find((q) => q.id === c.bench?.requestId);
		if (
			q?.reply !== "agree" ||
			q.from !== c.bench.from ||
			q.until !== c.bench.until ||
			q.commitmentId !== c.bench.commitmentId ||
			(s.now >= c.bench.until &&
				!s.people.some(
					(p) =>
						p.job?.offer.action === "cart-fast" &&
						p.job.end === s.now &&
						p.job.end <= (c.bench?.until ?? -1),
				))
		)
			throw Error("Invalid current bench reservation");
	}
	if (c.handover) {
		evidence(c.handover, "cart-returned", cast.repairer.id, "quay");
		if (
			c.progress !== 3 ||
			c.handover.at < (c.work.at(-1)?.endedAt ?? Infinity)
		)
			throw Error("Invalid cart handover timing");
	}
}
