/** Received observations and attended lessons for a bounded hall inspection.
 * This host rule is deliberately simple. It is not a building safety model.
 */

import type { Input } from "@adam0white/human-framework";
import type { Affordance } from "../core/host-types.ts";
import type { Resident } from "../core/state.ts";

type MethodCue = Extract<
	Input,
	{ kind: "method.cues" }
>["payload"]["cues"][number];

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
	resident: Resident,
	observation: InspectionObservation,
): boolean {
	resident.owner.enqueue("method.cues", {
		person: resident.id,
		evidenceId: resident.owner.allocate("inspection-evidence"),
		contextId: observation.contextId,
		cues: cues(observation),
	});
	return true;
}
/** The caller must supply attention from the actual Run observation receipt. */
export function demonstrateHallInspection(
	resident: Resident,
	example: InspectionDemonstration,
): boolean {
	if (example.attention === undefined)
		throw Error("A demonstration requires actual Run attention");
	resident.owner.enqueue("method.demonstrated", {
		person: resident.id,
		evidenceId: `demo-evidence:${example.demonstrationId}`,
		demonstrationId: example.demonstrationId,
		methodId: "hall-section-inspection",
		contextId: example.contextId,
		conditions: cues(example),
		action: example.action,
		teacher: example.sourceId,
		outcome: example.outcome,
		receivedAttention: example.attention,
	});
	return true;
}
/** Physical witnesses receive an observation first; the Run's attention determines retained demonstration input. */
export function teachHallInspection(
	resident: Resident,
	sourceId: string,
	lessonId: string,
): void {
	resident.owner.lesson(resident.id, sourceId, lessonId);
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
