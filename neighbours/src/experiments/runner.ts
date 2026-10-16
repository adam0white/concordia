/** Small repeatable control, not a claim of calibrated people or general planning. */
import {
	createPerson,
	type DecisionRecord,
	decide,
	snapshot,
} from "@adam0white/human-framework";
import {
	hallInspectionOffers,
	INSPECTION_ACTIONS,
	INSPECTION_EXAMPLES,
	type InspectionAction,
	type InspectionCues,
	type InspectionObservation,
	observeHallInspection,
	teachHallInspection,
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
interface Trial {
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
	framework: "2.2.1";
	seed: number;
	arms: ExperimentArm[];
	limits: string[];
}
const policies: ExperimentPolicy[] = [
	"hf-intact",
	"hf-withheld",
	"hf-removed",
	"conditional-table",
	"random",
];
function trials(): Trial[] {
	return [
		{
			observation: {
				contextId: "held-out-east",
				sectionId: "east-gallery",
				moisture: "dry",
				support: "sound",
			},
			truth: { moisture: "dry", support: "sound" },
		},
		{
			observation: {
				contextId: "held-out-west",
				sectionId: "west-classroom",
				moisture: "wet",
				support: "sound",
			},
			truth: { moisture: "wet", support: "sound" },
		},
		{
			observation: {
				contextId: "held-out-conflict",
				sectionId: "rear-entrance",
				moisture: "dry",
				support: "loose",
			},
			truth: { moisture: "dry", support: "loose" },
		},
		{
			observation: {
				contextId: "held-out-missing",
				sectionId: "covered-porch",
				moisture: "unknown",
				support: "sound",
			},
			truth: { moisture: "wet", support: "sound" },
		},
	];
}
function randomIndex(seed: number, index: number): number {
	let x = (seed + Math.imul(index + 1, 0x9e3779b9)) >>> 0;
	x ^= x << 13;
	x ^= x >>> 17;
	x ^= x << 5;
	return (x >>> 0) % INSPECTION_ACTIONS.length;
}
function tableChoice(observation: InspectionCues): InspectionAction {
	// Acquires exactly the two demonstrated mappings, with the same help default.
	const learned = new Map(
		INSPECTION_EXAMPLES.map((e) => [`${e.moisture}:${e.support}`, e.action]),
	);
	return (
		learned.get(`${observation.moisture}:${observation.support}`) ??
		"ask-inspector"
	);
}
export function runInspectionExperiment(seed = 19): InspectionReport {
	if (!Number.isSafeInteger(seed) || seed < 0)
		throw new Error("Invalid experiment seed");
	const arms = policies.map((policy) => {
		const person = createPerson({
			id: "inspection-learner",
			name: "Learner",
			seed,
			now: 720,
			bornAt: -30 * 365 * 1440,
			sex: "female",
		});
		if (policy === "hf-intact" || policy === "hf-removed")
			teachHallInspection(person, "teacher", "attended-lesson");
		// Causal removal only: body, values, skill, identity and RNG stay untouched.
		if (policy === "hf-removed" && person.methods) person.methods.rules = [];
		const cases = trials().map((trial, index) => {
			observeHallInspection(person, trial.observation);
			let decision: DecisionRecord | null = null;
			let action: InspectionAction;
			if (policy === "conditional-table")
				action = tableChoice(trial.observation);
			else if (policy === "random")
				action =
					INSPECTION_ACTIONS[randomIndex(seed, index)] ?? "ask-inspector";
			else {
				decision = decide(
					person,
					hallInspectionOffers(
						trial.observation.contextId,
						trial.observation.sectionId,
					),
				);
				const selected = decision.chosenAction;
				if (!INSPECTION_ACTIONS.includes(selected as InspectionAction))
					throw new Error("HF returned an invalid inspection action");
				action = selected as InspectionAction;
			}
			return {
				...trial,
				action,
				decision,
				...scoreInspection(trial.truth, action),
			};
		});
		return {
			policy,
			acquiredRules: snapshot(person).methods?.rules.length ?? 0,
			cases,
			completed: cases.filter((c) => c.completed).length,
			unsafe: cases.filter((c) => !c.safe).length,
			asked: cases.filter((c) => c.action === "ask-inspector").length,
		};
	});
	return {
		schema: "hall-inspection-experiment@1",
		framework: "2.2.1",
		seed,
		arms,
		limits: [
			"Asking for help is an authored low-effort fallback, not learned uncertainty detection.",
			"These fixed held-out section identities test transfer of two demonstrated cue rules, not general planning.",
			"The table learner receives the same examples and can match HF; no broad superiority is implied.",
			"The missing observation case hides a true fact equally from every policy.",
			"No LLM arm is configured; no LLM result is fabricated.",
			"Inspection outcomes use a simplified host rule, not real building-safety advice.",
		],
	};
}
