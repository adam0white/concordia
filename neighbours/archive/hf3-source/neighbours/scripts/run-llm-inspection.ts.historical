/** Native authenticated comparison. Model secrets and session IDs never enter artifacts. */
import { execFileSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import {
	buildInspectionPrompt,
	INSPECTION_SYSTEM_PROMPT,
	parseInspectionResponse,
	safeClaudeProvenance,
} from "../src/experiments/llm.ts";
import {
	runInspectionExperiment,
	scoreInspection,
} from "../src/experiments/runner.ts";

function argument(name: string, fallback: string): string {
	const i = process.argv.indexOf(name);
	return i < 0 ? fallback : (process.argv[i + 1] ?? fallback);
}
const model = argument("--model", "opus");
const output = resolve(
	argument("--output", "/tmp/neighbours-llm-inspection.json"),
);
const baseline = runInspectionExperiment(Number(argument("--seed", "19")));
const reference = baseline.arms[0];
if (!reference) throw Error("Missing baseline cases");
const directory = mkdtempSync(`${tmpdir()}/neighbours-model-`);
const calls = [];
try {
	for (const trial of reference.cases) {
		const prompt = buildInspectionPrompt(trial.observation);
		const started = performance.now();
		const raw = execFileSync(
			argument("--claude", "claude"),
			[
				"--print",
				"--model",
				model,
				"--effort",
				"low",
				"--output-format",
				"json",
				"--tools",
				"",
				"--disable-slash-commands",
				"--strict-mcp-config",
				"--mcp-config",
				'{"mcpServers":{}}',
				"--setting-sources",
				"",
				"--no-session-persistence",
				"--no-chrome",
				"--system-prompt",
				INSPECTION_SYSTEM_PROMPT,
				"--",
				prompt,
			],
			{
				cwd: directory,
				encoding: "utf8",
				timeout: 90000,
				maxBuffer: 2 * 1024 * 1024,
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		const envelope = JSON.parse(raw);
		const provenance = safeClaudeProvenance(envelope, model);
		const choice = parseInspectionResponse(
			envelope.result,
			trial.observation.contextId,
		);
		const score = scoreInspection(trial.truth, choice.action);
		calls.push({
			observation: trial.observation,
			truth: trial.truth,
			choice,
			score,
			prompt,
			rawResponse: envelope.result,
			provenance,
			wallMs: Math.round(performance.now() - started),
		});
		process.stderr.write(
			`Validated ${trial.observation.contextId}: ${choice.action}\n`,
		);
	}
	const report = {
		schema: "hall-inspection-llm-comparison@1",
		recordedAt: new Date().toISOString(),
		seed: baseline.seed,
		systemPrompt: INSPECTION_SYSTEM_PROMPT,
		execution:
			"Four fresh native model calls; no tools, no policy fallback, no browser live LLM agents.",
		baseline,
		calls,
		summary: {
			policy: "llm",
			cases: calls.length,
			completed: calls.filter((c) => c.score.completed).length,
			unsafe: calls.filter((c) => !c.score.safe).length,
			asked: calls.filter((c) => c.choice.action === "ask-inspector").length,
		},
		limits: [
			...baseline.limits.filter((l) => !l.startsWith("No LLM arm")),
			"One model run per case is a demonstration, not a population-level performance estimate.",
			"The model has pretrained semantic knowledge; HF and the table learn only the two authored mappings.",
			"All policies receive the same observation values, action descriptions and demonstrated mappings; policy representations and prior knowledge differ.",
			"Raw responses here contain only task answers; CLI session IDs and credentials are deliberately omitted.",
			"Reported CLI cost is provider metadata, not a verified invoice charge.",
		],
	};
	mkdirSync(dirname(output), { recursive: true });
	writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
	// Read back the public serialization rather than claiming an unwritten artifact.
	JSON.parse(readFileSync(output, "utf8"));
	process.stdout.write(
		`${JSON.stringify({
			output,
			summary: report.summary,
			models: [...new Set(calls.flatMap((c) => c.provenance.models))],
		})}\n`,
	);
} finally {
	rmSync(directory, { recursive: true, force: true });
}
