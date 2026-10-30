import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { InspectionStudy } from "../src/ui/Comparison";
import { inspectionReport, projectStudy } from "../src/ui/recorded-studies";

const recorded = (name: string) =>
	JSON.parse(readFileSync(`public/experiments/${name}.json`, "utf8"));
it("uses the full recorded limits despite the obsolete baseline absent-arm claim", () => {
	const raw = recorded("inspection-comparison");
	const before = JSON.stringify(raw);
	const html = renderToStaticMarkup(
		createElement(InspectionStudy, { report: inspectionReport(raw) }),
	);
	expect(html).toContain("4 actual LLM calls");
	expect(html).toContain("HF 2.2.1");
	expect(html).not.toContain("No LLM arm");
	expect(html).toContain("One model run per case");
	expect(html).toContain("HF · learned rules intact");
	expect(html).toContain("open-section");
	expect(JSON.stringify(raw)).toBe(before);
});
it("rejects absent and malformed case evidence rather than presenting a measured result", () => {
	expect(() => inspectionReport(null)).toThrow();
	const raw = recorded("inspection-comparison");
	raw.calls[0].score = {};
	expect(() => inspectionReport(raw)).toThrow();
	expect(() => projectStudy("cart", { schema: "unknown" })).toThrow();
});
it("keeps negative cart evidence and no-effect GM results separate from actual native calls", () => {
	const cartRaw = recorded("cart-choice-probe");
	expect(cartRaw.opportunity).toBeNull();
	expect(cartRaw.raviDecisions).toBeGreaterThan(0);
	const cart = projectStudy("cart", cartRaw);
	expect(cart.rows).toContainEqual(["With cart goal", "Not recorded"]);
	expect(cart.rows).toContainEqual(["Cart goal removed", "Not recorded"]);
	expect(cart.limits.join(" ")).toContain("not negotiated");
	const gm = projectStudy("gm", recorded("gm-director"));
	expect(gm.rows).toContainEqual([
		"Physical change",
		"None in this experiment",
	]);
	const nativeRaw = recorded("native-mixed-town");
	const native = projectStudy("native", nativeRaw);
	expect(nativeRaw.modelDecisions).toBeGreaterThan(0);
	expect(nativeRaw.modelDecisions).toBe(nativeRaw.responseTape.entries.length);
	expect(native.rows).toContainEqual([
		"Actual model decisions",
		String(nativeRaw.modelDecisions),
	]);
	expect(native.rows).toContainEqual(["Replay model calls", "0"]);
	expect(native.source).not.toBe("Not recorded");
});
it("rejects malformed provenance and counters that contradict recorded cases", () => {
	for (const mutate of [
		(raw: ReturnType<typeof recorded>) => {
			raw.execution = { bad: true };
		},
		(raw: ReturnType<typeof recorded>) => {
			raw.calls[0].provenance.models = { bad: true };
		},
		(raw: ReturnType<typeof recorded>) => {
			raw.summary.completed = 999;
		},
		(raw: ReturnType<typeof recorded>) => {
			raw.baseline.arms[0].unsafe = -999;
		},
	]) {
		const raw = recorded("inspection-comparison");
		mutate(raw);
		expect(() => inspectionReport(raw)).toThrow();
	}
});
it("keeps generated bench premises separate from recipient knowledge and consent", () => {
	const projected = projectStudy("bench-gm", {
		schema: "native-concordia-bench@1",
		recordedAt: "today",
		modelCalls: 3,
		replayModelCalls: 0,
		replayExact: true,
		cases: [
			{
				seed: 42,
				result: {
					proposal: { slot: "soon" },
					hostApplied: false,
					residentObservationsDelivered: 0,
				},
			},
		],
		limits: ["Premise only"],
	});
	expect(projected.rows).toContainEqual(["Seed 42 proposal", "soon"]);
	expect(projected.rows).toContainEqual([
		"World application",
		"The proposal was not applied. No resident is claimed to have received or agreed to it.",
	]);
});
it("labels the native seed 101 exclusion as Phase C history rather than current absence", () => {
	const raw = recorded("bench-director");
	const before = JSON.stringify(raw);
	const projected = projectStudy("bench-gm", raw);
	expect(raw.seeds).toEqual([42, 73]);
	expect(projected.rows).toContainEqual([
		"Seed 101 historical exclusion",
		"This seed was excluded after the Phase C search of the fixed native 42/73 case list. A case now arises naturally in the deterministic study. No current native model run covers this seed.",
	]);
	expect(projected.rows).not.toContainEqual([
		"Seed 101 proposal",
		"No natural case in 40 days; no model call",
	]);
	expect(JSON.stringify(raw)).toBe(before);
});
