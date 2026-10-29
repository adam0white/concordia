import { expect, it } from "vitest";
import { summarizeEvidence } from "../src/ui/EvidencePanel";

it("projects only recorded native results and does not turn missing replay evidence into a pass", () => {
	const native = summarizeEvidence("native", {
		schema: "native-mixed-town@1",
		recordedAt: "2026-10-16",
		runtime: "Python Concordia + Node + Claude",
		population: 8,
		rounds: 12,
		modelDecisions: 6,
		replayExact: true,
		replayModelCalls: 0,
		runtimeSources: { sha256: "captured-source" },
		initialCheckpoint: { runtime: { seed: 42 } },
		limits: ["Recorded responses only."],
	});
	expect(native.rows).toContainEqual(["Real model decisions", "6"]);
	expect(native.rows).toContainEqual(["Replay exact", "Yes"]);
	expect(native.rows).toContainEqual(["Source SHA-256", "captured-source"]);
	expect(native.limits).toEqual(["Recorded responses only."]);
	expect(
		summarizeEvidence("native", { schema: "native-mixed-town@1" }).rows,
	).toContainEqual(["Replay exact", "Not recorded"]);
});
it("preserves failed social controls, distinguishes population/seeds/days and rejects a different artifact schema", () => {
	const social = summarizeEvidence("social", {
		schema: "neighbours/evening-profile@1",
		arguments: { seeds: [42, 73], population: 208, days: 25 },
		results: [
			{ restoredContinuation: { passed: true } },
			{ restoredContinuation: { passed: false } },
		],
	});
	expect(social.rows).toContainEqual(["Seeds", "42, 73"]);
	expect(social.rows).toContainEqual(["Population per town", "208"]);
	expect(social.rows).toContainEqual(["Simulated days per town", "25"]);
	expect(social.rows).toContainEqual([
		"Restored continuation",
		"1 passed; 1 failed; 0 unreported",
	]);
	expect(() =>
		summarizeEvidence("native", { schema: "neighbours/evening-profile@1" }),
	).toThrow("Unexpected evidence format");
});
