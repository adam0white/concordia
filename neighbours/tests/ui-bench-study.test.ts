import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { BenchStudyResults, benchStudyReport } from "../src/ui/BenchStudy.tsx";

const branch = {
	endAt: 6000,
	fullIntervalMinutes: 2880,
	chain: {
		receivedNotice: false,
		raviFirstDecision: { chosen: "cart-slow" },
		receivedReplies: [],
	},
	outcome: {
		newRequests: 0,
		newReceivedAgreements: 0,
		mainBenchWorkPeriods: 0,
		returned: false,
		adaPaidMinutesCompleted: 120,
	},
};
const report = {
	schema: "neighbours/bench-choice-probe@1",
	recordedAt: "2026-10-17T00:00:00Z",
	hf: "2.3.0",
	modelCalls: 0,
	sourceCommit: "abc",
	sourceFingerprint: "xyz",
	sourceWorktreeClean: true,
	limitations: ["Whole intervention, not isolated knowledge."],
	cases: [
		{
			seed: 42,
			slot: "soon",
			noProposal: branch,
			proposal: { ...branch, chain: { ...branch.chain, receivedNotice: true } },
		},
	],
};
it("shows negative full-town outcomes and separates receipt from permission", () => {
	const html = renderToStaticMarkup(
		createElement(BenchStudyResults, {
			report: benchStudyReport(report),
			index: 0,
		}),
	);
	expect(html).toContain("Ravi received notice");
	expect(html).toContain("Agreements received");
	expect(html).toContain("Main-bench work completed");
	expect(html).toContain("120 minutes");
	expect(html).toContain("No return in this interval");
	expect(html).toContain("Whole intervention, not isolated knowledge.");
});
it("rejects absent or malformed branch outcomes", () => {
	expect(() => benchStudyReport(null)).toThrow();
	expect(() => benchStudyReport({ ...report, cases: [{}] })).toThrow();
	expect(() =>
		benchStudyReport({
			...report,
			cases: [{ ...report.cases[0], proposal: {} }],
		}),
	).toThrow();
});
