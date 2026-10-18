import { hallInspectionOffers } from "../experiments/inspection.ts";
import { assistanceOffers } from "./assistance.ts";
import {
	inspectionKey,
	presentAt,
	receivedRequest,
	waitingAtHall,
} from "./encounters.ts";
import { allEvenings, eveningOffers } from "./evenings.ts";
import {
	blocksMainBench,
	HANDCART_MINUTES,
	handcartOffers,
} from "./handcart.ts";
import { placeOf, required } from "./invariants.ts";
export const WORK_MINUTES: Record<string, number> = {
	...HANDCART_MINUTES,
	rest: 45,
	sleep: 120,
	drink: 15,
	eat: 30,
	grow: 60,
	supply: 60,
	talk: 30,
	learn: 60,
	teach: 120,
	care: 60,
	work: 60,
	repair: 90,
	gather: 45,
	inspect: 15,
	"open-section": 15,
	"keep-closed": 15,
	"ask-inspector": 120,
	"wait-inspector": 30,
	"answer-inspection": 30,
	"propose-class": 15,
	"propose-meal": 15,
	"accept-evening": 15,
	"decline-evening": 15,
	"prepare-class": 30,
	"prepare-meal": 30,
	"host-class": 120,
	"host-meal": 120,
	"attend-class": 45,
	"attend-meal": 45,
};

import { type Affordance, inBreak } from "@adam0white/human-framework";
import type { Save } from "./state.ts";
export const WORKPLACE: Record<string, [string, string]> = {
	carpenter: ["workshop", "Work a paid carpentry shift"],
	mechanic: ["workshop", "Work a paid workshop shift"],
	gardener: ["garden", "Work a paid garden shift"],
	nurse: ["clinic", "Work a paid clinic shift"],
	cook: ["market", "Work a paid kitchen shift"],
	"ferry keeper": ["quay", "Work a paid quay shift"],
	teacher: ["school", "Work a paid school shift"],
	organiser: ["hall", "Work a paid coordination shift by the hall"],
	"shop assistant": ["market", "Work a paid market shift"],
	parent: ["quay", "Work a paid delivery shift"],
	"retired neighbour": ["garden", "Help with a paid garden shift"],
	student: ["school", "Work a paid school shift"],
};

