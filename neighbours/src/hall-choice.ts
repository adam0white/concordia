import type { TownView } from "./contracts.ts";

/** The same two current evenings shown in Help, including initial legal invitations. */
export function hallOpportunities(view: Pick<TownView, "now" | "evenings">) {
	return (view.evenings ?? [])
		.filter(
			(event) =>
				(event.recurring || event.canOpenSlot || event.canAdvertise) &&
				event.endsAt > view.now &&
				event.stage !== "closed",
		)
		.toSorted((a, b) => a.startsAt - b.startsAt)
		.slice(0, 2);
}
/** A dated opportunity is actionable only if its actual support budget can fund it. */
export function hasHallChoice(
	view: Pick<TownView, "now" | "controlsRemaining" | "evenings">,
): boolean {
	return hallOpportunities(view).some(
		(event) =>
			(event.canOpenSlot || event.canAdvertise) &&
			view.controlsRemaining + (event.supportRemaining ?? 0) > 0,
	);
}
