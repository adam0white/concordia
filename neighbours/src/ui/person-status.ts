import type { PersonView } from "../contracts";

const labels: Partial<Record<NonNullable<PersonView["lifeState"]>, string>> = {
	asleep: "Asleep",
	downed: "Downed · unable to act",
	dead: "Died",
	break: "In a mental break",
};
/** Current HF state outranks a job label or a historical lifecycle event. */
export function activityLabel(
	person: Pick<PersonView, "lifeState" | "activity">,
): string {
	return (person.lifeState && labels[person.lifeState]) || person.activity;
}
export function canAct(person: Pick<PersonView, "lifeState">): boolean {
	return !person.lifeState || person.lifeState === "awake";
}
export function lifeMarker(person: Pick<PersonView, "lifeState">): string {
	return person.lifeState === "dead"
		? "×"
		: person.lifeState === "asleep"
			? "z"
			: person.lifeState === "downed" || person.lifeState === "break"
				? "!"
				: "";
}
