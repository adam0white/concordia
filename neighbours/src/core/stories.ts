import type { TownEvent, TownView } from "../contracts.ts";
import type { Save } from "./state.ts";
import { CHRONICLE_KINDS } from "./town-chronicle.ts";

function storyTitle(s: Save, e: TownEvent): string {
	const evening = s.socialEvenings?.events.find(
		(candidate) =>
			candidate.notice?.id === e.id || candidate.result?.id === e.id,
	);
	if (evening) {
		if (e.kind === "evening-proposed")
			return evening.kind === "class"
				? "Lea invited neighbours to a class"
				: "Sam invited neighbours to supper";
		const delivered = Object.entries(evening.replies).some(
			([id, reply]) => id !== evening.organiserId && reply.delivered,
		);
		return evening.kind === "class"
			? delivered
				? "Neighbours received Lea’s class"
				: "Lea’s class did not happen"
			: delivered
				? "Neighbours shared Sam’s supper"
				: "Sam’s supper did not happen";
	}
	const titles: Record<string, string> = {
		"hall-open": "The hall opened after inspection",
		"hall-closed": "The hall stayed closed after inspection",
		"inspection-failed": "An opening attempt found unsafe timber",
		"hall-repaired": "Repairs finished; inspection remains",
		"hall-explanation": "A question became a shared method",
		"missed-encounter": "The explanation missed its listener",
		lesson: "The displaced class passed on a method",
		"shared-meal": "A shared meal returned",
		"cart-returned": "Jo’s repaired handcart returned to the quay",
	};
	return titles[e.kind] ?? "A town event";
}
export function townStories(s: Save): TownView["stories"] {
	const latestInspections = s.people
		.filter((r) => r.known && r.inspection?.event)
		.map((r) => r.inspection?.event)
		.filter((event): event is TownEvent => !!event);
	const events = new Map<number, TownEvent>(
		[
			...(s.townChronicle?.events ?? []),
			...s.events.filter((e) => CHRONICLE_KINDS.has(e.kind)),
		].map((e) => [e.id, e]),
	);
	for (const evening of s.socialEvenings?.events ?? []) {
		const retained = evening.result ?? evening.notice;
		if (retained) events.set(retained.id, retained);
	}
	if (s.handcart?.handover)
		events.set(s.handcart.handover.id, s.handcart.handover);
	for (const event of latestInspections) events.set(event.id, event);
	const visible = new Set(s.events.slice(-100).map((e) => e.id));
	return [...events.values()]
		.sort((a, b) => b.at - a.at || b.id - a.id)
		.slice(0, 64)
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
				...(e.actorId ? { actorId: e.actorId } : {}),
				at: e.at,
				groupId:
					e.kind === "lesson"
						? `lesson:${e.at}:${e.placeId}`
						: `${e.kind}:${e.id}`,
				title: storyTitle(s, e),
				summary: e.text + explanation,
				eventIds: [...e.causes, e.id],
				missingEventIds: [...e.causes, e.id].filter((id) => !visible.has(id)),
				kind: e.kind,
			};
		});
}
