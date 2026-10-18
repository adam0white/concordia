import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import {
	ReceivedRouteResults,
	receivedRouteReport,
} from "../src/ui/ReceivedRouteStudy.tsx";

const report = {
	schema: "received-route-study@1",
	recordedAt: "2026-10-17T00:00:00Z",
	commit: "abc",
	dirty: false,
	execution: "Published npm",
	sources: { "package.json": "xyz" },
	limits: ["Not calibrated"],
	cases: [
		{
			framework: "2.3.0",
			domain: "parcel",
			parameters: { sourceTrust: 1, halfLifeMinutes: 30 },
			results: [
				{ arm: "useful", chosen: "ask", considered: [] },
				{ arm: "goal-removed", chosen: "ask", considered: [] },
				{
					arm: "refused",
					chosen: "ask",
					considered: [],
					refusal: { goalProgress: 0, feasibleAfter: false },
				},
			],
		},
	],
};
it("shows actual choices including asking without a goal, rather than declaring all ablations failed", () => {
	const parsed = receivedRouteReport(report);
	const html = renderToStaticMarkup(
		createElement(ReceivedRouteResults, { report: parsed, domain: 0 }),
	);
	expect(html).toContain("Goal removed");
	expect(html.match(/Chose to ask/g)).toHaveLength(3);
	expect(html).toContain("No goal progress");
	expect(html).toContain("Request expectation consumed");
	expect(html).toContain("HF 2.3.0");
});
it("rejects unsupported or malformed recordings instead of showing empty success", () => {
	for (const value of [
		{},
		null,
		{ ...report, schema: "other" },
		{ ...report, cases: [{}] },
	])
		expect(() => receivedRouteReport(value)).toThrow();
});
