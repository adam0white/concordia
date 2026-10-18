import { overlapMinutes, presentAt, receiveEvent } from "./encounters.ts";
import { allEvenings, type EveningHost, eveningLabel } from "./evenings.ts";
import type { Resident } from "./state.ts";

/** An attended conversation can carry one invitation, never an acceptance. */
export function shareEveningNotice(
	host: EveningHost,
	speaker: Resident,
	listener: Resident,
): void {
	const { s } = host;
	const job = speaker.job;
	const otherJob = listener.job;
	const place = job?.offer.placeId;
	if (
		speaker.person.id === listener.person.id ||
		!job ||
		!otherJob ||
		!place ||
		!["talk", "gather"].includes(job.offer.action) ||
		!["talk", "gather"].includes(otherJob.offer.action) ||
		!presentAt(speaker, place, s.now) ||
		!presentAt(listener, place, s.now) ||
		speaker.person.body.downed ||
		listener.person.body.downed ||
		overlapMinutes(job, listener, s.now) < 15
	)
		return;
	const evenings = allEvenings(s);
	// Keep contact deduplication with durable invitation receipts, not the pruned feed.
	if (
		evenings.some((e) => {
			const reply = e.replies[listener.person.id];
			return (
				reply?.sourceId === speaker.person.id &&
				reply.heardEvent?.causes.includes(job.event)
			);
		})
	)
		return;
	const evening = evenings.find(
		(e) =>
			e.notice &&
			["proposed", "preparing", "prepared"].includes(e.stage) &&
			e.startsAt > s.now &&
			e.replies[speaker.person.id] &&
			!e.replies[listener.person.id],
	);
	if (!evening?.notice) return;
	const id = host.event(
		"evening-retold",
		`${speaker.person.name} told ${listener.person.name} about ${eveningLabel(evening, s)}. ${evening.notice.text}`,
		speaker.person.id,
		place,
		[evening.notice.id, job.event],
	);
	const event = s.events.find((e) => e.id === id);
	if (!event) throw Error("Spoken invitation event missing");
	event.targetId = listener.person.id;
	if (receiveEvent(listener, event, "heard"))
		evening.replies[listener.person.id] = {
			heardAt: s.now,
			attendedMinutes: 0,
			sourceId: speaker.person.id,
			heardEvent: structuredClone(event),
		};
}
