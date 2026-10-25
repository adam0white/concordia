import type { PersonView } from "../contracts";

const labels: Partial<Record<NonNullable<PersonView["lifeState"]>, string>> = {
	asleep: "Asleep",
	downed: "Unable to get up or act",
	dead: "Died",
	break: "Having a mental break",
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

/** Words for one HF need urgency (0 settled … 1 urgent). No meter or percentage. */
export function urgencyWord(urgency: number): string {
	return urgency >= 0.75
		? "urgent"
		: urgency >= 0.5
			? "pressing"
			: urgency >= 0.25
				? "noticed"
				: "settled";
}

const feelings: Record<string, string> = {
	food: "hungry",
	water: "thirsty",
	sleep: "sleepy",
	rest: "tired",
	relief: "uncomfortable",
	safety: "uneasy",
	belonging: "lonely",
	esteem: "unconfident",
	autonomy: "restricted",
	competence: "unsure of themselves",
	leisure: "restless",
	meaning: "unsure of their purpose",
};

/** A short worded impression from the two most pressing HF need urgencies. */
export function needWords(
	needs: Record<string, number>,
	name = "This person",
): string {
	const pressing = Object.entries(needs)
		.filter(([, urgency]) => urgency >= 0.5)
		.toSorted((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.slice(0, 2)
		.map(
			([id, urgency]) =>
				`${urgency >= 0.8 ? "very " : ""}${feelings[id] ?? id.replaceAll("_", " ")}`,
		);
	if (!pressing.length) return `${name} looks calm. No need seems urgent.`;
	const text = pressing.join(" and ");
	return `${name} looks ${text}.`;
}

/** Words for HF relationship trust (0..1). */
export function trustWords(trust: number, name = "This person"): string {
	return trust >= 0.75
		? `${name} trusts this person deeply`
		: trust >= 0.5
			? `${name} trusts this person`
			: trust >= 0.25
				? `${name} is cautious with this person`
				: `${name} does not trust this person much`;
}
