export interface Branch {
	endAt: number;
	fullIntervalMinutes: number;
	chain: {
		receivedNotice: boolean;
		raviFirstDecision: { chosen: string } | null;
		receivedReplies: { reply: string }[];
	};
	outcome: {
		newRequests: number;
		newReceivedAgreements: number;
		mainBenchWorkPeriods: number;
		returned: boolean;
		adaPaidMinutesCompleted: number;
	};
}
export interface BenchReport {
	schema: "neighbours/bench-choice-probe@1";
	recordedAt: string;
	hf: string;
	modelCalls: 0;
	sourceCommit: string;
	sourceFingerprint: string;
	sourceWorktreeClean: boolean;
	rawReportSha256?: string;
	limitations: string[];
	cases: { seed: number; slot: string; noProposal: Branch; proposal: Branch }[];
}
const object = (value: unknown): Record<string, unknown> =>
	value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
const validBranch = (value: unknown) => {
	const b = object(value),
		c = object(b.chain),
		o = object(b.outcome);
	return (
		typeof b.endAt === "number" &&
		Number.isFinite(b.endAt) &&
		typeof b.fullIntervalMinutes === "number" &&
		Number.isFinite(b.fullIntervalMinutes) &&
		b.fullIntervalMinutes > 0 &&
		typeof c.receivedNotice === "boolean" &&
		(c.raviFirstDecision === null ||
			typeof object(c.raviFirstDecision).chosen === "string") &&
		Array.isArray(c.receivedReplies) &&
		c.receivedReplies.every(
			(reply) => typeof object(reply).reply === "string",
		) &&
		typeof o.returned === "boolean" &&
		[
			"newRequests",
			"newReceivedAgreements",
			"mainBenchWorkPeriods",
			"adaPaidMinutesCompleted",
		].every(
			(key) =>
				typeof o[key] === "number" &&
				Number.isFinite(o[key]) &&
				Number(o[key]) >= 0,
		)
	);
};
export function benchStudyReport(value: unknown): BenchReport {
	const r = object(value);
	if (
		r.schema !== "neighbours/bench-choice-probe@1" ||
		typeof r.recordedAt !== "string" ||
		typeof r.hf !== "string" ||
		r.modelCalls !== 0 ||
		typeof r.sourceCommit !== "string" ||
		typeof r.sourceFingerprint !== "string" ||
		typeof r.sourceWorktreeClean !== "boolean" ||
		(r.rawReportSha256 !== undefined &&
			(typeof r.rawReportSha256 !== "string" ||
				!/^[a-f0-9]{64}$/.test(r.rawReportSha256))) ||
		!Array.isArray(r.limitations) ||
		!r.limitations.every((x) => typeof x === "string") ||
		!Array.isArray(r.cases) ||
		!r.cases.length ||
		r.cases.length > 9 ||
		!r.cases.every((value) => {
			const c = object(value);
			return (
				Number.isSafeInteger(c.seed) &&
				typeof c.slot === "string" &&
				validBranch(c.noProposal) &&
				validBranch(c.proposal)
			);
		})
	)
		throw Error("Invalid bench study");
	return value as BenchReport;
}

/** Explicit UI projection. Raw records, offers, checkpoints and trace terms never enter this result. */
export function summarizeBenchStudy(value: unknown): BenchReport {
	const report = benchStudyReport(value);
	const branch = (b: Branch): Branch => ({
		endAt: b.endAt,
		fullIntervalMinutes: b.fullIntervalMinutes,
		chain: {
			receivedNotice: b.chain.receivedNotice,
			raviFirstDecision:
				b.chain.raviFirstDecision === null
					? null
					: { chosen: b.chain.raviFirstDecision.chosen },
			receivedReplies: b.chain.receivedReplies.map((r) => ({ reply: r.reply })),
		},
		outcome: {
			newRequests: b.outcome.newRequests,
			newReceivedAgreements: b.outcome.newReceivedAgreements,
			mainBenchWorkPeriods: b.outcome.mainBenchWorkPeriods,
			returned: b.outcome.returned,
			adaPaidMinutesCompleted: b.outcome.adaPaidMinutesCompleted,
		},
	});
	return {
		schema: report.schema,
		recordedAt: report.recordedAt,
		hf: report.hf,
		modelCalls: report.modelCalls,
		sourceCommit: report.sourceCommit,
		sourceFingerprint: report.sourceFingerprint,
		sourceWorktreeClean: report.sourceWorktreeClean,
		limitations: [...report.limitations],
		cases: report.cases.map((c) => ({
			seed: c.seed,
			slot: c.slot,
			noProposal: branch(c.noProposal),
			proposal: branch(c.proposal),
		})),
	};
}
