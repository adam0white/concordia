import { describe, expect, it } from "vitest";
import {
	buildInspectionPrompt,
	parseInspectionResponse,
	safeClaudeProvenance,
} from "../src/experiments/llm.ts";

describe("external inspection policy boundary", () => {
	it("accepts a legal action tied to this received observation", () => {
		expect(
			parseInspectionResponse(
				'{"contextId":"case-a","action":"keep-closed","reason":"Timber is wet."}',
				"case-a",
			),
		).toEqual({
			contextId: "case-a",
			action: "keep-closed",
			reason: "Timber is wet.",
		});
	});
	it("rejects invented actions, wrong cases and non-JSON without fallback", () => {
		for (const text of [
			"hello",
			"```json\n{}\n```",
			'{"contextId":"case-a","action":"repair","reason":"x"}',
			'{"contextId":"other","action":"open-section","reason":"x"}',
			'{"contextId":"case-a","action":"open-section","reason":"x","worldChanged":true}',
		])
			expect(() => parseInspectionResponse(text, "case-a")).toThrow();
	});
	it("passes observed cues and examples without hidden world truth", () => {
		const prompt = buildInspectionPrompt({
			contextId: "unknown-case",
			sectionId: "porch",
			moisture: "unknown",
			support: "sound",
		});
		expect(prompt).toContain('"moisture":"unknown"');
		expect(prompt).not.toContain("truth");
		expect(prompt).toContain('"demonstrations"');
	});
	it("exports allowlisted model metadata without session identifiers or credentials", () => {
		const data = safeClaudeProvenance(
			{
				is_error: false,
				result: "{}",
				session_id: "PRIVATE",
				token: "SECRET",
				duration_ms: 40,
				modelUsage: { "claude-opus-example": {} },
				total_cost_usd: 0.02,
			},
			"opus",
		);
		expect(JSON.stringify(data)).not.toContain("PRIVATE");
		expect(JSON.stringify(data)).not.toContain("SECRET");
		expect(data.models).toEqual(["claude-opus-example"]);
		expect(() =>
			safeClaudeProvenance({ is_error: true, result: "failed" }, "opus"),
		).toThrow();
	});
});
