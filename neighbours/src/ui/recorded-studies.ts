export interface InspectionCase {
	observation: {
		moisture: string;
		support: string;
		contextId: string;
		sectionId: string;
	};
	action: string;
	safe: boolean;
	completed: boolean;
	outcome: string;
}
export interface InspectionReport {
	schema: string;
	recordedAt: string;
	execution: string;
	baseline: {
		framework: string;
		arms: {
			policy: string;
			cases: InspectionCase[];
			completed: number;
			unsafe: number;
			asked: number;
		}[];
		limits: string[];
	};
	calls: {
		observation: InspectionCase["observation"];
		choice: { action: string; reason: string };
		score: { safe: boolean; completed: boolean; outcome: string };
		provenance: { provider: string; requestedModel: string; models?: string[] };
	}[];
	summary: { cases: number; completed: number; unsafe: number; asked: number };
	limits: string[];
}
const record = (value: unknown): Record<string, unknown> =>
	value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
const scalar = (value: unknown) =>
	typeof value === "string" ||
	(typeof value === "number" && Number.isFinite(value))
		? String(value)
		: "Not recorded";
const limits = (value: unknown) =>
	Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
export function inspectionReport(value: unknown): InspectionReport {
	const data = record(value),
		baseline = record(data.baseline);
	const validObservation = (value: unknown) =>
		["moisture", "support", "contextId", "sectionId"].every(
			(key) => typeof record(value)[key] === "string",
		);
	const validScore = (value: unknown) =>
		typeof record(value).safe === "boolean" &&
		typeof record(value).completed === "boolean" &&
		typeof record(value).outcome === "string";
	if (
		data.schema !== "hall-inspection-llm-comparison@1" ||
		typeof data.recordedAt !== "string" ||
		typeof data.execution !== "string" ||
		typeof baseline.framework !== "string" ||
		!Array.isArray(data.limits) ||
		!data.limits.every((limit) => typeof limit === "string") ||
		!["cases", "completed", "unsafe", "asked"].every(
			(key) =>
				typeof record(data.summary)[key] === "number" &&
				Number.isFinite(record(data.summary)[key]),
		) ||
		!Array.isArray(baseline.arms) ||
		!baseline.arms.length ||
		!Array.isArray(data.calls) ||
		!data.calls.length ||
		!baseline.arms.every((value) => {
			const arm = record(value);
			return (
				typeof arm.policy === "string" &&
				[arm.completed, arm.unsafe, arm.asked].every(
					(value) => typeof value === "number" && Number.isFinite(value),
				) &&
				Array.isArray(arm.cases) &&
				arm.cases.length ===
					(Array.isArray(data.calls) ? data.calls.length : -1) &&
				arm.cases.every(
					(trial, index) =>
						validObservation(record(trial).observation) &&
						["moisture", "support", "contextId", "sectionId"].every(
							(key) =>
								record(record(trial).observation)[key] ===
								record(
									record((Array.isArray(data.calls) ? data.calls : [])[index])
										.observation,
								)[key],
						) &&
						validScore(trial) &&
						typeof record(trial).action === "string",
				)
			);
		}) ||
		!data.calls.every((value) => {
			const call = record(value);
			return (
				validObservation(call.observation) &&
				validScore(call.score) &&
				typeof record(call.choice).action === "string" &&
				typeof record(call.choice).reason === "string" &&
				typeof record(call.provenance).provider === "string" &&
				typeof record(call.provenance).requestedModel === "string" &&
				(record(call.provenance).models === undefined ||
					(Array.isArray(record(call.provenance).models) &&
						(record(call.provenance).models as unknown[]).every(
							(model) => typeof model === "string",
						)))
			);
		})
	)
		throw Error("Invalid inspection report");
	const validated = data as unknown as InspectionReport;
	const matches = (
		summary: { completed: number; unsafe: number; asked: number },
		cases: { completed: boolean; safe: boolean; action: string }[],
	) =>
		summary.completed === cases.filter((c) => c.completed).length &&
		summary.unsafe === cases.filter((c) => !c.safe).length &&
		summary.asked === cases.filter((c) => c.action === "ask-inspector").length;
	if (
		validated.summary.cases !== validated.calls.length ||
		!matches(
			validated.summary,
			validated.calls.map((c) => ({ ...c.score, action: c.choice.action })),
		) ||
		validated.baseline.arms.some((arm) => !matches(arm, arm.cases))
	)
		throw Error("Inspection counters do not match cases");
	return validated;
}
export type StudyKind = "native" | "gm" | "cart" | "bench-gm";
export const studySpecs: Record<
	StudyKind,
	{ question: string; file: string; schema: string }
