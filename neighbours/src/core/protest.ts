/**
 * SCOPE: host physics for work done under protest. HF marks an activity `protest` when a voice insisted and the
 * person gave in ("complied"), and leaves it to the host whether that work goes worse (HF types: hosts "may
 * reduce quality/speed"). Here, ordinary work (`BOTCHABLE`: the garden, quay supply, the paid shift and hall
 * repair) done under protest is botched with probability `PROTEST_BOTCH`, keyed by the job's start event (never by
 * person id), so replay is exact. A botched job has no world effect and is finished in HF as `failed`; HF's own
 * `finish` then moves trust in the insisting voice through its will paths (a bad outcome under protest loses
 * trust at `trustLossComplied`). Nothing here counts urges or charges the player directly. A botched paid shift
 * still counts as a shift served but earns nothing. Not covered: slower work, partial results, work that other
 * modules finish (handcart, evening chores, inspection), or protest in non-work activities (meals, rest, visits),
 * which simply happen.
 */
import { keyed } from "./hash.ts";
import type { Job, Resident, Save } from "./state.ts";

/** Engineering assumption (2026-10-18): resentful, rushed work goes wrong a bit less than half the time. */
export const PROTEST_BOTCH = 0.4;

/** Work whose world effect the runtime withholds when botched. Other work-tagged offers finish in their own modules. */
export const BOTCHABLE: ReadonlySet<string> = new Set([
	"grow",
	"supply",
	"work",
	"repair",
]);

export function botchedUnderProtest(s: Save, r: Resident, j: Job): boolean {
	const activity = r.owner.actor(r.id).activity;
	return (
		!!activity?.protest &&
		activity.offer.id === j.offer.id &&
		BOTCHABLE.has(j.offer.action) &&
		keyed(s.seed, j.event, "protest-botch") < PROTEST_BOTCH
	);
}
