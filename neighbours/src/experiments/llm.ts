/** Strict boundary for a real external policy. No fallback or physical mutation. */
import {
	hallInspectionOffers,
	INSPECTION_ACTIONS,
	INSPECTION_EXAMPLES,
	type InspectionAction,
	type InspectionObservation,
} from "./inspection.ts";
export interface LlmChoice {
	contextId: string;
	action: InspectionAction;
	reason: string;
}
export const INSPECTION_SYSTEM_PROMPT =
	"Choose one available action in a fictional town inspection task. Use only the supplied observations and demonstrations. Return exactly the requested JSON object. You have no tools and cannot change the world.";
export function buildInspectionPrompt(
	observation: InspectionObservation,
): string {
	return JSON.stringify({
		task: "Choose an action for this new section. Demonstrations are successful past actions. Unknown observations remain unknown. You may infer from the observed cues; explain your choice briefly.",
		demonstrations: INSPECTION_EXAMPLES.flatMap((example) =>
			[0, 1].map((index) => ({
				exampleId: `class-${example.moisture}-${index}`,
				moisture: example.moisture,
				support: example.support,
				action: example.action,
				outcome: "success",
			})),
		),
		observation: {
			contextId: observation.contextId,
			sectionId: observation.sectionId,
			moisture: observation.moisture,
			support: observation.support,
		},
		legalActions: hallInspectionOffers(
			observation.contextId,
			observation.sectionId,
		).map((a) => ({
			id: a.id,
			label: a.label,
			duration: a.duration,
			effort: a.effort,
			advertises: a.advertises,
		})),
		response: {
			contextId: observation.contextId,
			action: "one legal action ID",
			reason: "brief reason, at most 400 characters",
		},
	});
}
export function parseInspectionResponse(
	text: string,
	contextId: string,
): LlmChoice {
	const value: unknown = JSON.parse(text);
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw Error("Model response must be a JSON object");
	const r = value as Record<string, unknown>;
	if (
		Object.keys(r).sort().join() !== "action,contextId,reason" ||
		r.contextId !== contextId ||
		typeof r.action !== "string" ||
		!INSPECTION_ACTIONS.includes(r.action as InspectionAction) ||
		typeof r.reason !== "string" ||
		!r.reason.trim() ||
		r.reason.length > 400
	)
		throw Error("Model response violates the observation/action contract");
	return { contextId, action: r.action as InspectionAction, reason: r.reason };
}
export function safeClaudeProvenance(
	envelope: unknown,
	requestedModel: string,
) {
	if (!envelope || typeof envelope !== "object")
		throw Error("Missing model result envelope");
	const e = envelope as Record<string, unknown>;
	if (e.is_error !== false || typeof e.result !== "string")
		throw Error("Model call did not return a successful text result");
	const models =
		e.modelUsage && typeof e.modelUsage === "object"
			? Object.keys(e.modelUsage)
			: [];
	if (!models.length)
		throw Error("Model result did not identify a resolved model");
	return {
		provider: "Claude Code CLI",
		requestedModel,
		models,
		...(typeof e.duration_ms === "number"
			? { reportedDurationMs: e.duration_ms }
			: {}),
		...(typeof e.total_cost_usd === "number"
			? { reportedCostUsd: e.total_cost_usd }
			: {}),
	};
}
