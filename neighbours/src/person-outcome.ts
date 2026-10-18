import type { TownView } from "./contracts.ts";

export type PersonOutcome = {
	name: string;
	label: string;
} & (
	| {
			kind: "commitment";
			status: "kept" | "broken" | "released";
			deadline: number;
	  }
	| {
			kind: "invitation";
			status: "attended" | "missed" | "declined";
			eventId: string;
			startsAt: number;
	  }
);

function additions<T>(
	before: readonly T[],
	after: readonly T[],
	key: (value: T) => string,
): T[] {
	const counts = new Map<string, number>();
	for (const entry of before)
		counts.set(key(entry), (counts.get(key(entry)) ?? 0) + 1);
	return after.filter((entry) => {
		const id = key(entry),
			remaining = counts.get(id) ?? 0;
		if (remaining === 0) return true;
		counts.set(id, remaining - 1);
		return false;
	});
}

/** Compare only the followed person's actual public statuses. Deadlines alone imply no outcome. */
export function personOutcome(
	start: Pick<TownView, "people">,
	current: Pick<TownView, "people">,
	actorId: string,
): PersonOutcome | undefined {
	const before = start.people.find((p) => p.id === actorId),
		after = current.people.find((p) => p.id === actorId);
	if (!before || !after) return undefined;
	const promise = additions(before.commitments, after.commitments, (p) =>
		JSON.stringify([p.label, p.at, p.status]),
	).find(
		(p) =>
			p.status === "kept" || p.status === "broken" || p.status === "released",
	);
	if (
		promise &&
		(promise.status === "kept" ||
			promise.status === "broken" ||
			promise.status === "released")
	)
		return {
			kind: "commitment",
			name: after.name,
			label: promise.label,
			status: promise.status,
			deadline: promise.at,
		};
	const invitation = additions(
		before.invitations ?? [],
		after.invitations ?? [],
		(i) => JSON.stringify([i.eventId, i.status]),
	).find(
		(i) =>
			i.status === "attended" ||
			i.status === "missed" ||
			i.status === "declined",
	);
	if (
		invitation &&
		(invitation.status === "attended" ||
			invitation.status === "missed" ||
			invitation.status === "declined")
	)
		return {
			kind: "invitation",
			name: after.name,
			label: invitation.title,
			status: invitation.status,
			eventId: invitation.eventId,
			startsAt: invitation.startsAt,
		};
	return undefined;
}

/** Describe the observed status without supplying a motive, cause or judgment. */
export function personOutcomeNotice(
	outcome: PersonOutcome | undefined,
): string | undefined {
	if (!outcome) return undefined;
	if (outcome.kind === "commitment") {
		if (outcome.status === "kept")
			return `${outcome.name} kept a promise: ${outcome.label}.`;
		return `${outcome.name}’s promise ${outcome.status === "broken" ? "was not kept" : "was released"}: ${outcome.label}.`;
	}
	return `${outcome.name} ${outcome.status === "missed" ? "did not attend" : outcome.status} ${outcome.label}.`;
}
