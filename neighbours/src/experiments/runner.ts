/** Historical HF3 study types and physical scorer. The recorded HF3 study is
 * retained verbatim; it cannot be regenerated or relabelled as current HF4.
 */
import type { DecisionRecord } from "../core/host-types.ts";
import type {
	InspectionAction,
	InspectionCues,
	InspectionObservation,
} from "./inspection.ts";
export type ExperimentPolicy =
	| "hf-intact"
	| "hf-withheld"
	| "hf-removed"
	| "conditional-table"
	| "random";
export interface InspectionScore {
	safe: boolean;
	completed: boolean;
	outcome:
		| "opened"
		| "kept-closed"
		| "awaiting-inspection"
		| "unsafe-opening"
		| "unnecessary-closure";
}
/** External host truth alone determines the physical outcome. No HF utility enters this function. */
export function scoreInspection(
	truth: InspectionCues,
	action: InspectionAction,
): InspectionScore {
	if (action === "ask-inspector")
		return { safe: true, completed: false, outcome: "awaiting-inspection" };
	const canOpen = truth.moisture === "dry" && truth.support === "sound";
	if (action === "open-section")
		return {
			safe: canOpen,
			completed: canOpen,
			outcome: canOpen ? "opened" : "unsafe-opening",
		};
	return {
		safe: true,
		completed: !canOpen,
		outcome: canOpen ? "unnecessary-closure" : "kept-closed",
	};
}
export interface Trial {
	observation: InspectionObservation;
	truth: InspectionCues;
}
export interface ExperimentCase extends InspectionScore {
	observation: InspectionObservation;
	truth: InspectionCues;
	action: InspectionAction;
	decision: DecisionRecord | null;
}
export interface ExperimentArm {
	policy: ExperimentPolicy;
	acquiredRules: number;
	cases: ExperimentCase[];
	completed: number;
	unsafe: number;
	asked: number;
}
export interface InspectionReport {
	schema: "hall-inspection-experiment@1";
	framework: string;
	seed: number;
	arms: ExperimentArm[];
	limits: string[];
}
export function runInspectionExperiment(_seed = 19): never {
	throw Error(
		"Historical HF3 experiment. Read its recorded report; current HF4 controls use the public Run.",
	);
}