export function usesActivitySlot(offer: Affordance): boolean {
	return !offer.tags?.includes("floor") && !offer.tags?.includes("noticeboard");
}
export function workMinutesFor(offer: Affordance): number {
	return required(
		offer.id === "post-structural-question" ? 15 : WORK_MINUTES[offer.action],
		"Unknown action duration",
	);
}
export function buildOffers(s: Save, id: string, historical?: Affordance) {
	const r = s.people.find((p) => p.person.id === id);
	if (!r) throw Error("Unknown resident");
	if ((r.job || !r.person.body.alive) && !historical) return [];
	const available = s.places.filter(
		(p) => historical || p.reserved < p.capacity,
	);
	const list: Affordance[] = [];
	const add = (
		action: string,
		label: string,
		dest: string,
		duration: number,
		advertises: Affordance["advertises"],
		extra: Partial<Affordance> = {},
	) => {
		const p = (extra.tags?.includes("floor") ? s.places : available).find(
			(p) => p.id === dest,
		);
		if (!p) return;
		const from = placeOf(s, r.place);
		const travel =
			r.place === dest
				? 0
				: Math.ceil(
						Math.hypot(p.x - from.x, p.y - from.y) / (s.bus ? 35 : 20),
					) * 15;
		list.push({
			id: action,
			action,
			label,
			placeId: dest,
			duration: duration + travel,
			effort: 0.15,
			advertises,
			fulfills: r.person.agenda.commitments
				.filter((c) => c.status === "pending" && c.actions.includes(action))
				.map((c) => c.id),
			...extra,
		});
	};
	if (
		r.person.body.downed ||
		inBreak(r.person) ||
		historical?.id === "rest-here"
	) {
		add(
			"rest",
			"Rest on the floor here",
			r.place,
			45,
			{ leisure: 0.3 },
			{ id: "rest-here", effort: 0, tags: ["floor", "rest"] },
		);
		add(
			"sleep",
			"Sleep on the floor here",
			r.place,
			120,
			{ sleep: 0.6 },
			{ id: "sleep-here", mode: "sleep", effort: 0, tags: ["floor", "rest"] },
		);
		if (!historical && r.person.body.downed) return list;
	}
	if (
		(r.person.body.asleep && !r.person.body.downed && !inBreak(r.person)) ||
		(historical?.id === "sleep-here" &&
			!list.some((a) => a.id === "sleep-here"))
	)
		add(
			"sleep",
			"Sleep on the floor here",
			r.place,
			120,
			{ sleep: 0.6 },
			{ id: "sleep-here", mode: "sleep", effort: 0, tags: ["floor", "rest"] },
		);
	add("rest", "Rest at home", "homes", 45, { leisure: 0.3 }, { effort: 0 });
	if (r.place === "homes")
		add(
			"sleep",
			"Sleep at home",
			"homes",
			120,
			{ sleep: 0.6 },
			{ mode: "sleep", effort: 0 },
		);
	add(
		"drink",
		"Drink water at home",
		"homes",
		15,
		{ water: 0.7 },
		{ effort: 0 },
	);
	if (historical || (placeOf(s, "market").stock > 0 && r.wealth >= 1))
		add(
			"eat",
			"Eat a meal at the market",
			"market",
			30,
			{ food: 0.65 },
			{ material: -1 },
		);
	add(
		"grow",
		"Tend and harvest the garden",
		"garden",
		60,
		{ competence: 0.35 },
		{ tags: ["work"] },
	);
	add(
		"supply",
		"Carry food from the quay",
		"quay",
		60,
		{ competence: 0.25 },
		{ tags: ["work"] },
	);
	add(
		"talk",
		"Visit neighbours at the hall",
		"hall",
		30,
		{ belonging: 0.45 },
		{ tags: ["visit-attempt"] },
	);
	add(
		r.person.id === "lea" ? "teach" : "learn",
		r.person.id === "lea"
			? "Teach the displaced evening class"
			: "Attend a practical class at school",
		"school",
		r.person.id === "lea" ? 120 : 60,
		{
			competence: 0.3,
			belonging: 0.2,
		},
	);
	add("care", "Help neighbours at the clinic", "clinic", 60, {
		belonging: 0.3,
		competence: 0.25,
	});
	const [workplaceId, workLabel] = required(
		WORKPLACE[r.role],
		"Unknown workplace role",
	);
	const day = Math.floor(s.now / 1440),
		minuteOfDay = s.now - day * 1440;
	const starts = r.paidWork?.day === day ? r.paidWork.starts : 0;
	if (historical || (minuteOfDay >= 480 && minuteOfDay < 1080 && starts < 2)) {
		add(
			"work",
			workLabel,
			workplaceId,
			60,
			{ competence: 0.3 },
			{ material: 2, tags: ["work"] },
		);
		const work = list.find((a) => a.id === "work");
		if (!historical && work && s.now + work.duration > day * 1440 + 1080)
			list.splice(list.indexOf(work), 1);
	}

	if (
		(historical || s.tools > 0) &&
		(historical ||
			s.hall + s.people.filter((p) => p.job?.offer.action === "repair").length <
				12)
	)
		add(
			"repair",
			"Repair the flood-damaged hall",
			"hall",
			90,
			{ competence: 0.5, belonging: 0.25 },
			{ tags: ["work"], skill: { id: "repair", difficulty: 0.4 } },
		);
	if (
		historical ||
		(s.hallSafe && placeOf(s, "market").stock > 0 && r.wealth >= 1)
	)
		add(
			"gather",
			"Share a meal in the reopened hall",
			"hall",
			45,
			{ food: 0.65, belonging: 0.65, meaning: 0.3 },
			{ material: -1, tags: ["meal"] },
		);
	if (
		(historical || r.known || s.hall >= 12) &&
		(historical || !s.hallSafe) &&
		(historical || r.inspection?.key !== inspectionKey(s)) &&
		r.place !== "hall"
	)
		add("inspect", "Go and inspect the hall timber", "hall", 15, {
			competence: 0.45,
			meaning: 0.3,
		});
	if (
		r.place === "hall" &&
		(historical || r.known || s.hall >= 12) &&
		(historical || !s.hallSafe) &&
		(historical || r.inspection?.key !== inspectionKey(s)) &&
		available.some((p) => p.id === "hall")
	) {
		for (const a of hallInspectionOffers("hall-inspection", "hall-floor"))
			if (
				historical ||
				a.action !== "ask-inspector" ||
				r.question?.status !== "waiting"
			)
				list.push({
					...a,
					placeId: "hall",
					...(a.action === "ask-inspector"
						? {
								duration:
									r.person.id === "lea" &&
									(historical
										? historical.id === "post-structural-question"
										: s.hall < 12)
										? 15
										: 120,
								...(r.person.id === "lea" &&
								(historical
									? historical.id === "post-structural-question"
									: s.hall < 12)
									? {
											id: "post-structural-question",
											label: "Leave a note requesting a structural opinion",
										}
									: {}),
								label:
									r.person.id === "lea" &&
									(historical
										? historical.id === "post-structural-question"
										: s.hall < 12)
										? "Leave a note requesting a structural opinion"
										: "Leave a question for an inspector and wait up to two hours",
							}
						: {}),
				});
	}
	if (
		(historical && r.place === "hall" && r.person.id !== "lea") ||
		(r.person.id !== "lea" &&
			r.question?.status === "waiting" &&
			presentAt(r, "hall", s.now))
	)
		add(
			"wait-inspector",
			"Wait for Lea beside the hall noticeboard",
			"hall",
			30,
			{ leisure: 0.1 },
		);
	if (r.person.id === "lea")
		for (const requester of s.people.filter(
			(o) =>
				o.person.id !== r.person.id &&
				(historical
					? o.person.id === historical.targetId
					: receivedRequest(r, o) && waitingAtHall(o, s.now)),
		)) {
			add(
				"answer-inspection",
				`Go over the timber checks with ${requester.person.name}`,
				"hall",
				30,
				{ meaning: 0.45, belonging: 0.3, competence: 0.2 },
				{
					id: `answer-inspection:${requester.person.id}`,
					targetId: requester.person.id,
					tags: ["teaching"],
				},
			);
		}
	const ordinary = historical
		? list
		: list.filter((offer) => {
				if (offer.placeId !== "hall" || offer.tags?.includes("floor"))
					return true;
				const arrive = s.now + offer.duration - workMinutesFor(offer);
				return !allEvenings(s).some(
					(e) =>
						["preparing", "prepared"].includes(e.stage) &&
						arrive < e.endsAt &&
						s.now + offer.duration > e.startsAt,
				);
			});
	return [
		...ordinary.filter((offer) => historical || !blocksMainBench(s, id, offer)),
		...eveningOffers(s, r, historical),
		...handcartOffers(s, r, historical),
		...assistanceOffers(s, r, historical),
	];
}

/** Expected company is decision context, never a claim that contact occurred. */
export function socialPreview(
	s: Save,
	id: string,
	offer: Affordance,
): Affordance {
	if (offer.action !== "talk" && offer.action !== "gather") return offer;
	const r = s.people.find((p) => p.person.id === id);
	if (!r) return offer;
	const arrival = s.now + offer.duration - workMinutesFor(offer);
	const end = s.now + offer.duration;
	const companions = s.people.filter(
		(o) =>
			o.person.id !== id &&
			o.job &&
			(o.job.offer.action === "talk" || o.job.offer.action === "gather") &&
			presentAt(o, offer.placeId ?? "", s.now) &&
			Math.min(end, o.job.end) - Math.max(arrival, o.job.arrive) >= 15,
	);
	return { ...offer, with: companions.map((o) => o.person.id).sort() };
}
