/** Refuse to present measurements from different sources as the current candidate. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve, sep } from "node:path";

const app = resolve(import.meta.dirname, "..");
const reports = process.argv.slice(2);
if (!reports.length)
	reports.push(
		"public/experiments/social-episodes.json",
		"public/experiments/cart-choice-probe.json",
	);
for (const reportPath of reports) {
	const report = JSON.parse(readFileSync(resolve(app, reportPath), "utf8"));
	assert(
		["neighbours/evening-profile@1", "neighbours/cart-choice-probe@1"].includes(
			report.schema,
		),
		"Unknown evidence schema",
	);
	assert(
		report.sources && Object.keys(report.sources).length > 5,
		"Missing evidence source digests",
	);
	if (report.schema === "neighbours/evening-profile@1")
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
