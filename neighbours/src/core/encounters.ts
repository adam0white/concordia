import type { Percept } from "@adam0white/human-framework";
import { perceive } from "@adam0white/human-framework";
import type { TownEvent } from "../contracts";
import type { Job, Resident, Save } from "./state.ts";
import { timberMoisture } from "./timber.ts";

/** Physical presence includes sleepers but excludes people still travelling. */
export function locatedAt(
	resident: Resident,
	placeId: string,
	now: number,
): boolean {
	return resident.job
		? resident.job.offer.placeId === placeId &&
				resident.job.arrive <= now &&
				resident.job.end >= now
		: resident.place === placeId;
}
export function presentAt(
	resident: Resident,
	placeId: string,
	now: number,
): boolean {
	return (
		resident.person.body.alive &&
		!resident.person.body.asleep &&
		locatedAt(resident, placeId, now) &&
		resident.job?.offer.mode !== "sleep"
	);
}
export function inspectionKey(state: Save): string {
	const key = `${Math.floor(state.now / 1440)}:${state.hall}`;
	// Timber can dry within a day (timber.ts), so a changed reading is worth another look; legacy keys stay as they were.
	return state.timber ? `${key}:${timberMoisture(state, "")}` : key;
}
/** Only facts actually attended through HF become received-observation cards. */
export function receiveEvent(
	resident: Resident,
	event: TownEvent,
	channel: Percept["channel"] = "saw",
	summary = event.text,
): boolean {
	const attended = perceive(resident.person, [
		{
			at: resident.person.now,
			channel,
			kind: event.kind,
			actorId: event.actorId,
			targetId: resident.person.id,
			placeId: event.placeId,
			salience: 0.85,
			...(event.kind === "question"
				? { advice: [{ action: "answer-inspection", strength: 0.8 }] }
				: {}),
			valence: event.kind === "lesson" ? 0.3 : 0,
			summary,
		},
	]);
	if (!attended.length) return false;
	const received = {
		...event,
		at: resident.person.now,
		text: summary,
		targetId: resident.person.id,
	};
	if (!resident.received?.some((e) => e.id === event.id))
		resident.received = [...(resident.received ?? []), received].slice(-12);
	return true;
}
export function receivedRequest(
	teacher: Resident,
	requester: Resident,
): boolean {
	return (
		!!requester.question &&
		!!teacher.received?.some((e) => e.id === requester.question?.event)
	);
}
export function waitingAtHall(resident: Resident, now: number): boolean {
	return (
		resident.question?.status === "waiting" && presentAt(resident, "hall", now)
	);
}

/** Minutes both people were awake at the destination during this interaction. */
export function overlapMinutes(job: Job, other: Resident, now: number): number {
	if (
		!other.person.body.alive ||
		other.person.body.asleep ||
		other.person.body.downed
	)
		return 0;
	const dest = job.offer.placeId;
	if (!dest) return 0;
	if (other.job) {
		if (other.job.offer.placeId !== dest || other.job.offer.mode === "sleep")
			return 0;
		return Math.max(
			0,
			Math.min(job.end, other.job.end, now) -
				Math.max(job.arrive, other.job.arrive),
		);
	}
	if (other.place !== dest) return 0;
	return Math.max(
		0,
		Math.min(job.end, now) - Math.max(job.arrive, other.idleSince ?? 480),
	);
}
