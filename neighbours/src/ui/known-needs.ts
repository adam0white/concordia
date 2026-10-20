import type { TownView } from "../contracts";

/** The shared physical hall state introduced when entering the town.
 * An absent cue says nothing about a person's private needs or willingness.
 * Do not derive knowledge from HF urgency, decisions, or residents' observations.
 */
export function knownOpenNeeds(town: TownView): {
	people: Record<string, string>;
	places: Record<string, string>;
} {
	const people: Record<string, string> = {};
	const places: Record<string, string> = {};
	const hall = town.places.find((place) => place.id === "hall");
	const repairs = town.stats.hallRepairs;
	if (
		hall &&
		!hall.open &&
		typeof repairs === "number" &&
		Number.isFinite(repairs)
	) {
		places.hall =
			repairs < 12
				? "The hall needs repairs."
				: "The hall needs an inspection before it can open.";
	}
	return { people, places };
}
