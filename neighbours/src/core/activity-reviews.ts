import type { Affordance } from "@adam0white/human-framework";
import { buildOffers, usesActivitySlot } from "./offers.ts";
import type { Resident, Save } from "./state.ts";

/** Travel completes at its next physical location before optional re-planning. */
export function reviewDue(r: Resident, now: number): boolean {
	return (
		!!r.job &&
		r.job.arrive <= now &&
		r.job.end > now &&
		!!r.person.activity &&
		(r.person.activity.reviewAt <= now || !!r.person.activity.interrupt)
	);
}

/** Feasible alternatives after releasing this job, without changing the world. */
export function reviewOffers(s: Save, r: Resident): Affordance[] {
	const job = r.job;
	if (!job) return buildOffers(s, r.person.id);
	const destination = job.offer.placeId;
	const actor = {
		...r,
		job: undefined,
		place: s.now >= job.arrive ? (destination ?? r.place) : r.place,
		wealth: r.wealth + job.food,
	};
	const hypothetical: Save = {
		...s,
		tools: s.tools + job.tools,
		people: s.people.map((other) =>
			other.person.id === r.person.id ? actor : other,
		),
		places: s.places.map((place) => ({
			...place,
			reserved:
				place.reserved -
				(place.id === destination && usesActivitySlot(job.offer) ? 1 : 0),
			stock: place.stock + (place.id === "market" ? job.food : 0),
		})),
	};
	return [
		...buildOffers(hypothetical, r.person.id).filter(
			(offer) =>
				offer.id !== job.offer.id &&
				!(r.person.body.asleep && offer.mode === "sleep"),
		),
		{ ...job.offer, duration: job.end - s.now },
	];
}
