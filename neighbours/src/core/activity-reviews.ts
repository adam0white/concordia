import type { Affordance } from "./host-types.ts";

import { buildOffers, usesActivitySlot } from "./offers.ts";
import type { Resident, Save } from "./state.ts";

/** Travel completes at its next physical location before optional re-planning. */
export function reviewDue(r: Resident, now: number): boolean {
	const activity = r.owner.actor(r.id).activity;
	return (
		!!r.job &&
		r.job.arrive <= now &&
		r.job.end > now &&
		!!activity &&
		(activity.reviewAt <= now * 60000 || !!activity.interrupt)
	);
}

/** Feasible alternatives after releasing this job, without changing the world. */
export function reviewOffers(s: Save, r: Resident): Affordance[] {
	const job = r.job;
	if (!job) return buildOffers(s, r.id);
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
		people: s.people.map((other) => (other.id === r.id ? actor : other)),
		places: s.places.map((place) => ({
			...place,
			reserved:
				place.reserved -
				(place.id === destination && usesActivitySlot(job.offer) ? 1 : 0),
			stock: place.stock + (place.id === "market" ? job.food : 0),
		})),
	};
	return [
		...buildOffers(hypothetical, r.id).filter(
			(offer) =>
				offer.id !== job.offer.id &&
				!(r.owner.actor(r.id).body.asleep && offer.mode === "sleep"),
		),
		{ ...job.offer, duration: job.end - s.now },
	];
}
