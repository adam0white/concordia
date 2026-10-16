/** Authenticated local CLI calls only. No credentials or session envelope is retained. */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { safeClaudeProvenance } from "./llm.ts";
import type { ModelReply } from "./mixed-native.ts";
export function callClaudeTown(prompt: string, model = "opus"): ModelReply {
	const directory = mkdtempSync(`${tmpdir()}/neighbours-town-model-`);
	try {
		const raw = execFileSync(
			"claude",
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
				"You control one person in a fictional town. Choose only a supplied legal action. Return exactly the requested JSON object as plain text, starting with { and ending with }. Do not use Markdown fences or add commentary. Your words do not change physical outcomes.",
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
		return {
			rawResponse: envelope.result,
			provenance: safeClaudeProvenance(envelope, model),
		};
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}
