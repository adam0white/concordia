/** Received observations and attended lessons for a bounded hall inspection.
 * This host rule is deliberately simple. It is not a building safety model.
 */
import {
	type Affordance,
	clearMethodContext,
	demonstrateMethod,
	type MethodCue,
	type Person,
	receiveMethodCues,
} from "@adam0white/human-framework";

export type InspectionAction = "open-section" | "keep-closed" | "ask-inspector";
export interface InspectionCues {
	moisture: "dry" | "wet" | "unknown";
	support: "sound" | "loose" | "unknown";
}
export interface InspectionObservation extends InspectionCues {
	contextId: string;
	sectionId: string;
}
export interface InspectionDemonstration extends InspectionCues {
	contextId: string;
	sourceId: string;
	demonstrationId: string;
	action: Exclude<InspectionAction, "ask-inspector">;
	outcome: "success" | "failure";
	attention?: number;
}
export const INSPECTION_ACTIONS: readonly InspectionAction[] = [
	"ask-inspector",
	"keep-closed",
	"open-section",
];
export const INSPECTION_EXAMPLES: ReadonlyArray<
	InspectionCues & { action: Exclude<InspectionAction, "ask-inspector"> }
> = [
	{ moisture: "dry", support: "sound", action: "open-section" },
	{ moisture: "wet", support: "sound", action: "keep-closed" },
];
function cues(input: InspectionCues): MethodCue[] {
	if (
		!["dry", "wet", "unknown"].includes(input.moisture) ||
		!["sound", "loose", "unknown"].includes(input.support)
	)
		throw new Error("Invalid inspection observations");
	return [
		{ cue: "hall-moisture", value: input.moisture },
		{ cue: "hall-support", value: input.support },
	];
}
export function observeHallInspection(
	person: Person,
	observation: InspectionObservation,
): boolean {
	return receiveMethodCues(person, {
		contextId: observation.contextId,
		cues: cues(observation),
	});
}
/** Does not invent an observation. HF rejects a lesson with no matching received cues. */
export function demonstrateHallInspection(
	person: Person,
	example: InspectionDemonstration,
): boolean {
	return demonstrateMethod(person, {
		id: "hall-section-inspection",
		demonstrationId: example.demonstrationId,
		contextId: example.contextId,
		conditions: cues(example),
		action: example.action,
		sourceId: example.sourceId,
		outcome: example.outcome,
		...(example.attention === undefined
			? {}
			: { attention: example.attention }),
	});
}
/** Call only for an attended lesson. Explain two cases, each demonstrated twice. */
export function teachHallInspection(
	person: Person,
	sourceId: string,
	lessonId: string,
): void {
	for (const [index, example] of INSPECTION_EXAMPLES.entries()) {
		const contextId = `${lessonId}-example-${index}`;
		observeHallInspection(person, {
			...example,
			contextId,
			sectionId: `class-example-${index}`,
		});
		for (let repeat = 0; repeat < 2; repeat++)
			demonstrateHallInspection(person, {
				...example,
				contextId,
				sourceId,
				demonstrationId: `${lessonId}-${index}-${repeat}`,
				outcome: "success",
			});
	}
	clearMethodContext(person);
}
/** Same offers in every arm; lower effort makes asking a deliberately authored fallback. */
export function hallInspectionOffers(
	contextId: string,
	sectionId: string,
): Affordance[] {
	const labels: Record<InspectionAction, string> = {
		"ask-inspector": "Ask an experienced inspector",
		"keep-closed": "Keep this section closed",
		"open-section": "Open this section",
	};
	return INSPECTION_ACTIONS.map((action) => ({
		id: action,
		action,
		label: labels[action],
		targetId: sectionId,
		methodContext: contextId,
		duration: 15,
		effort: action === "ask-inspector" ? 0 : 0.1,
		advertises: {},
	}));
}
