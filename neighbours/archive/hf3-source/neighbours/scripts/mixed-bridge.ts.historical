import { createInterface } from "node:readline";
import { callClaudeTown } from "../src/experiments/claude-native.ts";
import { MixedPort } from "../src/experiments/mixed-native.ts";

function arg(name: string, fallback: string) {
	const i = process.argv.indexOf(name);
	return i < 0 ? fallback : (process.argv[i + 1] ?? fallback);
}
const mode = arg("--mode", "live");
if (mode !== "live" && mode !== "replay") throw Error("Invalid mode");
const port = new MixedPort(
	Number(arg("--seed", "42")),
	Number(arg("--population", "8")),
	arg("--actor", "ada"),
	mode,
	(prompt) => callClaudeTown(prompt, arg("--model", "opus")),
);
for await (const line of createInterface({
	input: process.stdin,
	crlfDelay: Infinity,
})) {
	let seq: unknown = null,
		result: unknown;
	try {
		const envelope = JSON.parse(line);
		seq = envelope.seq;
		if (!Number.isSafeInteger(seq)) throw Error("Invalid sequence");
		result = port.dispatch(envelope.request);
	} catch (error) {
		result = { error: error instanceof Error ? error.message : String(error) };
	}
	process.stdout.write(`${JSON.stringify({ seq, result })}\n`);
}
