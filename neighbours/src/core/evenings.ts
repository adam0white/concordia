import {
	type Affordance,
	AGENDA_DEFAULTS,
	adoptGoal,
	promise,
	socialEvent,
} from "@adam0white/human-framework";
import type { TownEvent } from "../contracts.ts";
import { holder, nameOf, type Position } from "./cast.ts";
import { presentAt, receiveEvent } from "./encounters.ts";
import { placeOf } from "./invariants.ts";
import type { Resident, Save } from "./state.ts";
import { validateEvent } from "./validation.ts";

export type EveningReply = {
	heardAt: number;
	bulletinEvent?: number;
	sourceId?: string;
	heardEvent?: TownEvent;
	reply?: "accepted" | "declined";
	commitmentId?: string;
	attendedMinutes: number;
	attempted?: boolean;
	delivered?: boolean;
};
export type HallPurpose = { notice: TownEvent; goalId?: string };
export type EveningSupport = {
	version: 1;
	kind: "open-evening-slot" | "advertise-evening";
	eventId: string;
	receipt: TownEvent;
};
export type EveningCycle = {
	supportSpent?: EveningSupport;
	index: number;
	purposes: Record<string, HallPurpose>;
	events: EveningEvent[];
	openedSlot?: {
		eventId: string;
		from: number;
		to: number;
		receipt: TownEvent;
	};
};
export const MAX_EVENING_CYCLES = 12;
export type EveningEvent = {
	cycle?: number;
	advertisement?: TownEvent;
	id: string;
	kind: "class" | "meal";
	/** The kind's organising position holder when the evening was created (see `organiserFor`). */
	organiserId: string;
	startsAt: number;
	endsAt: number;
	stage: "candidate" | "proposed" | "preparing" | "prepared" | "closed";
	notice?: TownEvent;
	bookingEvent?: number;
	hostCommitmentId?: string;
	result?: TownEvent;
	replies: Record<string, EveningReply>;
};
export type SocialEvenings = {
	version: 1;
	openedAt: number;
	lastCountAt: number;
	purposes?: Record<string, HallPurpose>;
	recurrence?: {
		version: 1;
		startedAt: number;
		firstStartsAt: number;
		cycles: EveningCycle[];
	};
	events: EveningEvent[];
};
export interface EveningHost {
	s: Save;
	event(
		kind: string,
		text: string,
		actorId?: string,
		placeId?: string,
		causes?: number[],
	): number;
}
/** The position that organises each kind of hall evening. */
export const ORGANISER_POSITION: Record<EveningEvent["kind"], Position> = {
	class: "teacher",
	meal: "cook",
};
export function organiserFor(
	s: Pick<Save, "people">,
	kind: EveningEvent["kind"],
): string | undefined {
	return holder(s, ORGANISER_POSITION[kind])?.person.id;
}
export function eveningLabel(e: EveningEvent, s: Pick<Save, "people">): string {
	const name = nameOf(s, e.organiserId);
	return e.kind === "class"
		? `${name}’s practical class`
		: `${name}’s shared supper`;
}
function clock(at: number) {
	return `Day ${Math.floor(at / 1440) + 1} at ${String(Math.floor((at % 1440) / 60)).padStart(2, "0")}:00`;
}
/** Keep the original four records intact; all host consumers use this enumeration. */
export function allEvenings(s: Save): EveningEvent[] {
	return [
		...(s.socialEvenings?.events ?? []),
		...(s.socialEvenings?.recurrence?.cycles.flatMap((c) => c.events) ?? []),
	];
}
export function eveningFor(s: Save, offer: Affordance) {
	const id = offer.id.slice(offer.id.indexOf(":") + 1);
	return allEvenings(s).find((e) => e.id === id);
}
export function roomBooking(s: Save, e: EveningEvent) {
	return allEvenings(s).find(
		(other) =>
			other.id !== e.id &&
			["preparing", "prepared"].includes(other.stage) &&
			other.startsAt < e.endsAt &&
			other.endsAt > e.startsAt,
	);
}
/** One hall, two evenings. Candidates are circumstances, never decisions. */
export function updateEvenings(host: EveningHost): void {
	const s = host.s;
	const organiser = (kind: EveningEvent["kind"]) => {
		const id = organiserFor(s, kind);
		if (!id) throw Error(`Nobody organises the ${kind} evenings`);
		return id;
	};
	if (!s.socialEvenings && s.hallSafe) {
		const nextDay = Math.floor(s.now / 1440) + 1;
		s.socialEvenings = {
			version: 1,
			openedAt: s.now,
			lastCountAt: s.now,
			events: [0, 3].flatMap((offset, index) =>
				(["class", "meal"] as const).map((kind) => ({
					id: `evening-${index}-${kind}`,
					kind,
					organiserId: organiser(kind),
					startsAt: (nextDay + offset) * 1440 + 1080,
					endsAt: (nextDay + offset) * 1440 + 1140,
					stage: "candidate" as const,
					replies: {},
				})),
			),
		};
	}
	const pilot = s.socialEvenings;
	if (!pilot) return;
	pilot.recurrence ??= {
		version: 1,
		startedAt: s.now,
		firstStartsAt: Math.max(
			(pilot.events[3]?.startsAt ?? s.now) + 7 * 1440,
			(Math.floor(s.now / 1440) + 4) * 1440 + 1080,
		),
		cycles: [],
	};
	const recurring = pilot.recurrence;
	const next = recurring.cycles.length;
	const start = recurring.firstStartsAt + next * 7 * 1440;
	if (next < MAX_EVENING_CYCLES && s.now >= start - 4 * 1440) {
		recurring.cycles.push({
			index: next,
			purposes: {},
			events: (["class", "meal"] as const).map((kind) => ({
				id: `weekly-${next}-${kind}`,
				cycle: next,
				kind,
				organiserId: organiser(kind),
				startsAt: start,
				endsAt: start + 60,
				stage: "candidate",
				replies: {},
			})),
		});
	}
	pilot.purposes ??= {};
	for (const kind of ["meal", "class"] as const) {
		const id = organiser(kind);
		const resident = s.people.find((r) => r.person.id === id);
		if (
			!resident ||
			!presentAt(resident, "hall", s.now) ||
			!s.hallSafe ||
			s.now >= (pilot.events[3]?.endsAt ?? 0)
		)
			continue;
		let purpose = pilot.purposes[id];
		if (purpose?.goalId) continue;
		if (!purpose) {
			const eventId = host.event(
				"hall-purpose",
				`The reopened hall has room for ${kind === "meal" ? `the shared supper ${resident.person.name} promised` : `${resident.person.name}’s evening class that moved after the flood`}.`,
				id,
				"hall",
			);
			purpose = {
				notice: structuredClone(
					s.events.find((event) => event.id === eventId) as TownEvent,
				),
			};
			pilot.purposes[id] = purpose;
		}
		if (receiveEvent(resident, purpose.notice, "saw"))
			purpose.goalId = adoptGoal(
				resident.person,
				{
					label:
						kind === "meal"
							? "Bring back the shared supper I promised"
							: "Bring the displaced class back to the hall",
					serves: ["meaning", "belonging"],
					importance: 0.6,
					deadline: pilot.events[3]?.endsAt,
					advancedBy: [
						{ action: `propose-${kind}`, amount: 0.15 },
						{ action: `prepare-${kind}`, amount: 0.25 },
						{ action: `host-${kind}`, amount: 0.6 },
					],
				},
				s.now,
			).id;
	}
	for (const cycle of recurring.cycles) {
		for (const kind of ["meal", "class"] as const) {
			const id = organiser(kind);
			const resident = s.people.find((r) => r.person.id === id);
			const latestOpportunity = Math.max(...cycle.events.map((e) => e.endsAt));
			// One weekly purpose allows either legal date from its first received observation.
			// Opening a slot therefore never rewrites a person’s existing goal.
			const deadline =
				recurring.firstStartsAt + cycle.index * 7 * 1440 + 1440 + 60;
			if (
				!resident ||
				!s.hallSafe ||
				!presentAt(resident, "hall", s.now) ||
				s.now >= latestOpportunity
			)
				continue;
			let purpose = cycle.purposes[id];
			if (purpose?.goalId) continue;
			if (!purpose) {
				const eventId = host.event(
					"hall-purpose",
					`${resident.person.name} can arrange another ${kind === "meal" ? "shared supper" : "practical class"}. ${cycle.openedSlot ? "A second hall evening is now available for this week." : `${nameOf(s, organiser("meal"))}’s supper and ${nameOf(s, organiser("class"))}’s class both need the hall for the same weekly hour.`}`,
					id,
					"hall",
				);
				purpose = {
					notice: structuredClone(
						s.events.find((e) => e.id === eventId) as TownEvent,
					),
				};
				cycle.purposes[id] = purpose;
			}
			if (receiveEvent(resident, purpose.notice, "saw"))
				purpose.goalId = adoptGoal(
					resident.person,
					{
						label: `${kind === "meal" ? "Arrange this week’s shared supper" : "Arrange this week’s practical class"} (week ${cycle.index + 1})`,
						serves: ["meaning", "belonging"],
						importance: 0.6,
						deadline,
						advancedBy: [
							{ action: `propose-${kind}`, amount: 0.15 },
							{ action: `prepare-${kind}`, amount: 0.25 },
							{ action: `host-${kind}`, amount: 0.6 },
						],
					},
					s.now,
				).id;
		}
	}
	for (const e of allEvenings(s)) {
		if (e.notice && e.stage !== "closed" && s.now < e.startsAt) {
			for (const r of s.people) {
				if (e.replies[r.person.id] || !presentAt(r, "hall", s.now)) continue;
				if (
					receiveEvent(
						r,
						e.notice,
						"saw",
						`Read the hall noticeboard: ${e.notice.text}`,
					)
				)
					e.replies[r.person.id] = { heardAt: s.now, attendedMinutes: 0 };
			}
		}
		const organiser = s.people.find((r) => r.person.id === e.organiserId);
		if (
			pilot.lastCountAt < s.now &&
			e.stage === "prepared" &&
			organiser?.job?.offer.id === `host:${e.id}` &&
			presentAt(organiser, "hall", s.now)
		) {
			for (const r of s.people) {
				const reply = e.replies[r.person.id];
				if (
					!reply ||
					!r.job ||
					!presentAt(r, "hall", s.now) ||
					![`host:${e.id}`, `attend:${e.id}`].includes(r.job.offer.id)
				)
					continue;
				const minutes = Math.max(
					0,
					Math.min(s.now, e.endsAt, r.job.end, organiser.job.end) -
						Math.max(
							pilot.lastCountAt,
							e.startsAt,
							r.job.arrive,
							organiser.job.arrive,
						),
				);
				if (
					r.person.id !== e.organiserId ||
					s.people.some(
						(other) =>
							other.person.id !== e.organiserId &&
							other.job?.offer.id === `attend:${e.id}` &&
							presentAt(other, "hall", s.now) &&
							other.job.arrive <= s.now - 15,
					)
				)
					reply.attendedMinutes += minutes;
			}
		}
		if (
			e.stage !== "closed" &&
			s.now > e.endsAt &&
			!s.people.some(
				(r) =>
					r.job && [`host:${e.id}`, `attend:${e.id}`].includes(r.job.offer.id),
			)
		) {
			if (!e.notice) {
				e.stage = "closed";
				continue;
			}
			const delivered = Object.entries(e.replies)
				.filter(([id, r]) => id !== e.organiserId && r.delivered)
				.map(
					([id]) => s.people.find((r) => r.person.id === id)?.person.name ?? id,
				);
			const id = host.event(
				"evening-ended",
				`${eveningLabel(e, s)}: ${delivered.length ? `${delivered.join(", ")} ${e.kind === "class" ? "received the practical lesson" : "ate supper with the host"}.` : "no guest spent the required fifteen minutes awake with the host."}${!e.bookingEvent ? " The room was never prepared." : ""}`,
				e.organiserId,
				"hall",
				e.notice ? [e.notice.id] : [],
			);
			e.result = structuredClone(s.events.find((event) => event.id === id));
			e.stage = "closed";
		}
	}
	pilot.lastCountAt = s.now;
}
export function eveningOffers(
	s: Save,
	r: Resident,
	historical?: Affordance,
): Affordance[] {
	const offers: Affordance[] = [];
	const hall = placeOf(s, "hall"),
		from = placeOf(s, r.place);
	const travel =
		r.place === "hall"
			? 0
			: Math.ceil(
					Math.hypot(hall.x - from.x, hall.y - from.y) / (s.bus ? 35 : 20),
				) * 15;
	const add = (
		e: EveningEvent,
		verb: string,
		action: string,
		label: string,
		work: number,
		advertises: Affordance["advertises"],
		extra: Partial<Affordance> = {},
	) => {
		const id = `${verb}:${e.id}`;
		const noticeboard = ["propose", "accept", "decline"].includes(verb);
		if (
			historical
				? historical.id !== id
				: !noticeboard && hall.reserved >= hall.capacity
		)
			return;
		if (!historical && verb === "attend") {
			const hostHasSeat = s.people.some(
				(person) =>
					person.person.id === e.organiserId &&
					person.job?.offer.id === `host:${e.id}`,
			);
			if (hall.reserved >= hall.capacity - (hostHasSeat ? 0 : 1)) return;
		}
		if (
			!historical &&
			!noticeboard &&
			allEvenings(s).some(
				(other) =>
					other.id !== e.id &&
					["preparing", "prepared"].includes(other.stage) &&
					s.now + travel < other.endsAt &&
					s.now + travel + work > other.startsAt,
			)
		)
			return;
		offers.push({
			id,
			action,
			label,
			placeId: "hall",
			duration: work + travel,
			effort: 0.1,
			advertises,
			...extra,
			...(noticeboard ? { tags: [...(extra.tags ?? []), "noticeboard"] } : {}),
		});
	};
	for (const e of allEvenings(s)) {
		if (historical && !historical.id.endsWith(`:${e.id}`)) continue;
		const own = r.person.id === e.organiserId;
		const reply = e.replies[r.person.id];
		const before = s.now + travel + 15 < e.startsAt;
		const canPropose = s.now + travel + 15 + 30 <= e.startsAt;
		const canPrepare = s.now + travel + 30 <= e.startsAt;
		if (
			own &&
			(historical || (s.hallSafe && canPropose && e.stage === "candidate"))
		)
			add(
				e,
				"propose",
				`propose-${e.kind}`,
				`Invite neighbours and promise to host ${eveningLabel(e, s)} · ${clock(e.startsAt)}`,
				15,
				{ meaning: 0.35, competence: 0.25 },
			);
		if (
			!own &&
			(historical ||
				(before &&
					["proposed", "preparing", "prepared"].includes(e.stage) &&
					reply &&
					!reply.reply))
		) {
			add(
				e,
				"accept",
				"accept-evening",
				`Accept ${eveningLabel(e, s)} · ${clock(e.startsAt)}`,
				15,
				{ belonging: 0.25, meaning: 0.2 },
				{ targetId: e.organiserId, tags: ["social"] },
			);
			add(
				e,
				"decline",
				"decline-evening",
				`Decline ${eveningLabel(e, s)}`,
				15,
				{ autonomy: 0.2 },
				{ targetId: e.organiserId },
			);
		}
		if (
			own &&
			(historical ||
				(canPrepare && e.stage === "proposed" && !roomBooking(s, e)))
		)
			add(
				e,
				"prepare",
				`prepare-${e.kind}`,
				`Prepare the hall for ${eveningLabel(e, s)}`,
				30,
				{ meaning: 0.4, competence: 0.3 },
				{ tags: ["work"] },
			);
		if (
			own &&
			(historical ||
				(e.stage === "prepared" &&
					s.now >= e.startsAt - travel - 60 &&
					s.now + travel <= e.endsAt - 15))
		)
			add(
				e,
				"host",
				`host-${e.kind}`,
				`Host ${eveningLabel(e, s)} at the hall`,
				120,
				{ meaning: 0.5, belonging: 0.4, competence: 0.3 },
				{ tags: ["social", "evening"] },
			);
		if (
			!own &&
			(historical ||
				(e.stage === "prepared" &&
					reply?.reply === "accepted" &&
					!reply.attempted &&
					s.now >= e.startsAt - travel - 30 &&
					s.now + travel <= e.endsAt - 30 &&
					(e.kind !== "meal" ||
						(placeOf(s, "market").stock > 0 && r.wealth >= 1))))
		)
			add(
				e,
				"attend",
				`attend-${e.kind}`,
				`Go to ${eveningLabel(e, s)}`,
				45,
				e.kind === "class"
					? { competence: 0.4, belonging: 0.35 }
					: { food: 0.65, belonging: 0.5 },
				{
					targetId: e.organiserId,
					tags: ["social", "evening"],
					...(e.kind === "meal" ? { material: -1 } : {}),
					fulfills: reply?.commitmentId ? [reply.commitmentId] : [],
					// HF 2.8.0 going along: name who is already on their way to or at this evening. HF weighs only
					// the ties this person actually has. Towns without `together` keep their offers exactly. A
					// historical offer omits it: who was going is a fact of that moment, checked on restore instead.
					...(s.together && !historical
						? {
								alongside: s.people
									.filter(
										(o) =>
											o.person.id !== r.person.id &&
											o.person.body.alive &&
											(o.job?.offer.id === `attend:${e.id}` ||
												o.job?.offer.id === `host:${e.id}`),
									)
									.map((o) => o.person.id)
									.sort(),
							}
						: {}),
				},
			);
	}
	return offers;
}
/** Opening a second date cannot move an invitation or an existing appointment. */
export function canOpenEveningSlot(s: Save, e: EveningEvent): boolean {
	const cycle = s.socialEvenings?.recurrence?.cycles.find(
		(c) => c.index === e.cycle,
	);
	return (
		!!cycle &&
		!cycle.openedSlot &&
		e.stage === "candidate" &&
		!e.notice &&
		s.now < e.startsAt &&
		!s.people.some((r) => r.job?.offer.id.endsWith(`:${e.id}`)) &&
		!allEvenings(s).some(
			(other) =>
				other.id !== e.id &&
				!!other.notice &&
				other.startsAt < e.endsAt + 1440 &&
				other.endsAt > e.startsAt + 1440,
		)
	);
}
export function canAdvertiseEvening(s: Save, e: EveningEvent): boolean {
	return (
		!!e.notice && !e.advertisement && e.stage !== "closed" && s.now < e.startsAt
	);
}
/** The two options share one weekly credit. Ordinary interventions never use it. */
export function weeklySupportRemaining(s: Save, e: EveningEvent): 0 | 1 {
	const cycle = s.socialEvenings?.recurrence?.cycles.find(
		(c) => c.index === e.cycle,
	);
	return cycle &&
		!cycle.supportSpent &&
		cycle.events.some(
			(candidate) => candidate.stage !== "closed" && s.now < candidate.startsAt,
		)
		? 1
		: 0;
}
/** A scarce observer action changes circumstances; HF still owns attention and choice. */
export function interveneEvening(
	host: EveningHost,
	kind: "open-evening-slot" | "advertise-evening",
	eventId?: string,
): void {
	const s = host.s;
	const e = allEvenings(s).find((candidate) => candidate.id === eventId);
	if (
		!e ||
		(kind === "open-evening-slot"
			? !canOpenEveningSlot(s, e)
			: !canAdvertiseEvening(s, e))
	)
		throw Error("Evening intervention is no longer available");
	const cycle = s.socialEvenings?.recurrence?.cycles.find(
		(c) => c.index === e.cycle,
	);
	const weekly = weeklySupportRemaining(s, e) === 1;
	if (!weekly && !s.controls) throw Error("No intervention allowance remains");
	if (!weekly) s.controls--;
	let receipt: TownEvent;
	if (kind === "open-evening-slot") {
		if (!cycle) throw Error("Missing evening cycle");
		const from = e.startsAt;
		e.startsAt += 1440;
		e.endsAt += 1440;
		const id = host.event(
			"intervention",
			`A second hall evening opened for ${eveningLabel(e, s)}. It moved from ${clock(from)} to ${clock(e.startsAt)} before any invitation was posted.`,
			undefined,
			"hall",
		);
		receipt = structuredClone(
			s.events.find((event) => event.id === id) as TownEvent,
		);
		cycle.openedSlot = {
			eventId: e.id,
			from,
			to: e.startsAt,
			receipt: structuredClone(
				s.events.find((event) => event.id === id) as TownEvent,
			),
		};
	} else {
		const notice = e.notice;
		if (!notice) throw Error("Missing evening invitation");
		const id = host.event(
			"intervention",
			`The town bulletin shares the posted invitation: ${notice.text}`,
			undefined,
			"hall",
			[notice.id],
		);
		const bulletin = s.events.find((event) => event.id === id) as TownEvent;
		bulletin.source = "town-bulletin";
		e.advertisement = structuredClone(bulletin);
		receipt = e.advertisement;
		for (const resident of s.people) {
			if (
				!resident.person.body.alive ||
				resident.person.body.asleep ||
				resident.job?.offer.mode === "sleep" ||
				e.replies[resident.person.id]
			)
				continue;
			if (receiveEvent(resident, bulletin, "told"))
				e.replies[resident.person.id] = {
					heardAt: s.now,
					attendedMinutes: 0,
					bulletinEvent: id,
				};
		}
	}
	if (weekly && cycle)
		cycle.supportSpent = {
			version: 1,
			kind,
			eventId: e.id,
			receipt: structuredClone(receipt),
		};
}