> = {
	"bench-gm": {
		question: "Can Concordia propose a bench window without granting access?",
		file: "bench-director",
		schema: "native-concordia-bench@1",
	},
	native: {
		question: "Can a saved LLM neighbour replay without another model call?",
		file: "native-mixed-town",
		schema: "native-mixed-town@1",
	},
	gm: {
		question: "Did a generated proposal change the town?",
		file: "gm-director",
		schema: "native-concordia-gm@1",
	},
	cart: {
		question: "Did Ravi choose to ask for the main bench?",
		file: "cart-choice-probe",
		schema: "neighbours/cart-choice-probe@1",
	},
};
export function projectStudy(kind: StudyKind, value: unknown) {
	const data = record(value);
	if (data.schema !== studySpecs[kind].schema)
		throw Error("Unexpected recorded study format");
	const rows: [string, string][] = [];
	if (kind === "bench-gm") {
		if (!Array.isArray(data.cases) || !data.cases.length)
			throw Error("Missing generated bench cases");
		for (const value of data.cases) {
			const c = record(value),
				result = record(c.result);
			rows.push([
				`Seed ${scalar(c.seed)} proposal`,
				c.failure
					? `Generation failed: ${scalar(c.failure)}`
					: result.rejection
						? `Rejected: ${scalar(result.rejection)}`
						: scalar(record(result.proposal).slot),
			]);
		}
		rows.push(
			["Actual model calls", scalar(data.modelCalls)],
			["Replay model calls", scalar(data.replayModelCalls)],
			["Exact replay", data.replayExact === true ? "Yes" : "Not verified"],
			[
				"World application",
				data.cases.every((value) => {
					const result = record(record(value).result);
					return (
						result.hostApplied === false &&
						result.residentObservationsDelivered === 0
					);
				})
					? "Not applied; no resident receipt or consent claimed"
					: "Not verified",
			],
		);
	}
	if (kind === "cart") {
		const opportunity = record(data.opportunity);
		rows.push(
			["With cart goal", scalar(record(opportunity.baseline).chosen)],
			["Cart goal removed", scalar(record(opportunity.goalAblated).chosen)],
			["Completion after these choices", "Not measured by this choice probe"],
		);
	}
	if (kind === "native")
		rows.push(
			["Actual model decisions", scalar(data.modelDecisions)],
			[
				"Replay exact",
				data.replayExact === true
					? "Yes"
					: data.replayExact === false
						? "No"
						: "Not recorded",
			],
			["Replay model calls", scalar(data.replayModelCalls)],
		);
	if (kind === "gm")
		rows.push(
			["Generated proposal", scalar(record(data.proposal).kind)],
			[
				"Proposal rejected",
				data.rejection === null ? "No" : scalar(data.rejection),
			],
			[
				"Physical change",
				limits(data.limits).some((limit) =>
					limit.includes("No physical host change"),
				)
					? "None in this experiment"
					: "Not recorded",
			],
			["Actual model calls", scalar(data.modelCalls)],
		);
	return {
		rows,
		recordedAt: scalar(data.recordedAt),
		source: scalar(
			data.sourceFingerprint ??
				record(data.runtimeSources).sha256 ??
				data.inputSha256,
		),
		limits: limits(data.limits ?? data.limitations),
	};
}
