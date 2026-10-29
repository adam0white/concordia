import type { PerceptData } from "@adam0white/human-framework";
import type { TownEvent } from "../contracts";
import { minutePercept } from "./hf4-owner.ts";
import { MINUTE, nativeMilliseconds } from "./hf4-run.ts";
import type { Job, Resident, Save } from "./state.ts";
import { timberMoisture } from "./timber.ts";
/** Exact host facts at one physical action boundary. Native state is always
 * read from the sole Run owner, never copied into this witness record. */
export type PhysicalWitness = Pick<
	Resident,
	"id" | "name" | "place" | "job" | "idleSince" | "owner"
>;

/** Physical presence includes sleepers but excludes people still travelling. */
export function locatedAt(
	resident: Pick<PhysicalWitness, "job" | "place">,
	placeId: string,
	now: number,
): boolean {
	return resident.job
		? resident.job.offer.placeId === placeId &&
				nativeMilliseconds(resident.job.arrive) <= nativeMilliseconds(now) &&
				nativeMilliseconds(resident.job.end) >= nativeMilliseconds(now)
		: resident.place === placeId;
}
export function presentAt(
	resident: Pick<PhysicalWitness, "id" | "owner" | "job" | "place">,
	placeId: string,
	now: number,
): boolean {
	return (
		resident.owner.actor(resident.id).body.alive &&
		!resident.owner.actor(resident.id).body.asleep &&
		!resident.owner.actor(resident.id).body.downed &&
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
	channel: PerceptData["channel"] = "saw",
	summary = event.text,
): boolean {
	const attended = resident.owner.observe(
		resident.id,
		minutePercept(`town:${event.id}:${resident.id}`, event.at, {
			channel,
			kind: event.kind,
			...(event.actorId ? { actorId: event.actorId } : {}),
			targetId: resident.id,
			...(event.placeId ? { placeId: event.placeId } : {}),
			salience: 0.85,
			advice:
				event.kind === "question"
					? [
							{
								adviceId: `question:${event.id}`,
								action: "answer-inspection",
								strength: 0.8,
							},
						]
					: [],
			valence: event.kind === "lesson" ? 0.3 : 0,
			summary,
		}),
	);
	if (!attended) return false;
	const received = {
		...event,
		at: event.at,
		text: summary,
		targetId: resident.id,
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
export function overlapMinutes(
	job: Job,
	other: PhysicalWitness,
	now: number,
): number {
	const first = other.owner.actor(job.personId);
	if (
		!first.body.alive ||
		first.body.asleep ||
		first.body.downed ||
		job.offer.mode === "sleep"
	)
		return 0;
	const awakeFrom = Math.max(
		first.body.since,
		other.owner.actor(other.id).body.since,
	);
	if (
		!other.owner.actor(other.id).body.alive ||
		other.owner.actor(other.id).body.asleep ||
		other.owner.actor(other.id).body.downed
	)
		return 0;
	const dest = job.offer.placeId;
	if (!dest) return 0;
	if (other.job) {
		if (other.job.offer.placeId !== dest || other.job.offer.mode === "sleep")
			return 0;
		return Math.max(
			0,
			(Math.min(
				nativeMilliseconds(job.end),
				nativeMilliseconds(other.job.end),
				nativeMilliseconds(now),
			) -
				Math.max(
					nativeMilliseconds(job.arrive),
					nativeMilliseconds(other.job.arrive),
					awakeFrom,
				)) /
				MINUTE,
		);
	}
	if (other.place !== dest) return 0;
	return Math.max(
		0,
		(Math.min(nativeMilliseconds(job.end), nativeMilliseconds(now)) -
			Math.max(
				nativeMilliseconds(job.arrive),
				nativeMilliseconds(other.idleSince ?? 480),
				awakeFrom,
			)) /
			MINUTE,
	);
}