export function beginEvening(s: Save, r: Resident): void {
	const job = r.job;
	if (!job) return;
	const e = eveningFor(s, job.offer);
	if (!e) return;
	if (job.offer.id.startsWith("prepare:")) {
		e.stage = "preparing";
		e.bookingEvent = job.event;
	}
	if (job.offer.id.startsWith("attend:")) {
		const reply = e.replies[r.person.id];
		if (reply) reply.attempted = true;
	}
}
export function interruptEvening(s: Save, r: Resident): void {
	const e = r.job && eveningFor(s, r.job.offer);
	if (e?.stage === "preparing" && e.bookingEvent === r.job?.event) {
		e.stage = "proposed";
		delete e.bookingEvent;
	}
}
export function finishEvening(
	host: EveningHost,
	r: Resident,
): { handled: boolean; delivered: boolean; companions: string[] } {
	const s = host.s,
		job = r.job;
	const e = job && eveningFor(s, job.offer);
	if (!job || !e) return { handled: false, delivered: false, companions: [] };
	if (job.offer.id.startsWith("propose:")) {
		const id = host.event(
			"evening-proposed",
			`${r.person.name} invited neighbours to ${eveningLabel(e, s)} in the hall on ${clock(e.startsAt)}. ${e.kind === "meal" ? "Bring one coin for your meal." : "Learn practical timber checks. There is no fee."} Accepting is a promise to attend. The invitation does not require anyone to accept.`,
			r.person.id,
			"hall",
			[job.event],
		);
		e.notice = structuredClone(s.events.find((event) => event.id === id));
		e.stage = "proposed";
		e.hostCommitmentId = promise(r.person, {
			kind: "promise",
			toId: "self",
			actions: [`host-${e.kind}`],
			from: e.startsAt,
			until: e.endsAt,
			importance: 0.6,
			label: `Host ${eveningLabel(e, s)} · ${clock(e.startsAt)}`,
		}).id;
		e.replies[r.person.id] = { heardAt: s.now, attendedMinutes: 0 };
	} else if (job.offer.id.startsWith("accept:")) {
		const reply = e.replies[r.person.id];
		if (reply && !reply.reply) {
			reply.reply = "accepted";
			reply.commitmentId = promise(r.person, {
				kind: "appointment",
				toId: e.organiserId,
				targetId: e.organiserId,
				actions: [`attend-${e.kind}`],
				from: e.startsAt,
				until: e.endsAt,
				importance: 0.6,
				label: `${eveningLabel(e, s)} · ${clock(e.startsAt)}`,
			}).id;
			host.event(
				"evening-accepted",
				`${r.person.name} accepted ${eveningLabel(e, s)} on ${clock(e.startsAt)}.`,
				r.person.id,
				"hall",
				e.notice ? [e.notice.id, job.event] : [job.event],
			);
		}
	} else if (job.offer.id.startsWith("decline:")) {
		const reply = e.replies[r.person.id];
		if (reply && !reply.reply) {
			reply.reply = "declined";
			host.event(
				"evening-declined",
				`${r.person.name} declined ${eveningLabel(e, s)}.`,
				r.person.id,
				"hall",
				[job.event],
			);
		}
	} else if (job.offer.id.startsWith("prepare:")) {
		e.stage = "prepared";
		host.event(
			"evening-prepared",
			`${r.person.name} prepared the hall for ${eveningLabel(e, s)} on ${clock(e.startsAt)}. The other activity cannot use the same room at that time.`,
			r.person.id,
			"hall",
			e.notice ? [e.notice.id, job.event] : [job.event],
		);
	}
	const attendance =
		job.offer.id.startsWith("attend:") || job.offer.id.startsWith("host:");
	const reply = e.replies[r.person.id];
	const delivered = attendance && (reply?.attendedMinutes ?? 0) >= 15;
	const companions = delivered
		? Object.entries(e.replies)
				.filter(
					([id, other]) =>
						id !== r.person.id &&
						other.attendedMinutes >= 15 &&
						(r.person.id === e.organiserId || id === e.organiserId),
				)
				.map(([id]) => id)
		: [];
	if (attendance && reply) reply.delivered = delivered;
	if (delivered && job.offer.id.startsWith("attend:")) {
		const organiser = s.people.find(
			(other) => other.person.id === e.organiserId,
		);
		if (organiser) {
			socialEvent(r.person, {
				at: s.now,
				kind: "chat",
				otherId: e.organiserId,
				byMe: false,
				magnitude: 0.5,
			});
			socialEvent(organiser.person, {
				at: s.now,
				kind: "chat",
				otherId: r.person.id,
				byMe: true,
				magnitude: 0.5,
			});
		}
		host.event(
			"evening-attended",
			`${r.person.name} ${e.kind === "class" ? `received ${nameOf(s, e.organiserId)}’s practical timber lesson` : `ate supper with ${nameOf(s, e.organiserId)}`} after spending ${reply?.attendedMinutes} minutes awake together.`,
			r.person.id,
			"hall",
			e.notice ? [e.notice.id, job.event] : [job.event],
		);
	}
	if (attendance && !delivered)
		host.event(
			"evening-missed",
			`${r.person.name} arrived for the planned ${e.kind === "class" ? "class" : "meal"}, but did not spend fifteen minutes awake with the host during its scheduled hour.`,
			r.person.id,
			"hall",
			[job.event],
		);
	return {
		handled: true,
		delivered: attendance ? delivered : true,
		companions,
	};
}

