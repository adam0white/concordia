import {
	type Affordance,
	adoptGoal,
	promise,
	socialEvent,
} from "@adam0white/human-framework";
import type { TownEvent } from "../contracts.ts";
import { presentAt, receiveEvent } from "./encounters.ts";
import { placeOf } from "./invariants.ts";
import type { Resident, Save } from "./state.ts";
import { validateEvent } from "./validation.ts";

export type EveningReply = {
	heardAt: number;
	sourceId?: string;
	heardEvent?: TownEvent;
	reply?: "accepted" | "declined";
	commitmentId?: string;
	attendedMinutes: number;
	attempted?: boolean;
	delivered?: boolean;
};
export type EveningEvent = {
	id: string;
	kind: "class" | "meal";
	organiserId: "lea" | "sam";
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
	purposes?: Record<string, { notice: TownEvent; goalId?: string }>;
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
export function eveningLabel(e: EveningEvent): string {
	return e.kind === "class" ? "Lea’s practical class" : "Sam’s shared supper";
}
function clock(at: number) {
	return `Day ${Math.floor(at / 1440) + 1} at ${String(Math.floor((at % 1440) / 60)).padStart(2, "0")}:00`;
}
export function eveningFor(s: Save, offer: Affordance) {
	const id = offer.id.slice(offer.id.indexOf(":") + 1);
	return s.socialEvenings?.events.find((e) => e.id === id);
}
export function roomBooking(s: Save, e: EveningEvent) {
	return s.socialEvenings?.events.find(
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
					organiserId: kind === "class" ? "lea" : "sam",
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
	pilot.purposes ??= {};
	for (const [id, kind] of [
		["sam", "meal"],
		["lea", "class"],
	] as const) {
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
				`The reopened hall has room for ${id === "sam" ? "the shared supper Sam promised" : "Lea’s displaced evening class"}.`,
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
	for (const e of pilot.events) {
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
				`${eveningLabel(e)}: ${delivered.length ? `${delivered.join(", ")} ${e.kind === "class" ? "received the practical lesson" : "ate supper with the host"}.` : "nobody received the planned activity."}${!e.bookingEvent ? " The room was never prepared." : ""}`,
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
			s.socialEvenings?.events.some(
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
	for (const e of s.socialEvenings?.events ?? []) {
		if (historical && !historical.id.endsWith(`:${e.id}`)) continue;
		const own = r.person.id === e.organiserId;
		const reply = e.replies[r.person.id];
		const before = s.now + travel + 15 < e.startsAt;
		if (
			own &&
			(historical || (s.hallSafe && before && e.stage === "candidate"))
		)
			add(
				e,
				"propose",
				`propose-${e.kind}`,
				`Invite neighbours and promise to host ${eveningLabel(e)} · ${clock(e.startsAt)}`,
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
				`Accept ${eveningLabel(e)} · ${clock(e.startsAt)}`,
				15,
				{ belonging: 0.25, meaning: 0.2 },
				{ targetId: e.organiserId, tags: ["social"] },
			);
			add(
				e,
				"decline",
				"decline-evening",
				`Decline ${eveningLabel(e)}`,
				15,
				{ autonomy: 0.2 },
				{ targetId: e.organiserId },
			);
		}
		if (
			own &&
			(historical || (before && e.stage === "proposed" && !roomBooking(s, e)))
		)
			add(
				e,
				"prepare",
				`prepare-${e.kind}`,
				`Prepare the hall for ${eveningLabel(e)}`,
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
				`Host ${eveningLabel(e)} at the hall`,
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
				`Go to ${eveningLabel(e)}`,
				45,
				e.kind === "class"
					? { competence: 0.4, belonging: 0.35 }
					: { food: 0.65, belonging: 0.5 },
				{
					targetId: e.organiserId,
					tags: ["social", "evening"],
					...(e.kind === "meal" ? { material: -1 } : {}),
					fulfills: reply?.commitmentId ? [reply.commitmentId] : [],
				},
			);
	}
	return offers;
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
			`${r.person.name} invited neighbours to ${eveningLabel(e)} in the hall on ${clock(e.startsAt)}. ${e.kind === "meal" ? "Bring one coin for your meal." : "Practical timber checks; no fee."} A reply is a promise to attend, not a command.`,
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
			label: `Host ${eveningLabel(e)} · ${clock(e.startsAt)}`,
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
				label: `${eveningLabel(e)} · ${clock(e.startsAt)}`,
			}).id;
			host.event(
				"evening-accepted",
				`${r.person.name} accepted ${eveningLabel(e)} on ${clock(e.startsAt)}.`,
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
				`${r.person.name} declined ${eveningLabel(e)}.`,
				r.person.id,
				"hall",
				[job.event],
			);
		}
	} else if (job.offer.id.startsWith("prepare:")) {
		e.stage = "prepared";
		host.event(
			"evening-prepared",
			`${r.person.name} prepared the hall for ${eveningLabel(e)} on ${clock(e.startsAt)}. The other activity cannot use the same room at that time.`,
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
			`${r.person.name} ${e.kind === "class" ? "received Lea’s practical timber lesson" : "ate supper with Sam"} after ${reply?.attendedMinutes} awake minutes together.`,
			r.person.id,
			"hall",
			e.notice ? [e.notice.id, job.event] : [job.event],
		);
	}
	if (attendance && !delivered)
		host.event(
			"evening-missed",
			`${r.person.name} reached the planned ${e.kind}, but did not spend fifteen awake minutes with the host during its scheduled hour.`,
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
			Object.keys(object).some((key) => !allowed.includes(key))
		)
			throw Error("Invalid evening fields");
	};
	fields(pilot, ["version", "openedAt", "lastCountAt", "events", "purposes"]);
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
	if (pilot.purposes !== undefined) {
		fields(pilot.purposes, ["sam", "lea"]);
		for (const [id, purpose] of Object.entries(pilot.purposes)) {
			fields(purpose, ["notice", "goalId"]);
			validateEvent(purpose.notice, s, ids);
			if (
				purpose.notice.kind !== "hall-purpose" ||
				purpose.notice.actorId !== id ||
				purpose.notice.at < pilot.openedAt ||
				(purpose.goalId !== undefined &&
					!s.people
						.find((r) => r.person.id === id)
						?.person.agenda.goals.some(
							(g) =>
								g.id === purpose.goalId && g.adoptedAt >= purpose.notice.at,
						))
			)
				throw Error("Invalid received hall purpose");
		}
	}
	for (const [index, e] of pilot.events.entries()) {
		fields(e, [
			"id",
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
		const expectedStart =
			(Math.floor(pilot.openedAt / 1440) + 1 + (index < 2 ? 0 : 3)) * 1440 +
			1080;
		if (
			e.id !== `evening-${Math.floor(index / 2)}-${kind}` ||
			e.kind !== kind ||
			e.organiserId !== (kind === "class" ? "lea" : "sam") ||
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
				const c = s.people
					.find((r) => r.person.id === id)
					?.person.agenda.commitments.find((c) => c.id === reply.commitmentId);
				if (
					!c ||
					c.targetId !== e.organiserId ||
					c.toId !== e.organiserId ||
					c.from !== e.startsAt ||
					c.until !== e.endsAt ||
					c.actions.join() !== `attend-${e.kind}`
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
