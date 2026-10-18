import type { TownView } from "./contracts.ts";
/** A dated opportunity is actionable only if its actual support budget can fund it. */
export function hasHallChoice(
	view: Pick<TownView, "controlsRemaining" | "evenings">,
): boolean {
	return (
		view.evenings?.some(
			(event) =>
				(event.canOpenSlot || event.canAdvertise) &&
				view.controlsRemaining + (event.supportRemaining ?? 0) > 0,
		) ?? false
	);
}
