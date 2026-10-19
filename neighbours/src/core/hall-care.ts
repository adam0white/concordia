/**
 * Hall care (Phase D, nbh-01z.37): wet timber can work a repaired section loose, and a resident who sees the loose
 * section can take it on as their own aim.
 *
 * Why: the seeded town did its twelve repairs on days 1 and 2 and then never repaired again. A reproduction
 * (`scripts/probe-repair-return.ts`) injected six sections of fresh damage on day 3. Repair was a legal offer in
 * 6,915 of 7,063 HF decisions that day and was chosen 0 times. The offer advertised only competence and belonging,
 * and other work had already met those needs. The town gave no one a reason to care that the hall was broken.
 *
 * Scope: host physics and perception only, gated by `Save.timber.care` (new towns). Once a day at 06:00, while the
 * hall is shut and its timber is damp (at least `LOOSEN_FROM`), one repaired section works loose with probability
 * `LOOSEN_CHANCE × damp`. The draw is keyed by seed and day, never by person. An awake resident at the hall who
 * sees loose supports after a loosening may adopt one bounded HF goal: make the hall sound again. The goal serves
 * meaning and belonging, its importance comes from the person's own benevolence, it has a two-day deadline, and one
 * finished repair achieves it. HF still decides whether anyone repairs; no offer value changes and nothing is forced.
 * Goals still open when the twelfth repair is done are abandoned, because the aim is met. Saves without `care`
 * (Phase C and older) never loosen and never adopt the goal, so their continuation is exact.
 *
 * Not covered: which section came loose, rot, residents hearing about a loose section without seeing it, or
 * whether real people return to shared work. The rates are engineering assumptions, not timber measurements.
 */
import { abandonGoal, adoptGoal } from "@adam0white/human-framework";
import { presentAt } from "./encounters.ts";
import { keyed } from "./hash.ts";
import type { Resident, Save } from "./state.ts";

/** Loosening is possible only on timber at least this damp. */
export const LOOSEN_FROM = 0.6;
/** Daily chance of one section working loose, multiplied by the damp. */
export const LOOSEN_CHANCE = 0.6;
export const HALL_GOAL_LABEL = "Make the hall sound again";
const GOAL_DAYS = 2;

export const hallCare = (s: Pick<Save, "timber">): boolean =>
	s.timber?.care !== undefined;

/** At 06:00: maybe work one repaired section loose. Returns true when it happened. */
export function loosenHall(s: Save): boolean {
	const care = s.timber?.care;
	if (!s.timber || !care || s.hallSafe || s.hall < 1) return false;
	if (s.now % 1440 !== 360 || s.timber.damp < LOOSEN_FROM) return false;
	const day = Math.floor(s.now / 1440);
	if (keyed(s.seed, day, "hall-loosen") >= LOOSEN_CHANCE * s.timber.damp)
		return false;
	s.hall -= 1;
	care.loosened += 1;
	return true;
}

/** A resident at the hall sees loose supports after a loosening and may take the repair on as their aim. */
export function noticeLooseHall(s: Save, r: Resident): boolean {
	const care = s.timber?.care;
	if (!care || care.loosened === 0 || s.hall >= 12) return false;
	if (!r.person.body.alive || r.person.body.asleep) return false;
	if (!presentAt(r, "hall", s.now)) return false;
	const goals = r.person.agenda.goals;
	if (goals.some((g) => g.label === HALL_GOAL_LABEL && g.status === "active"))
		return false;
	const benevolence = r.person.values.benevolence ?? 0.5;
	adoptGoal(
		r.person,
		{
			label: HALL_GOAL_LABEL,
			serves: ["meaning", "belonging"],
			importance: Math.round((0.3 + 0.4 * benevolence) * 1000) / 1000,
			deadline: s.now + GOAL_DAYS * 1440,
			advancedBy: [{ action: "repair", amount: 1 }],
		},
		s.now,
	);
	return true;
}

/** The twelfth repair meets every open hall goal; they are abandoned so nobody carries a finished aim. */
export function settleHallGoals(s: Save): void {
	if (!hallCare(s) || s.hall < 12) return;
	for (const r of s.people)
		for (const g of r.person.agenda.goals)
			if (g.label === HALL_GOAL_LABEL && g.status === "active")
				abandonGoal(r.person, g.id);
}

export function validateHallCare(care: unknown): void {
	if (
		!care ||
		typeof care !== "object" ||
		Array.isArray(care) ||
		Object.keys(care).join() !== "loosened" ||
		!Number.isSafeInteger((care as { loosened: unknown }).loosened) ||
		((care as { loosened: number }).loosened as number) < 0
	)
		throw Error("Invalid hall care");
}
