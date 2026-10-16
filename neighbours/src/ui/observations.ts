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
export function groupStories(
	town: TownView,
	observed: ObservedFeed | undefined,
) {
	const events = new Map(
		[...town.events, ...(observed?.events ?? [])].map((e) => [e.id, e]),
	);
	const groups = new Map<
		string,
		{
			id: string;
			title: string;
			kind: string;
			summaries: string[];
			eventIds: number[];
			missingEventIds: number[];
		}
	>();
	for (const story of town.stories) {
		const source = story.eventIds
			.map((id) => events.get(id))
			.findLast((e) => e?.kind === story.kind);
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
			summaries: [],
			eventIds: [],
			missingEventIds: [],
		};
		if (!group.summaries.includes(story.summary))
			group.summaries.push(story.summary);
		group.eventIds = [...new Set([...group.eventIds, ...story.eventIds])];
		group.missingEventIds = [
			...new Set([...group.missingEventIds, ...(story.missingEventIds ?? [])]),
		];
		groups.set(key, group);
	}
	return [...groups.values()];
}
