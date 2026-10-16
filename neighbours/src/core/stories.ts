import type { TownEvent, TownView } from "../contracts.ts";
import type { Save } from "./state.ts";
export function townStories(s: Save): TownView["stories"] {
	const latestInspections = s.people
		.filter((r) => r.known && r.inspection?.event)
		.map((r) => r.inspection?.event)
		.filter((event): event is TownEvent => !!event);
	const events = new Map(
		s.events
			.filter((e) =>
				[
					"hall-open",
					"hall-repaired",
					"lesson",
					"shared-meal",
					"hall-explanation",
					"missed-encounter",
				].includes(e.kind),
			)
			.slice(-6)
			.map((e) => [e.id, e]),
	);
	for (const event of latestInspections) events.set(event.id, event);
	const visible = new Set(s.events.slice(-100).map((e) => e.id));
	return [...events.values()]
		.sort((a, b) => b.at - a.at || b.id - a.id)
		.map((e) => {
			const inspection = s.people.find(
				(r) => r.inspection?.event?.id === e.id,
			)?.inspection;
			const methodValue =
				inspection?.methodTerms?.reduce((sum, t) => sum + t.value, 0) ?? 0;
			const explanation =
				inspection?.source === "HF 2.2.1"
					? methodValue > 0
						? " A learned method supported this choice."
						: methodValue < 0
							? " The chosen option included evidence against it."
							: " No matching learned-method term was recorded for this choice."
					: `${inspection ? ` Decision source: ${inspection.source}.` : ""}`;
			return {
				id: `story-${e.id}`,
				at: e.at,
				groupId:
					e.kind === "lesson"
						? `lesson:${e.at}:${e.placeId}`
						: `${e.kind}:${e.id}`,
				title:
					e.kind === "hall-open"
						? "The hall opened after inspection"
						: e.kind === "hall-closed"
							? "The hall stayed closed after inspection"
							: e.kind === "inspection-failed"
								? "An opening attempt found unsafe timber"
								: e.kind === "hall-repaired"
									? "Repairs finished; inspection remains"
									: e.kind === "hall-explanation"
										? "A question became a shared method"
										: e.kind === "missed-encounter"
											? "The explanation missed its listener"
											: e.kind === "lesson"
												? "The displaced class passed on a method"
												: "A shared meal returned",
				summary: e.text + explanation,
				eventIds: [...e.causes, e.id],
				missingEventIds: [...e.causes, e.id].filter((id) => !visible.has(id)),
				kind: e.kind,
			};
		});
}
