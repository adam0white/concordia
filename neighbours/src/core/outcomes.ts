import type { Affordance, Outcome } from "./host-types.ts";

export interface CompletionEvidence {
	/** Awake people sharing the activity interval, excluding the actor. */
	socialCompanions: number;
	/** The learner actually received instruction during this activity. */
	attendedLesson: boolean;
	/** Money actually credited or debited by the host. */
	material: number;
	status: Outcome["status"];
}

/** Translate completed host effects, rather than promises, into HF outcomes. */
export function realizedOutcome(
	offer: Affordance,
	evidence: CompletionEvidence,
): Required<Pick<Outcome, "needs" | "material">> {
	const needs = evidence.status === "completed" ? { ...offer.advertises } : {};
	// HF measures recovery from the body's start/end readings when these are absent.
	delete needs.sleep;
	delete needs.rest;
	if (evidence.socialCompanions === 0) {
		delete needs.belonging;
		// A solitary meal provides food, but does not realize a shared meal's meaning.
		if (offer.action === "gather") delete needs.meaning;
	}
	if (offer.action === "learn" && !evidence.attendedLesson) {
		delete needs.competence;
		delete needs.belonging;
	}
	return { needs, material: evidence.material };
}
