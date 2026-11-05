/** Current six-resident public workload. No 206-person or unlimited-horizon claim. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { gzipSync } from "node:zlib";
import { createRuntime, restoreRuntime } from "../src/core/index.ts";
import type { Runtime } from "../src/core/runtime.ts";
import { decodeSave, encodeSave } from "../src/ui/save-codec.ts";

const output = process.argv[2];
assert(output, "Supply a new public-day proof directory");
mkdirSync(output, { recursive: false });
const start = performance.now();
const live = createRuntime(42, 6) as Runtime;
for (let round = 0; round < 96; round++) live.step();
assert.equal(live.s.people.length, 6);
assert.equal(live.s.round, 96);
const journal = live.exportJournal();
const json = JSON.stringify(journal);
const file = await encodeSave(journal);
const cold = restoreRuntime(await decodeSave(file)) as Runtime;
const native = live.export();
assert.deepStrictEqual(cold.export(), native);
writeFileSync(
	resolve(output, "day.journal.json.gz"),
	new Uint8Array(await file.arrayBuffer()),
);
writeFileSync(
	resolve(output, "day.native.json.gz"),
	gzipSync(JSON.stringify(native)),
);
live.step();
cold.step();
assert.deepStrictEqual(cold.export(), live.export());
writeFileSync(
	resolve(output, "continued.native.json.gz"),
	gzipSync(JSON.stringify(live.export())),
);
const report = {
	scope:
		"public six-person, seed42, 96 rounds without player interventions; one same-next round",
	framework: "4.17.0",
	population: 6,
	rounds: 96,
	rawJournalBytes: Buffer.byteLength(json),
	compressedFileBytes: file.size,
	completeColdNativeHostEquality: true,
	completeSameNextEquality: true,
	elapsedMs: performance.now() - start,
	original206Gates: "unqualified; unchanged research commands run separately",
};
writeFileSync(
	resolve(output, "report.json"),
	JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report));
