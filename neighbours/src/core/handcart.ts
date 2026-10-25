import {
	type Affordance,
	adoptGoal,
	perceive,
	promise,
} from "@adam0white/human-framework";
import type { TownEvent } from "../contracts.ts";
import { parseProposalOrigin } from "./assistance.ts";
import {
	BENCH_HALF_LIFE,
	benchWindowLabel,
	receivedBenchWindow,
} from "./bench-opportunity.ts";
import { benchWindow, validateBenchProposal } from "./bench-window.ts";
import { requireHolder } from "./cast.ts";
import { overlapMinutes, presentAt, receiveEvent } from "./encounters.ts";
import { allEvenings } from "./evenings.ts";
import type { BenchRequest, HandcartSave } from "./handcart-state.ts";
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
	const r = s.people.find((p) => p.person.id === id);
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
	const attended = perceive(receiver.person, [
		{
			at: s.now,
			channel,
			kind,
			actorId: from,
			targetId: to,
			placeId: event.placeId,
			salience: 0.85,
			valence: ["help", "gift"].includes(kind) ? 0.35 : 0,
			summary: event.text,
		},
	]);
	if (!attended.length) return false;
	receiver.received = [
		...(receiver.received ?? []),
		{ ...event, targetId: to },
	].slice(-12);
	return true;
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
): boolean {
	return (
		!!r.job &&
		presentAt(r, place, s.now) &&
		presentAt(resident(s, otherId), place, s.now) &&
		overlapMinutes(r.job, resident(s, otherId), s.now) >= 15
	);
}
/** Activation follows the first scheduled evening; only seeing the cart creates its purpose. */
export function updateHandcart(host: HandcartHost): void {
	const s = host.s;
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
			!cartCast(s).repairer.person.body.alive ||
			!cartCast(s).lender.person.body.alive)
	)
		delete c.bench;
	if (c.handover) return;
	const { repairer: ravi, lender: ada, owner } = cartCast(s);
	if (presentAt(ravi, "workshop", s.now) && !c.raviGoalId) {
		c.observation ??= retained(
			host,
			"cart-observed",
			`${owner.person.name}’s flood-damaged handcart stands in the workshop. Repairing its axle, load platform and handles takes three work periods.`,
			ravi.person.id,
			"workshop",
		);
		if (receiveEvent(ravi, c.observation, "saw"))
			c.raviGoalId = adoptGoal(
				ravi.person,
				{
					label: `Restore ${owner.person.name}’s handcart and return it`,
					serves: ["competence", "meaning"],
					importance: 0.6,
					advancedBy: [
						{ action: "cart-fast", amount: 0.25 },
						{ action: "cart-slow", amount: 0.25 },
						{ action: "cart-handover", amount: 0.25 },
					],
				},
				s.now,
			).id;
	}
	if (presentAt(ada, "workshop", s.now) && !c.adaGoalId) {
		c.adaObservation ??= retained(
			host,
			"bench-work",
			`${ada.person.name} can earn two paid carpentry shifts each day at the main bench. Lending it means she must wait to work those shifts. It does not necessarily mean she will lose income.`,
			ada.person.id,
			"workshop",
		);
		if (receiveEvent(ada, c.adaObservation, "saw"))
			c.adaGoalId = adoptGoal(
				ada.person,
				{
					label: "Finish my own two paid carpentry shifts",
					serves: ["competence", "security"],
					importance: 0.6,
					advancedBy: [{ action: "work", amount: 0.5 }],
				},
				s.now,
			).id;
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
		actorId === cartCast(s).repairer.person.id ||
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
	if (!c || (!historical && (r.job || !r.person.body.alive || c.handover)))
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
	if (r.person.id === ravi.person.id) {
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
					? `Ask ${ada.person.name} for the main bench ${benchWindowLabel(receivedBenchWindow(s) ?? nextWindow(s.now + 15))}; her paid work needs it too`
					: `Ask ${ada.person.name} for tomorrow’s 08:00–12:00 main bench; her paid work needs it too`,
				"workshop",
				{ meaning: 0.2 },
				{ targetId: ada.person.id, tags: ["social"] },
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
				label: `Restore one cart section on ${ada.person.name}’s main bench · one hour`,
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
					o.person.id !== r.person.id &&
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
			(c.progress === 3 && jo.person.body.alive && presentAt(jo, "quay", s.now))
		)
			add(
				"cart-handover",
				`Return the restored handcart to ${jo.person.name}`,
				"quay",
				{ meaning: 0.45, belonging: 0.2 },
				{ targetId: jo.person.id, tags: ["help"] },
			);
	}
	if (
		r.person.id === ada.person.id &&
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
				? `Lend ${ravi.person.name} the main bench ${benchWindowLabel({ from: request.proposedFrom, until: request.proposedUntil })}; postpone my paid carpentry`
				: `Lend ${ravi.person.name} the main bench tomorrow 08:00–12:00; postpone my paid carpentry`,
			"workshop",
			{ meaning: 0.25, belonging: 0.2 },
			{ targetId: ravi.person.id, tags: ["social"] },
		);
		add(
			"cart-refuse",
			"Keep the main bench for my paid work",
			"workshop",
			{ autonomy: 0.25 },
			{ targetId: ravi.person.id, tags: ["social"] },
		);
		add(
			"cart-later",
			`Tell ${ravi.person.name} to ask again another day`,
			"workshop",
			{ autonomy: 0.15 },
			{ targetId: ravi.person.id, tags: ["social"] },
		);
	}
	return result;
}
/** Reservation is created only by a completed, received agreement. */
export function beginHandcart(_s: HandcartSave, _r: Resident): void {}
export function interruptHandcart(_s: HandcartSave, _r: Resident): void {
	// Interrupting one work period does not revoke a received agreement.
}
export function finishHandcart(
	host: HandcartHost,
	r: Resident,
): { handled: boolean; delivered: boolean; companions: string[] } {
	const s = host.s,
		c = s.handcart,
		j = r.job,
		action = j?.offer.action;
	if (!c || !j || !action?.startsWith("cart-"))
		return { handled: false, delivered: false, companions: [] };
	let delivered = false;
	const companions: string[] = [];
	const { repairer: ravi, lender: ada, owner: jo } = cartCast(s);
	if (
		action === "cart-ask" &&
		r.person.id === ravi.person.id &&
		meeting(s, r, ada.person.id, "workshop") &&
		c.requests.length < 8
	) {
		const proposedWindow = receivedBenchWindow(s, true);
		const window = proposedWindow ?? nextWindow(s.now);
		const e = retained(
			host,
			"bench-request",
			proposedWindow
				? `${ravi.person.name} asked ${ada.person.name} to borrow the main bench ${benchWindowLabel(window)} for ${jo.person.name}’s handcart. ${ada.person.name}’s paid carpentry needs that bench too.`
				: `${ravi.person.name} asked ${ada.person.name} to borrow the main bench tomorrow from 08:00 to 12:00 for ${jo.person.name}’s handcart. ${ada.person.name}’s paid carpentry needs that bench too.`,
			ravi.person.id,
			"workshop",
			[j.event, ...(proposedWindow && c.premise ? [c.premise.event.id] : [])],
		);
		if (socialReceipt(s, ravi.person.id, ada.person.id, e, "bench-request")) {
			c.requests.push({
				id: c.requests.length + 1,
				event: e,
				heardAt: s.now,
				proposedFrom: window.from,
				proposedUntil: window.until,
				...(proposedWindow && c.premise
					? { opportunityEventId: c.premise.event.id }
					: {}),
			});
			delivered = true;
			companions.push(ada.person.id);
		}
	} else if (
		["cart-agree", "cart-refuse", "cart-later"].includes(action) &&
		r.person.id === ada.person.id
	) {
		const request = latest(s);
		if (
			request &&
			!request.reply &&
			(s.now < request.proposedFrom ||
				(request.opportunityEventId !== undefined &&
					s.now === request.proposedFrom)) &&
			meeting(s, r, ravi.person.id, "workshop")
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
						? `${ada.person.name} agreed to lend ${ravi.person.name} the main bench ${benchWindowLabel({ from: request.proposedFrom, until: request.proposedUntil })}. Her paid carpentry must wait.`
						: `${ada.person.name} agreed to lend ${ravi.person.name} the main bench tomorrow from 08:00 to 12:00. Her paid carpentry must wait.`
					: reply === "refuse"
						? `${ada.person.name} kept the main bench for her paid carpentry. ${ravi.person.name} can use the slower side bench.`
						: `${ada.person.name} asked ${ravi.person.name} to discuss the bench another day.`,
				ada.person.id,
				"workshop",
				[request.event.id, j.event],
			);
			if (socialReceipt(s, ada.person.id, ravi.person.id, e, "bench-reply")) {
				request.reply = reply;
				request.replyEvent = e;
				delivered = true;
				companions.push(ravi.person.id);
				if (reply === "agree") {
					const window = {
						from: request.proposedFrom,
						until: request.proposedUntil,
					};
					const commitment = promise(r.person, {
						kind: "abstain",
						toId: ravi.person.id,
						actions: [],
						violatedBy: ["work"],
						from: window.from,
						until: window.until,
						importance: 0.6,
						label: request.opportunityEventId
							? `Leave the main bench for ${ravi.person.name}’s cart work ${benchWindowLabel(window)}`
							: `Leave the main bench for ${ravi.person.name}’s cart work from 08:00 to 12:00`,
					});
					Object.assign(request, window, { commitmentId: commitment.id });
					c.bench = {
						requestId: request.id,
						...window,
						commitmentId: commitment.id,
					};
				}
			}
		}
	} else if (action === "cart-slow" || action === "cart-fast") {
		const b = c.bench;
		const legal =
			action === "cart-slow" || (b && j.arrive >= b.from && j.end <= b.until);
		if (r.person.id === ravi.person.id && c.progress < 3 && legal) {
			c.progress++;
			delivered = true;
			const workEvent = retained(
				host,
				"cart-progress",
				`${ravi.person.name} restored ${c.progress} of three cart sections using the ${action === "cart-fast" ? "main" : "side"} bench.`,
				ravi.person.id,
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
						`${ravi.person.name} saw the main bench was free during the period ${ada.person.name} had agreed to lend him, and completed his cart work there.`,
						ada.person.id,
						"workshop",
						[request.replyEvent?.id ?? request.event.id, workEvent.id],
					);
					if (
						socialReceipt(s, ada.person.id, ravi.person.id, e, "help", "saw")
					) {
						request.benefitReceived = true;
						request.benefitEvent = structuredClone(e);
					}
				}
			}
			if (c.bench && s.now >= c.bench.until) delete c.bench;
		}
	} else if (
		action === "cart-handover" &&
		r.person.id === ravi.person.id &&
		c.progress === 3 &&
		!c.handover &&
		meeting(s, r, jo.person.id, "quay")
	) {
		const e = retained(
			host,
			"cart-returned",
			`${ravi.person.name} returned the restored handcart to ${jo.person.name}. It can carry one extra unit of food on each supply trip ${jo.person.name} completes.`,
			ravi.person.id,
			"quay",
			[j.event],
		);
		if (socialReceipt(s, ravi.person.id, jo.person.id, e, "gift")) {
			c.handover = e;
			delivered = true;
			companions.push(jo.person.id);
		}
	}
	return { handled: true, delivered, companions };
}
/** Called only after a physical supply trip completes; the cart is reusable. */
export function cartSupplyBonus(
	s: HandcartSave,
	id: string,
	action: string,
): number {
	return action === "supply" &&
		s.handcart?.handover &&
		id === cartCast(s).owner.person.id
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
		["raviGoalId", cast.repairer.person.id],
		["adaGoalId", cast.lender.person.id],
	] as const) {
		if (
			c[key] !== undefined &&
			!resident(s, id).person.agenda.goals.some((g) => g.id === c[key])
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
		evidence(
			c.observation,
			"cart-observed",
			cast.repairer.person.id,
			"workshop",
		);
	if (c.adaObservation)
		evidence(c.adaObservation, "bench-work", cast.lender.person.id, "workshop");
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
		const goal = cast.repairer.person.agenda.goals.find(
			(g) => g.id === c.raviGoalId,
		);
		if (
			!c.observation ||
			!goal ||
			goal.temporal?.halfLifeMinutes !== BENCH_HALF_LIFE ||
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
			p.event.targetId !== cast.repairer.person.id ||
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
		evidence(q.event, "bench-request", cast.repairer.person.id, "workshop");
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
			evidence(q.replyEvent, "bench-reply", cast.lender.person.id, "workshop");
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
			const promise = cast.lender.person.agenda.commitments.find(
				(p) => p.id === q.commitmentId,
			);
			if (
				q.from !== expected.from ||
				q.until !== expected.until ||
				!promise ||
				promise.kind !== "abstain" ||
				promise.toId !== cast.repairer.person.id ||
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
		evidence(w.event, "cart-progress", cast.repairer.person.id, "workshop");
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
			evidence(q.benefitEvent, "bench-used", cast.lender.person.id, "workshop");
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
		evidence(c.handover, "cart-returned", cast.repairer.person.id, "quay");
		if (
			c.progress !== 3 ||
			c.handover.at < (c.work.at(-1)?.endedAt ?? Infinity)
		)
			throw Error("Invalid cart handover timing");
	}
}
