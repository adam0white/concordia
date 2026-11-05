/** Consumer control uses only the exact published HF dependency. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { runReceivedConsequenceControl } from "../src/experiments/received-route.ts";

const app = resolve(import.meta.dirname, "..");
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const sources = Object.fromEntries(
	[
		"package.json",
		"package-lock.json",
		"src/experiments/received-route.ts",
		"scripts/probe-received-routes.ts",
	].map((path) => [path, sha(readFileSync(resolve(app, path), "utf8"))]),
);
const cases = (["parcel", "sample"] as const).map(
	runReceivedConsequenceControl,
);
for (const domain of cases) {
	const arm = (name: string) => {
		const result = domain.results.find((r) => r.arm === name);
		assert(result);
		return result;
	};
	assert.equal(arm("useful").chosen, "ask");
	for (const name of [
		"withheld",
		"removed",
		"temporal-off",
		"late",
		"costly",
		"uncertain",
	])
		assert.equal(arm(name).chosen, "direct", `${domain.domain}/${name}`);
	assert.equal(
		arm("goal-removed").considered.some((option) =>
			option.terms.some((term) => term.source.startsWith("goal:")),
		),
		false,
	);
	assert.equal(arm("refused").refusal?.goalProgress, 0);
	assert.equal(arm("refused").refusal?.feasibleAfter, false);
}
const output = process.argv[2];
assert(output, "Supply an output JSON path");
const report = {
	schema: "received-route-study@1",
	recordedAt: new Date().toISOString(),
	execution:
		"Node; exact published npm HF; two fixed structural domains, nine arms each",
	commit: execFileSync("git", ["rev-parse", "HEAD"], {
		cwd: app,
		encoding: "utf8",
	}).trim(),
	dirty: !!execFileSync(
		"git",
		["status", "--porcelain", "--", ...Object.keys(sources)],
		{
			cwd: app,
			encoding: "utf8",
		},
	).trim(),
	sources,
	sourcesStableDuringRun: Object.entries(sources).every(
		([path, digest]) =>
			sha(readFileSync(resolve(app, path), "utf8")) === digest,
	),
	cases,
	limits: [
		"A controlled faculty test, separate from your town. Favorable parameters are engineering assumptions, not measured human probabilities.",
		"The second domain renames the same structure; it is not independent ecological evidence.",
		"Temporal mode changes direct goal time and success valuation. Knowledge ablations keep that same temporal mode; the temporal-off arm measures a separate change.",
		"Asking yields no goal progress and grants no access. Refusal consumes the completed request expectation without making physical work available.",
		"No general planner, waiting opportunity cost, future body prediction, live LLM or guaranteed consent.",
	],
};
assert(
	report.sourcesStableDuringRun,
	"Control sources changed during evaluation",
);
writeFileSync(output, JSON.stringify(report, null, 2));
console.log(
	`PASS: ${cases.reduce((count, item) => count + item.results.length, 0)} published-package arms; ${output}`,
);
