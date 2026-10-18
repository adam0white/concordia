import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BenchStudyResults } from "../src/ui/BenchStudy.tsx";
import {
	benchStudyReport,
	summarizeBenchStudy,
} from "../src/ui/bench-study-report.ts";

function rawReport() {
	const branch = {
		endAt: 6000,
		fullIntervalMinutes: 2880,
		chain: {
			receivedNotice: true,
			raviFirstDecision: {
				chosen: "cart-slow",
				record: { hugeTrace: "SENTINEL".repeat(20000) },
			},
			receivedReplies: [
				{ reply: "refuse", event: { secretExtra: "sentinel" } },
			],
			allCartWork: [{ details: "sentinel" }],
		},
		outcome: {
			newRequests: 1,
			newReceivedAgreements: 0,
			mainBenchWorkPeriods: 0,
			returned: false,
			adaPaidMinutesCompleted: 120,
			hiddenExtra: 99,
		},
		decisions: ["sentinel"],
		events: ["sentinel"],
		controls: { lots: "sentinel" },
	};
	return {
		schema: "neighbours/bench-choice-probe@1",
		recordedAt: "2026-10-17T01:23:45.000Z",
		hf: "2.3.0",
		modelCalls: 0,
		sourceCommit: "abc",
		sourceFingerprint: "xyz",
		sourceWorktreeClean: true,
		limitations: ["Whole intervention, not isolated knowledge."],
		sources: { extra: "sentinel" },
		activeCheckpoints: ["sentinel"],
		cases: [42, 73, 101].flatMap((seed) =>
			["soon", "tomorrow", "brief"].map((slot) => ({
				seed,
				slot,
				noProposal: structuredClone(branch),
				proposal: structuredClone(branch),
				extra: "sentinel",
			})),
		),
	};
}

describe("compact bench study projection", () => {
	it("copies only the UI fields and preserves raw JSON without retaining large records", () => {
		const raw = rawReport(),
			before = JSON.stringify(raw),
			summary = summarizeBenchStudy(raw);
		expect(JSON.stringify(raw)).toBe(before);
		expect(summary.cases).toHaveLength(9);
		expect(Object.keys(summary).sort()).toEqual(
			[
				"schema",
				"recordedAt",
				"hf",
				"modelCalls",
				"sourceCommit",
				"sourceFingerprint",
				"sourceWorktreeClean",
				"limitations",
				"cases",
			].sort(),
		);
		expect(Object.keys(summary.cases[0] ?? {}).sort()).toEqual(
			["seed", "slot", "noProposal", "proposal"].sort(),
		);
		const branch = summary.cases[0]?.proposal;
		expect(Object.keys(branch ?? {}).sort()).toEqual(
			["endAt", "fullIntervalMinutes", "chain", "outcome"].sort(),
		);
		expect(Object.keys(branch?.chain ?? {}).sort()).toEqual(
			["receivedNotice", "raviFirstDecision", "receivedReplies"].sort(),
		);
		expect(branch?.chain.raviFirstDecision).toEqual({ chosen: "cart-slow" });
		expect(branch?.chain.receivedReplies).toEqual([{ reply: "refuse" }]);
		expect(Object.keys(branch?.outcome ?? {}).sort()).toEqual(
			[
				"newRequests",
				"newReceivedAgreements",
				"mainBenchWorkPeriods",
				"returned",
				"adaPaidMinutesCompleted",
			].sort(),
		);
		expect(JSON.stringify(summary)).not.toContain("sentinel");
		expect(JSON.stringify(summary)).not.toContain("SENTINEL");
		expect(
			Buffer.byteLength(`${JSON.stringify(summary, null, 2)}\n`),
		).toBeLessThanOrEqual(30_000);
	});
	it("renders identical branch readouts from raw and compact measurements for all nine cases", () => {
		const raw = rawReport(),
			summary = summarizeBenchStudy(raw);
		for (let index = 0; index < 9; index++) {
			const render = (report: unknown) =>
				renderToStaticMarkup(
					createElement(BenchStudyResults, {
						report: benchStudyReport(report),
						index,
					}),
				);
			expect(render(summary)).toBe(render(raw));
		}
	});
	it("copies arrays and nested records so summary edits cannot change raw data", () => {
		const raw = rawReport(),
			before = JSON.stringify(raw),
			summary = summarizeBenchStudy(raw);
		summary.limitations.push("extra");
		const branch = summary.cases[0]?.proposal;
		if (!branch) throw Error("Missing branch");
		const reply = branch.chain.receivedReplies[0];
		if (!reply) throw Error("Missing reply");
		reply.reply = "agree";
		branch.outcome.returned = true;
		expect(JSON.stringify(raw)).toBe(before);
	});
	it("accepts a summary bound to exact original UTF8 bytes, including its trailing newline", () => {
		const raw = rawReport(),
			bytes = `${JSON.stringify(raw, null, 2)}\n`;
		const rawReportSha256 = createHash("sha256")
			.update(bytes, "utf8")
			.digest("hex");
		const summary = { ...summarizeBenchStudy(raw), rawReportSha256 };
		expect(benchStudyReport(summary).rawReportSha256).toBe(rawReportSha256);
		expect(rawReportSha256).not.toBe(
			createHash("sha256").update(bytes.trimEnd(), "utf8").digest("hex"),
		);
		expect(() =>
			benchStudyReport({ ...summary, rawReportSha256: "invalid" }),
		).toThrow();
		expect(summarizeBenchStudy(summary).rawReportSha256).toBeUndefined();
	});
	it("rejects malformed branches before projecting rather than hiding invalid measurements", () => {
		const raw = rawReport();
		const trial = raw.cases[0];
		if (!trial) throw Error("Missing trial");
		trial.proposal.outcome.newRequests = Number.NaN;
		expect(() => summarizeBenchStudy(raw)).toThrow("Invalid bench study");
	});
});
