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
		speaker.id === listener.id ||
		!job ||
		!otherJob ||
		!place ||
		!["talk", "gather"].includes(job.offer.action) ||
		!["talk", "gather"].includes(otherJob.offer.action) ||
		!presentAt(speaker, place, s.now) ||
		!presentAt(listener, place, s.now) ||
		speaker.owner.actor(speaker.id).body.downed ||
		listener.owner.actor(listener.id).body.downed ||
		overlapMinutes(job, listener, s.now) < 15
	)
		return;
	const evenings = allEvenings(s);
	// Keep contact deduplication with durable invitation receipts, not the pruned feed.
	if (
		evenings.some((e) => {
			const reply = e.replies[listener.id];
			return (
				reply?.sourceId === speaker.id &&
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
			e.replies[speaker.id] &&
			!e.replies[listener.id],
	);
	if (!evening?.notice) return;
	if (
		s.socialEvenings?.pendingNotices?.some(
			(pending) =>
				pending.eveningId === evening.id && pending.listenerId === listener.id,
		)
	)
		return;
	const id = host.event(
		"evening-retold",
		`${speaker.name} told ${listener.name} about ${eveningLabel(evening, s)}. ${evening.notice.text}`,
		speaker.id,
		place,
		[evening.notice.id, job.event],
	);
	const event = s.events.find((e) => e.id === id);
	if (!event) throw Error("Spoken invitation event missing");
	event.targetId = listener.id;
	const heard = receiveEvent(listener, event, "heard");
	if (!heard) {
		if (!s.socialEvenings) throw Error("Spoken invitation lacks evening state");
		s.socialEvenings.pendingNotices = [
			...(s.socialEvenings.pendingNotices ?? []),
			{
				eveningId: evening.id,
				listenerId: listener.id,
				event: structuredClone(event),
			},
		];
	}
	if (heard)
		evening.replies[listener.id] = {
			heardAt: s.now,
			attendedMinutes: 0,
			sourceId: speaker.id,
			heardEvent: structuredClone(event),
		};
}
