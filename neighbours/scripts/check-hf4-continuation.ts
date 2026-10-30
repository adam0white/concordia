/** Bounded current HF4 engineering proof. Run under the ordinary native suite
 * lease. No old3 trajectory, policy study, model call or elapsed-day claim.
 * Every actual public Run step request/response is retained, including restore
 * validation replay. Complete initial/checkpoint/both continued outputs survive.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statfsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { replay } from "@adam0white/human-framework";
import { TownRunOwner } from "../src/core/hf4-owner.ts";
import { createRuntime, restoreRuntime } from "../src/core/index.ts";
import type { NativeTownArchive } from "../src/core/runtime.ts";

const output = process.argv[2];
assert(output, "Supply a new proof directory");
const rounds = Number(process.argv[3] ?? 1);
assert(
	Number.isSafeInteger(rounds) && rounds >= 1 && rounds <= 96,
	"Choose 1..96 actual rounds",
);
const directory = resolve(output);
mkdirSync(directory, { recursive: false });
const records: {
	path: string;
	bytes: number;
	sha256: string;
	compressedBytes: number;
	phase: string;
}[] = [];
let phase = "construction",
	sequence = 0;
function retain(name: string, value: unknown) {
	const raw = Buffer.from(JSON.stringify(value));
	const compressed = gzipSync(raw);
	const path = `${name}.json.gz`;
	writeFileSync(resolve(directory, path), compressed, { flag: "wx" });
	assert.deepEqual(readFileSync(resolve(directory, path)), compressed);
	records.push({
		path,
		phase,
		bytes: raw.length,
		compressedBytes: compressed.length,
		sha256: createHash("sha256").update(raw).digest("hex"),
	});
}
const advance = TownRunOwner.prototype.advance;
const priorSink = TownRunOwner.onStepRequest;
TownRunOwner.onStepRequest = (request) =>
	retain(`step-${String(sequence).padStart(6, "0")}-request`, request);
TownRunOwner.prototype.advance = function (until, resolutions = []) {
	const index = String(++sequence).padStart(6, "0");
	const start = performance.now();
	try {
		const disk = statfsSync(directory);
		assert(
			disk.bavail * disk.bsize >= 5 * 1024 ** 3,
			"Stopped proof below 5GiB free; no capacity/API conclusion",
		);
		const result = advance.call(this, until, resolutions);
		retain(`step-${index}`, {
			request: this.lastRequest,
			response: result,
			elapsedMs: performance.now() - start,
		});
		return result;
	} catch (error) {
		retain(`step-${index}-failed`, {
			request: this.lastRequest,
			error:
				error instanceof Error
					? { name: error.name, message: error.message, stack: error.stack }
					: String(error),
			elapsedMs: performance.now() - start,
		});
		throw error;
	}
};
const started = performance.now();
try {
	const live = createRuntime(42, 206);
	retain("initial", live.export());
	phase = "first15";
	for (let round = 0; round < rounds; round++) {
		live.step();
		if (round === 0) retain("first15", live.export());
	}
	const checkpoint = live.export() as NativeTownArchive;
	assert.equal(checkpoint.physical.now, 480 + 15 * rounds);
	assert.equal(Object.keys(checkpoint.owner.run.current.people).length, 206);
	retain("checkpoint", checkpoint);
	phase = "uninterrupted-continuation";
	live.step();
	const continued = live.export() as NativeTownArchive;
	retain("uninterrupted-final", continued);
	assert.equal(continued.physical.now, 480 + 15 * (rounds + 1));
	phase = "cold-restore";
	const cold = restoreRuntime(JSON.parse(JSON.stringify(checkpoint)));
	assert.deepEqual(cold.export(), checkpoint);
	phase = "cold-continuation";
	cold.step();
	const restored = cold.export() as NativeTownArchive;
	retain("cold-final", restored);
	assert.deepEqual(restored, continued);
	phase = "public-replay";
	const nativeReplay = replay(JSON.parse(JSON.stringify(restored.owner.run)));
	retain("native-replay-result", nativeReplay);
	assert(nativeReplay.ok, "Published replay rejected the complete current Run");
	retain("result", {
		ok: true,
		people: 206,
		rounds,
		checkpointAt: 480 + 15 * rounds,
		continuedAt: 480 + 15 * (rounds + 1),
		elapsedMs: performance.now() - started,
		rssBytes: process.memoryUsage().rss,
		nativeSteps: sequence,
	});
} catch (error) {
	retain("failure", {
		error:
			error instanceof Error
				? { name: error.name, message: error.message, stack: error.stack }
				: String(error),
		elapsedMs: performance.now() - started,
		rssBytes: process.memoryUsage().rss,
	});
	process.exitCode = 1;
} finally {
	TownRunOwner.prototype.advance = advance;
	TownRunOwner.onStepRequest = priorSink;
	writeFileSync(
		resolve(directory, "manifest.json"),
		JSON.stringify(
			{
				scope: `Actual complete current HF4 206-person ${rounds} rounds plus useful cold continuation. Only rounds=96 measures a full elapsed day. No historical-science parity claim.`,
				node: process.version,
				records,
			},
			null,
			2,
		) + "\n",
		{ flag: "wx" },
	);
}
