import type { NativeActor } from "./host-types.ts";
/**
 * Who can do what in the town, derived from host facts and HF state rather than person ids.
 *
 * Scope: the scenario seeds each resident's occupation (`Resident.role`, a host fact) and HF state (methods,
 * goals, commitments). Behaviour rules ask this module for the holder of a town position or for a capability:
 * the class teacher and supper cook who organise hall evenings, the handcart's owner, the workshop mechanic who
 * can restore it and the carpenter whose paid work uses the main bench. Answering a timber question needs both
 * the teaching occupation and a retained hall-inspection method. Renaming or reordering people therefore leaves
 * these rules unchanged.
 *
 * Not covered: positions are fixed occupations, not elections or hiring. When several residents hold one
 * occupation, the lowest id holds a single-holder position; the seeded town has exactly one of each. Knowledge is
 * read from retained HF method evidence and never inferred from labels, prose or outcomes.
 */

import type { Resident, Save } from "./state.ts";

/** Occupations that hold a town position (scenario host facts). */
export const POSITION_ROLES = {
	/** Teaches the school class and organises the hall class evenings. */
	teacher: "teacher",
	/** Runs the market kitchen and organises the hall suppers. */
	cook: "cook",
	/** Owns the quay handcart and carries supplies with it. */
	cartOwner: "ferry keeper",
	/** Restores vehicles in the workshop. */
	cartRepairer: "mechanic",
	/** Earns paid carpentry at the workshop's main bench. */
	benchHolder: "carpenter",
} as const;
export type Position = keyof typeof POSITION_ROLES;
export const INSPECTION_METHOD = "hall-section-inspection";

const byId = (a: Resident, b: Resident) =>
	a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
export function holds(r: Resident, position: Position): boolean {
	return (
		r.role === POSITION_ROLES[position] ||
		(
			{
				teacher: "repair designer",
				cook: "meal helper",
				cartOwner: "supply helper",
				cartRepairer: "repair learner",
				benchHolder: "repair designer",
			} as const
		)[position] === r.role
	);
}
export function holders(s: Pick<Save, "people">, position: Position) {
	return s.people.filter((r) => holds(r, position)).sort(byId);
}
export function holder(
	s: Pick<Save, "people">,
	position: Position,
): Resident | undefined {
	return holders(s, position)[0];
}
export function requireHolder(
	s: Pick<Save, "people">,
	position: Position,
): Resident {
	const r = holder(s, position);
	if (!r) throw Error(`Nobody holds the ${position} position`);
	return r;
}
export function nameOf(s: Pick<Save, "people">, id: string): string {
	return s.people.find((r) => r.id === id)?.name ?? id;
}
/** Retained HF method evidence, not a claim about present timber. */
export function retainsInspectionMethod(person: NativeActor): boolean {
	return (person.methods?.rules ?? []).some(
		(rule) => rule.id === INSPECTION_METHOD && rule.evidence.length > 0,
	);
}
/** Answers hall-inspection questions: teaches by occupation and retains the method. */
export function inspectionInstructor(r: Resident): boolean {
	return holds(r, "teacher") && retainsInspectionMethod(r.owner.actor(r.id));
}
export function inspectionInstructors(s: Pick<Save, "people">): Resident[] {
	return s.people.filter(inspectionInstructor).sort(byId);
}
/** Retains inspection evidence demonstrated by another resident (a lesson from a neighbour). */
export function taughtByNeighbour(s: Pick<Save, "people">, r: Resident) {
	const residents = new Set(s.people.map((o) => o.id));
	return (r.owner.actor(r.id).methods?.rules ?? []).some((rule) =>
		rule.evidence.some((e) => e.sourceId !== r.id && residents.has(e.sourceId)),
	);
}
