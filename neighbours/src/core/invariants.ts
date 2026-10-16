import type { Place, Save } from "./state.ts";
/** Fail at the first broken host invariant instead of propagating undefined state. */
export function required<T>(value: T | undefined | null, message: string): T {
	if (value === undefined || value === null) throw new Error(message);
	return value;
}
export function placeOf(state: Save, id: string | undefined): Place {
	return required(
		state.places.find((place) => place.id === id),
		`Missing town place: ${id}`,
	);
}
