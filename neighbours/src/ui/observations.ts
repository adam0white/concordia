import type { TownEvent, TownView } from "../contracts";
export interface ObservedFeed {
	seed: number;
	now: number;
	events: TownEvent[];
}
/** Retains only events actually delivered to this UI, never generated narration. */
export function observe(
	previous: ObservedFeed | undefined,
	town: TownView,
): ObservedFeed {
	const familiar = new Set(town.people.filter((p) => p.known).map((p) => p.id));
	const continuing = previous?.seed === town.seed && previous.now <= town.now;
	const events = new Map<number, TownEvent>(
		(continuing ? previous.events : []).map((e) => [e.id, e]),
	);
	for (const event of [
		...town.events,
		...town.people.filter((p) => p.known).flatMap((p) => p.history),
	]) {
		if (
			!event.actorId ||
			familiar.has(event.actorId) ||
			event.importance >= 0.8
		)
			events.set(event.id, event);
	}
	return {
		seed: town.seed,
		now: town.now,
		events: [...events.values()]
			.sort((a, b) => a.at - b.at || a.id - b.id)
			.slice(-160),
	};
}
export interface StoryGroup {
	id: string;
	title: string;
	kind: string;
	at?: number;
	actorIds: string[];
	participantIds: string[];
	summaries: string[];
	eventIds: number[];
	missingEventIds: number[];
}
export function groupStories(
	town: TownView,
	observed: ObservedFeed | undefined,
) {
	// Received observations have receipt times and recipients; they are not
	// canonical story actors or participation evidence.
	const events = new Map(
		[
			...town.events,
			...(observed?.events ?? []),
			...town.people.flatMap((person) => [
				...person.history,
				...(person.inspection ? [person.inspection.event] : []),
			]),
			...(town.handcart?.latest ? [town.handcart.latest] : []),
		].map((e) => [e.id, e]),
	);
	const groups = new Map<string, StoryGroup>();
	for (const story of town.stories) {
		const source = story.eventIds
			.map((id) => events.get(id))
			.findLast(
				(e) =>
					e?.kind === story.kind &&
					(story.at === undefined || e.at === story.at),
			);
		const provided = (story as typeof story & { groupId?: string }).groupId;
		const key =
			provided ??
			(story.kind === "lesson" && source
				? `lesson:${source.at}:${source.placeId}`
				: story.id);
		const group = groups.get(key) ?? {
			id: key,
			title: story.title,
			kind: story.kind,
			at: story.at ?? source?.at,
			actorIds: [],
			participantIds: [],
			summaries: [],
			eventIds: [],
			missingEventIds: [],
		};
		const at = story.at ?? source?.at;
		if (at !== undefined) group.at = Math.max(group.at ?? at, at);
		// Only direct actors/targets on matching story events count. Causal
		// ancestry can include earlier repairs and is not an attendance list.
		for (const id of [story.actorId, source?.actorId, source?.targetId])
			if (
				id &&
				town.people.some((person) => person.id === id) &&
				!group.actorIds.includes(id)
			)
				group.actorIds.push(id);
		if (!group.summaries.includes(story.summary))
			group.summaries.push(story.summary);
		group.eventIds = [...new Set([...group.eventIds, ...story.eventIds])];
		group.missingEventIds = [
			...new Set([...group.missingEventIds, ...(story.missingEventIds ?? [])]),
		];
		groups.set(key, group);
	}
	for (const group of groups.values()) {
		if (group.kind !== "evening-ended" || group.at === undefined) continue;
		const at = group.at;
		const matches = (town.evenings ?? []).filter(
			(evening) =>
				evening.stage === "closed" &&
				evening.endsAt <= at &&
				evening.result &&
				group.summaries.includes(evening.result),
		);
		// Only a unique actual result whose scheduled period has ended supplies
		// attendance. A repair's causal ancestors never supply participants.
		if (matches.length === 1)
			group.participantIds = [...new Set(matches[0]?.participantIds ?? [])];
	}

	return [...groups.values()].toSorted(
		(a, b) => (b.at ?? -Infinity) - (a.at ?? -Infinity),
	);
}
