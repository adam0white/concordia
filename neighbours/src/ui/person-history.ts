import type { PersonView, TownEvent, TownView } from "../contracts";
import type { ObservedFeed } from "./observations";

export interface HistoryEntry {
	key: string;
	at: number;
	kind: string;
	text: string;
	eventIds: number[];
}
const routineKinds = new Set(["started", "completed"]);

/** Fold routine action bookkeeping, never merge outcomes by wording or clock time. */
export function personHistory(
	person: Pick<PersonView, "id" | "history">,
	town: Pick<TownView, "events" | "stories">,
	observed: ObservedFeed | undefined,
) {
	const raw = [
		...new Map(
			[...town.events, ...person.history, ...(observed?.events ?? [])]
				.filter((event) => event.actorId === person.id)
				.map((event) => [event.id, event]),
		).values(),
	].sort((a, b) => b.at - a.at || b.id - a.id);
	const meaningful = new Map<string, HistoryEntry>();
	for (const event of raw) {
		if (routineKinds.has(event.kind)) continue;
		meaningful.set(`event-${event.id}`, {
			key: `event-${event.id}`,
			at: event.at,
			kind: event.kind,
			text: event.text,
			eventIds: [event.id],
		});
	}
	// A dated story retains an actual outcome after its detailed event is gone.
	// Its causal ancestors remain source IDs, never substitute outcome records.
	for (const story of town.stories) {
		if (story.actorId !== person.id || story.at === undefined) continue;
		const outcomeId = story.eventIds.at(-1);
		const key = outcomeId === undefined ? story.id : `event-${outcomeId}`;
		meaningful.set(key, {
			key,
			at: story.at,
			kind: story.kind,
			text: story.summary,
			eventIds: [...story.eventIds],
		});
	}
	return {
		meaningful: [...meaningful.values()].sort((a, b) => b.at - a.at),
		routine: raw.filter((event) => routineKinds.has(event.kind)),
		raw,
	};
}

export function eventDetail(event: TownEvent) {
	return `#${event.id} · ${event.kind}${event.causes.length ? ` · Caused by ${event.causes.map((id) => `#${id}`).join(", ")}` : ""}`;
}
