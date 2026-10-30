/** Refuse to present measurements from different sources as the current candidate. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { summarizeBenchStudy } from "../src/ui/bench-study-report.ts";

const app = resolve(import.meta.dirname, "..");
const reports = process.argv.slice(2);
if (!reports.length)
	reports.push(
		"public/experiments/social-episodes.json",
		"public/experiments/cart-choice-probe.json",
		"public/experiments/hf-config.json",
		"public/experiments/received-assistance.json",
		"public/experiments/received-routes.json",
		"public/experiments/bench-choices.json",
	);
/**
 * Recorded historical reports: their generator needs an input that is no longer available, so they cannot be
 * rerun on current sources. Each is pinned to its exact bytes instead of its source digests, and the check says
 * so on every run. See docs/neighbours/phase-d-regeneration.md.
 */
const HISTORICAL = {
	"public/experiments/received-assistance.json": {
		sha256: "7dab5998b96e85ac29681c711484aa183e1d34c4d8d6e208c70039c07dbacbfd",
		why: "its private owner checkpoint (sha256 52fa1c08…a04b0) is unavailable, so it cannot be rerun; it records the HF 2.6.0 sources it was measured on",
	},
};
for (const reportPath of reports) {
	const rawBytes = readFileSync(resolve(app, reportPath), "utf8");
	const report = JSON.parse(rawBytes);
	const historical = HISTORICAL[reportPath];
	if (historical) {
		assert.equal(
			createHash("sha256").update(rawBytes).digest("hex"),
			historical.sha256,
			`Historical evidence changed: ${reportPath}. It cannot be regenerated; restore the recorded bytes.`,
		);
		console.log(
			`HISTORICAL: ${report.schema} (${reportPath}) is a recorded report, not current-source evidence: ${historical.why}.`,
		);
		continue;
	}
	if (report.schema === "neighbours/bench-choice-probe@1") {
		const summary = JSON.parse(
			readFileSync(
				resolve(app, "public/experiments/bench-choices-summary.json"),
				"utf8",
			),
		);
		assert.deepEqual(
			summary,
			{
				...summarizeBenchStudy(report),
				rawReportSha256: createHash("sha256").update(rawBytes).digest("hex"),
			},
			"Compact bench study differs from original measurements",
		);
	}
	assert(
		[
			"neighbours/evening-profile@1",
			"neighbours/cart-choice-probe@1",
			"neighbours/hf-config-probe@1",
			"neighbours/assistance-probe@1",
			"received-route-study@1",
			"neighbours/bench-choice-probe@1",
		].includes(report.schema),
		"Unknown evidence schema",
	);
	assert(
		report.sources &&
			Object.keys(report.sources).length >=
				(report.schema === "received-route-study@1" ? 4 : 6),
		"Missing evidence source digests",
	);
	if (
		[
			"neighbours/evening-profile@1",
			"neighbours/hf-config-probe@1",
			"neighbours/bench-choice-probe@1",
			"received-route-study@1",
		].includes(report.schema)
	)
		assert.equal(
			report.sourcesStableDuringRun,
			true,
			"Sources changed during recorded measurements",
		);
	for (const [path, expected] of Object.entries(report.sources)) {
		const absolute = resolve(app, path);
		assert(absolute.startsWith(app + sep), "Evidence path leaves application");
		const actual = createHash("sha256")
			.update(readFileSync(absolute))
			.digest("hex");
		assert.equal(
			actual,
			expected,
			`Recorded evidence is stale: ${path}. Rerun the experiment; do not rewrite its digest.`,
		);
	}
	console.log(`PASS: ${report.schema} recorded source digests match`);
}
