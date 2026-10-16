/** Native JSON-lines transport. stdout is reserved for protocol replies. */
import { createInterface } from "node:readline";
import { RuntimePort } from "../src/bridge-port.ts";

function argument(name: string, fallback: number): number {
	const index = process.argv.indexOf(name);
	return index < 0 ? fallback : Number(process.argv[index + 1]);
}
const port = new RuntimePort(
	argument("--seed", 42),
	argument("--population", 208),
);
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of lines) {
	let seq: unknown = null;
	let result: unknown;
	try {
		const envelope = JSON.parse(line);
		seq = envelope.seq;
		if (
			!Number.isSafeInteger(seq) ||
			!envelope.request ||
			typeof envelope.request !== "object"
		) {
			throw new Error("Invalid request envelope");
		}
		result = port.dispatch(envelope.request);
	} catch (error) {
		result = { error: error instanceof Error ? error.message : String(error) };
	}
	process.stdout.write(`${JSON.stringify({ seq, result })}\n`);
}