/** Imported packets cannot mint invitations, promises, room capacity or delivery. */
export function validateEvenings(s: Save, ids: Set<string>): void {
	const pilot = s.socialEvenings;
	if (pilot === undefined) return;
	const fields = (object: object, allowed: string[]) => {
		if (
			!object ||
			typeof object !== "object" ||
			Array.isArray(object) ||
			Object.keys(object).some((key) => !allowed.includes(key))
		)
			throw Error("Invalid evening fields");
	};
	fields(pilot, [
		"version",
		"openedAt",
		"lastCountAt",
		"events",
		"purposes",
		"recurrence",
	]);
	if (
		pilot.version !== 1 ||
		!Number.isSafeInteger(pilot.openedAt) ||
		pilot.openedAt < 480 ||
		pilot.openedAt > s.now ||
		!Number.isSafeInteger(pilot.lastCountAt) ||
		pilot.lastCountAt < pilot.openedAt ||
		pilot.lastCountAt !== s.now ||
		!Array.isArray(pilot.events) ||
		pilot.events.length !== 4
	)
		throw Error("Invalid evening clock");
	const purposeGoalIds = new Set<string>();
	const validatePurposes = (
		purposes: Record<string, HallPurpose>,
		earliest: number,
	) => {
		fields(
			purposes,
			(["meal", "class"] as const).flatMap((kind) => {
				const id = organiserFor(s, kind);
				return id ? [id] : [];
			}),
		);
		for (const [id, purpose] of Object.entries(purposes)) {
			fields(purpose, ["notice", "goalId"]);
			validateEvent(purpose.notice, s, ids);
			if (
				purpose.notice.kind !== "hall-purpose" ||
				purpose.notice.actorId !== id ||
				purpose.notice.placeId !== "hall" ||
				purpose.notice.at < earliest ||
				(purpose.goalId !== undefined &&
					!s.people
						.find((r) => r.person.id === id)
						?.person.agenda.goals.some(
							(g) =>
								g.id === purpose.goalId && g.adoptedAt >= purpose.notice.at,
						))
			)
				throw Error("Invalid received hall purpose");
			if (purpose.goalId !== undefined) {
				if (purposeGoalIds.has(`${id}:${purpose.goalId}`))
					throw Error("Repeated hall purpose goal");
				purposeGoalIds.add(`${id}:${purpose.goalId}`);
			}
		}
	};
	if (pilot.purposes !== undefined)
		validatePurposes(pilot.purposes, pilot.openedAt);
	const recurrence = pilot.recurrence;
	if (recurrence !== undefined) {
		fields(recurrence, ["version", "startedAt", "firstStartsAt", "cycles"]);
		if (
			recurrence.version !== 1 ||
			!Number.isSafeInteger(recurrence.startedAt) ||
			recurrence.startedAt < pilot.openedAt ||
			recurrence.startedAt > s.now ||
			recurrence.firstStartsAt !==
				Math.max(
					(pilot.events[3]?.startsAt ?? s.now) + 7 * 1440,
					(Math.floor(recurrence.startedAt / 1440) + 4) * 1440 + 1080,
				) ||
			!Array.isArray(recurrence.cycles) ||
			recurrence.cycles.length > MAX_EVENING_CYCLES
		)
			throw Error("Invalid recurring evening clock");
		for (const [index, cycle] of recurrence.cycles.entries()) {
			fields(cycle, [
				"index",
				"purposes",
				"events",
				"openedSlot",
				"supportSpent",
			]);
			const base = recurrence.firstStartsAt + index * 7 * 1440;
			if (
				cycle.index !== index ||
				!Array.isArray(cycle.events) ||
				cycle.events.length !== 2 ||
				s.now < base - 4 * 1440
			)
				throw Error("Invalid evening cycle");
			validatePurposes(
				cycle.purposes,
				Math.max(recurrence.startedAt, base - 4 * 1440),
			);
			if (
				!cycle.supportSpent &&
				(cycle.openedSlot || cycle.events.some((e) => e.advertisement))
			)
				throw Error("Missing weekly support receipt");
			if (cycle.supportSpent !== undefined) {
				const spent = cycle.supportSpent;
				fields(spent, ["version", "kind", "eventId", "receipt"]);
				validateEvent(spent.receipt, s, ids);
				const target = cycle.events.find((e) => e.id === spent.eventId);
				const expectedReceipt =
					spent.kind === "open-evening-slot"
						? cycle.openedSlot?.eventId === spent.eventId
							? cycle.openedSlot.receipt
							: undefined
						: target?.advertisement;
				const signature = (e: TownEvent) =>
					JSON.stringify([
						e.id,
						e.at,
						e.kind,
						e.source,
						e.actorId,
						e.targetId,
						e.placeId,
						e.text,
						e.causes,
						e.importance,
					]);
				if (
					spent.version !== 1 ||
					!["open-evening-slot", "advertise-evening"].includes(spent.kind) ||
					!target ||
					!expectedReceipt ||
					signature(spent.receipt) !== signature(expectedReceipt) ||
					spent.receipt.at < Math.max(recurrence.startedAt, base - 4 * 1440)
				)
					throw Error("Invalid weekly support receipt");
			}
			if (cycle.openedSlot !== undefined) {
				const opened = cycle.openedSlot;
				fields(opened, ["eventId", "from", "to", "receipt"]);
				validateEvent(opened.receipt, s, ids);
				if (
					!cycle.events.some((e) => e.id === opened.eventId) ||
					opened.from !== base ||
					opened.to !== base + 1440 ||
					opened.receipt.kind !== "intervention" ||
					opened.receipt.actorId !== undefined ||
					opened.receipt.targetId !== undefined ||
					opened.receipt.source !== undefined ||
					opened.receipt.causes.length !== 0 ||
					opened.receipt.at >= base ||
					opened.receipt.at < Math.max(recurrence.startedAt, base - 4 * 1440) ||
					opened.receipt.placeId !== "hall"
				)
					throw Error("Invalid opened evening slot");
			}
		}
	}
	const knownActions =
		allEvenings(s).filter((e) => e.advertisement).length +
		(recurrence?.cycles.filter((c) => c.openedSlot).length ?? 0);
	const weeklyActions =
		recurrence?.cycles.filter((c) => c.supportSpent).length ?? 0;
	if (knownActions - weeklyActions > 3 - s.controls)
		throw Error("Unfunded evening intervention");
	for (const [index, e] of allEvenings(s).entries()) {
		fields(e, [
			"id",
			"cycle",
			"advertisement",
			"kind",
			"organiserId",
			"startsAt",
			"endsAt",
			"stage",
			"notice",
			"bookingEvent",
			"hostCommitmentId",
			"result",
			"replies",
		]);
		const kind = index % 2 === 0 ? "class" : "meal";
		const cycleIndex = index < 4 ? undefined : Math.floor((index - 4) / 2);
		const cycle =
			cycleIndex === undefined ? undefined : recurrence?.cycles[cycleIndex];
		const expectedStart = cycle
			? (recurrence?.firstStartsAt ?? 0) +
				cycle.index * 7 * 1440 +
				(cycle.openedSlot?.eventId === e.id ? 1440 : 0)
			: (Math.floor(pilot.openedAt / 1440) + 1 + (index < 2 ? 0 : 3)) * 1440 +
				1080;
		if (
			e.id !==
				(cycle
					? `weekly-${cycle.index}-${kind}`
					: `evening-${Math.floor(index / 2)}-${kind}`) ||
			e.cycle !== cycleIndex ||
			e.kind !== kind ||
			e.organiserId !== organiserFor(s, kind) ||
			e.startsAt !== expectedStart ||
			e.endsAt !== expectedStart + 60 ||
			!["candidate", "proposed", "preparing", "prepared", "closed"].includes(
				e.stage,
			) ||
			!e.replies ||
			typeof e.replies !== "object" ||
			Array.isArray(e.replies)
		)
			throw Error("Invalid evening candidate");
		if (e.notice) {
			validateEvent(e.notice, s, ids);
			if (
				e.notice.kind !== "evening-proposed" ||
				e.notice.actorId !== e.organiserId ||
				e.notice.placeId !== "hall" ||
				e.notice.at >= e.startsAt ||
				e.notice.at < pilot.openedAt
			)
				throw Error("Invalid evening invitation");
		} else if (
			!["candidate", "closed"].includes(e.stage) ||
			Object.keys(e.replies).length
		)
			throw Error("Missing evening invitation");
		if (e.advertisement !== undefined) {
			validateEvent(e.advertisement, s, ids);
			if (
				!e.notice ||
				e.advertisement.kind !== "intervention" ||
				e.advertisement.source !== "town-bulletin" ||
				e.advertisement.actorId !== undefined ||
				e.advertisement.targetId !== undefined ||
				e.advertisement.placeId !== "hall" ||
				e.advertisement.at < e.notice.at ||
				e.advertisement.at >= e.startsAt ||
				e.advertisement.causes.join() !== String(e.notice.id)
			)
				throw Error("Invalid evening advertisement");
		}
		if (
			e.bookingEvent !== undefined &&
			(!e.notice ||
				!Number.isSafeInteger(e.bookingEvent) ||
				e.bookingEvent <= e.notice.id ||
				e.bookingEvent >= s.nextEvent)
		)
			throw Error("Invalid room booking");
		if (
			["prepared", "preparing"].includes(e.stage) &&
			(!e.bookingEvent || roomBooking(s, e))
		)
			throw Error("Conflicting room booking");
		if (
			e.stage === "preparing" &&
			!s.people.some(
				(r) =>
					r.person.id === e.organiserId &&
					r.job &&
					r.job.event === e.bookingEvent &&
					r.job.offer.id === `prepare:${e.id}`,
			)
		)
			throw Error("Untracked room preparation");
		if (e.result) {
			validateEvent(e.result, s, ids);
			if (
				e.stage !== "closed" ||
				e.result.kind !== "evening-ended" ||
				e.result.actorId !== e.organiserId ||
				e.result.at <= e.endsAt
			)
				throw Error("Invalid evening result");
		} else if (e.stage === "closed" && e.notice)
			throw Error("Missing evening result");
		for (const [id, reply] of Object.entries(e.replies)) {
			fields(reply, [
				"heardAt",
				"bulletinEvent",
				"sourceId",
				"heardEvent",
				"reply",
				"commitmentId",
				"attendedMinutes",
				"attempted",
				"delivered",
			]);
			if (
				!ids.has(id) ||
				!e.notice ||
				!Number.isSafeInteger(reply.heardAt) ||
				reply.heardAt < e.notice.at ||
				reply.heardAt > s.now ||
				reply.heardAt >= e.startsAt ||
				(reply.reply !== undefined &&
					!["accepted", "declined"].includes(reply.reply)) ||
				!Number.isSafeInteger(reply.attendedMinutes) ||
				reply.attendedMinutes < 0 ||
				reply.attendedMinutes > Math.min(60, Math.max(0, s.now - e.startsAt)) ||
				(reply.attempted !== undefined &&
					typeof reply.attempted !== "boolean") ||
				(reply.delivered !== undefined &&
					typeof reply.delivered !== "boolean") ||
				(reply.delivered && reply.attendedMinutes < 15) ||
				(reply.attendedMinutes > 0 && !["prepared", "closed"].includes(e.stage))
			)
				throw Error("Invalid evening reply");
			if (
				reply.bulletinEvent !== undefined &&
				(reply.bulletinEvent !== e.advertisement?.id ||
					reply.heardAt !== e.advertisement?.at ||
					reply.sourceId !== undefined ||
					reply.heardEvent !== undefined)
			)
				throw Error("Invalid broadcast invitation receipt");
			if (reply.sourceId !== undefined || reply.heardEvent !== undefined) {
				if (
					!reply.sourceId ||
					!ids.has(reply.sourceId) ||
					!reply.heardEvent ||
					!e.replies[reply.sourceId] ||
					reply.sourceId === id
				)
					throw Error("Invalid invitation teller");
				validateEvent(reply.heardEvent, s, ids);
				if (
					reply.heardEvent.kind !== "evening-retold" ||
					reply.heardEvent.actorId !== reply.sourceId ||
					reply.heardEvent.targetId !== id ||
					reply.heardEvent.at !== reply.heardAt ||
					!reply.heardEvent.causes.includes(e.notice?.id ?? -1) ||
					(e.replies[reply.sourceId]?.heardAt ?? s.now + 1) > reply.heardAt
				)
					throw Error("Invalid retold invitation");
			}
			if (reply.reply === "accepted") {
				const agenda = s.people.find((r) => r.person.id === id)?.person.agenda;
				const c = agenda?.commitments.find((c) => c.id === reply.commitmentId);
				const closed =
					agenda?.commitments.filter((item) => item.status !== "pending") ?? [];
				// HF drops the oldest closed promises. A retained host outcome is not
				// a reason to keep that person's entire agenda indefinitely.
				const pruned =
					!c &&
					agenda &&
					e.stage === "closed" &&
					e.result &&
					e.endsAt < s.now &&
					typeof reply.commitmentId === "string" &&
					/^c[1-9]\d*$/.test(reply.commitmentId) &&
					Number(reply.commitmentId.slice(1)) < agenda.nextId &&
					closed.length >= AGENDA_DEFAULTS.maxClosedCommitments &&
					closed.every((item) => item.until >= e.endsAt);
				if (
					(!c && !pruned) ||
					(c &&
						(c.targetId !== e.organiserId ||
							c.toId !== e.organiserId ||
							c.from !== e.startsAt ||
							c.until !== e.endsAt ||
							c.actions.join() !== `attend-${e.kind}`))
				)
					throw Error("Evening promise differs from reply");
			} else if (reply.commitmentId !== undefined)
				throw Error("Unaccepted evening promise");
			if (
				id !== e.organiserId &&
				(reply.attempted || reply.attendedMinutes > 0) &&
				(reply.reply !== "accepted" ||
					(reply.attendedMinutes > 0 && !reply.attempted))
			)
				throw Error("Unaccepted attendance");
		}
	}
}
