/** Reproducible long-run host stress check. This is not an HF realism score. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { createRuntime, restoreRuntime, type Save } from "../src/core/index.ts";

function option(name: string, fallback: string): string {
	const index = process.argv.indexOf(name);
	if (index < 0) return fallback;
	const value = process.argv[index + 1];
	if (!value || value.startsWith("--"))
		throw new Error(`${name} needs a value`);
	return value;
}
function integer(name: string, fallback: number, min: number, max: number) {
	const value = Number(option(name, String(fallback)));
	assert(Number.isSafeInteger(value) && value >= min && value <= max, name);
	return value;
}
const days = integer("--days", 30, 1, 365);
const seed = integer("--seed", 42, 0, 0xffff_ffff);
const population = integer("--population", 206, 8, 300);
const maxDeaths = integer("--max-deaths", population, 0, population);
const runtime = createRuntime(seed, population);
const started = performance.now();
for (let day = 1; day <= days; day++) {
	for (let round = 0; round < 96; round++) runtime.step();
	const view = runtime.view();
	assert.deepEqual(
		view.diagnostics.filter((d) => d.severity === "error"),
		[],
		`Host invariant failure after ${day} elapsed days`,
	);
	if (day % 5 === 0 || day === days) {
		const save = runtime.export() as Save;
		const body = save.people.map((p) => p.person.body);
		console.log(
			JSON.stringify({
				seed,
				population,
				elapsedDays: day,
				wallSeconds: (performance.now() - started) / 1000,
				checkpointBytes: Buffer.byteLength(JSON.stringify(save)),
				dead: body.filter((b) => !b.alive).length,
				veryHungry: body.filter((b) => b.alive && b.satiety < 0.1).length,
				marketMeals: save.places.find((p) => p.id === "market")?.stock,
				stats: view.stats,
			}),
		);
	}
}
const checkpoint = runtime.export();
assert(
	(checkpoint as Save).people.filter((p) => !p.person.body.alive).length <=
		maxDeaths,
	`The scenario exceeded its expected maximum of ${maxDeaths} deaths`,
);
const restoredAt = performance.now();
const restored = restoreRuntime(checkpoint);
const restoreMilliseconds = performance.now() - restoredAt;
for (let round = 0; round < 8; round++) {
	runtime.step();
	restored.step();
}
assert.deepEqual(restored.export(), runtime.export(), "Restored continuation");
const encoded = JSON.stringify(checkpoint);
const output = option("--output", "");
if (output) writeFileSync(output, `${encoded}\n`);
console.log(
	JSON.stringify({
		result: "host stress and exact restored continuation passed",
		days,
		seed,
		population,
		maxDeaths,
		restoreMilliseconds,
		checkpointSha256: createHash("sha256").update(encoded).digest("hex"),
		wallSeconds: (performance.now() - started) / 1000,
	}),
);
