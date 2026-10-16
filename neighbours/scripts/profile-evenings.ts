/** Empirical HF evening choices. This is a TypeScript host probe, not a realism score. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { townDiagnostics } from "../src/core/diagnostics.ts";
import { createRuntime, restoreRuntime, type Save } from "../src/core/index.ts";
import { Runtime } from "../src/core/runtime.ts";

function option(name: string, fallback: string): string {
	const index = process.argv.indexOf(name);
	if (index < 0) return fallback;
	const value = process.argv[index + 1];
	if (!value || value.startsWith("--")) throw Error(`${name} needs a value`);
	return value;
}
function integer(value: string, min: number, max: number, label: string) {
	const n = Number(value);
	assert(Number.isSafeInteger(n) && n >= min && n <= max, label);
	return n;
}
const seeds = option("--seeds", "42,73,9,101")
	.split(",")
	.map((value) => integer(value, 0, 0xffff_ffff, "--seeds"));
assert(
	seeds.length > 0 && new Set(seeds).size === seeds.length,
	"Seeds must be unique",
);
const population = integer(
	option("--population", "208"),
	8,
	300,
	"--population",
);
const days = integer(option("--days", "25"), 1, 365, "--days");
const output = option("--output", "");
const checkpointDirectory = option("--checkpoint-directory", "");
const app = resolve(import.meta.dirname, "..");
function sha(text: string) {
	return createHash("sha256").update(text).digest("hex");
}
function sourceDigests() {
	const paths = [
		"package.json",
		"package-lock.json",
		"scripts/profile-evenings.ts",
		"src/contracts.ts",
		"src/experiments/inspection.ts",
		...readdirSync(resolve(app, "src/core"))
			.filter((p) => p.endsWith(".ts"))
			.map((p) => `src/core/${p}`),
	];
	return Object.fromEntries(
		paths
			.sort()
			.map((path) => [path, sha(readFileSync(resolve(app, path), "utf8"))]),
	);
}
const sources = sourceDigests();
const sourceFingerprint = sha(JSON.stringify(sources));
const verbs = ["propose", "prepare", "host", "accept", "attend", "decline"];
function verb(id: string) {
	const v = id.split(":")[0] ?? "";
	return verbs.includes(v) ? v : undefined;
}
function health(s: Save) {
	const alive = s.people.filter((p) => p.person.body.alive);
	return {
		at: s.now,
		alive: alive.length,
		dead: s.people.length - alive.length,
		lowHealth: alive.filter((p) => p.person.body.health < 0.25).length,
		underfed: alive.filter((p) => p.person.body.satiety < 0.1).length,
		minimumHealth: Math.min(...alive.map((p) => p.person.body.health)),
		minimumSatiety: Math.min(...alive.map((p) => p.person.body.satiety)),
	};
}
function packet(s: Save) {
	assert.deepEqual(s.pending, [], "Capture only complete rounds");
	return { schema: "neighbours/concordia@1", rounds: s.round, runtime: s };
}
function run(seed: number) {
	const started = performance.now();
	const runtime = new Runtime(createRuntime(seed, population).export() as Save);
	const chosen: Record<string, number> = {};
	const startedActions: Record<string, number> = {};
	const knownParticipation: Record<string, Record<string, number>> = {};
	const candidateActions: Record<string, Record<string, number>> = {};
	const traces: Record<string, unknown[]> = {};
	const diagnostics: Record<
		string,
		{ severity: string; boundaries: number; firstAt: number; message: string }
	> = {};
	const checkpoints: Record<
		string,
		{ path: string; at: number; round: number; sha256: string }
	> = {};
	let minimumAlive = population,
		maximumLowHealth = 0,
		maximumUnderfed = 0;
	let finalHealth = health(runtime.s);
	for (let round = 0; round < days * 96; round++) {
		for (const id of runtime.prepareRound()) {
			const person = runtime.actor(id);
			const near = (runtime.s.socialEvenings?.events ?? []).filter(
				(e) =>
					e.organiserId === id &&
					runtime.s.now >= e.startsAt - 120 &&
					runtime.s.now <= e.endsAt,
			);
			const offered = near.length
				? runtime
						.affordances(id)
						.filter((o) => verb(o.id))
						.map((o) => o.id)
				: [];
			const previousJob = person.job?.offer.id;
			const action = runtime.choose(id),
				v = verb(action);
			if (v) {
				if (action !== previousJob)
					startedActions[v] = (startedActions[v] ?? 0) + 1;
				chosen[v] = (chosen[v] ?? 0) + 1;
				const candidate = action.slice(action.indexOf(":") + 1);
				candidateActions[candidate] ??= {};
				const actions = candidateActions[candidate];
				actions[v] = (actions[v] ?? 0) + 1;
				if (person.known) {
					knownParticipation[id] ??= {};
					const actions = knownParticipation[id];
					actions[v] = (actions[v] ?? 0) + 1;
				}
			}
			for (const e of near) {
				const list = traces[e.id] ?? [];
				traces[e.id] = list;
				list.push({
					at: runtime.s.now,
					actor: id,
					chosen: action,
					offered,
					considered: person.record?.considered
						.filter((c) => c.affordanceId.endsWith(`:${e.id}`))
						.map((c) => ({
							id: c.affordanceId,
							utility: c.utility,
							terms: c.terms,
						})),
					reason: person.record?.narration,
				});
				if (list.length > 8) list.splice(4, 1);
			}
			runtime.apply(id, action);
		}
		if (checkpointDirectory) {
			const candidates = runtime.s.socialEvenings?.events ?? [];
			const milestones = {
				notice: candidates.some((e) => e.notice),
				cartProgress: (runtime.s.handcart?.progress ?? 0) > 0,
				cartReturned: !!runtime.s.handcart?.handover,
				accepted: candidates.some((e) =>
					Object.values(e.replies).some((r) => r.reply === "accepted"),
				),
				prepared: candidates.some((e) => e.stage === "prepared"),
			};
			for (const [milestone, reached] of Object.entries(milestones)) {
				if (!reached || checkpoints[milestone]) continue;
				mkdirSync(checkpointDirectory, { recursive: true });
				const path = resolve(
					checkpointDirectory,
					`seed-${seed}-first-${milestone}.json`,
				);
				const encoded = JSON.stringify(packet(runtime.export() as Save));
				writeFileSync(path, `${encoded}\n`);
				checkpoints[milestone] = {
					path,
					at: runtime.s.now,
					round: runtime.s.round,
					sha256: sha(`${encoded}\n`),
				};
			}
		}
		if ((round + 1) % 96 === 0) {
			finalHealth = health(runtime.s);
			minimumAlive = Math.min(minimumAlive, finalHealth.alive);
			maximumLowHealth = Math.max(maximumLowHealth, finalHealth.lowHealth);
			maximumUnderfed = Math.max(maximumUnderfed, finalHealth.underfed);
			for (const d of townDiagnostics(runtime.s)) {
				const entry = diagnostics[d.code] ?? {
					severity: d.severity,
					boundaries: 0,
					firstAt: runtime.s.now,
					message: d.message,
				};
				diagnostics[d.code] = entry;
				entry.boundaries++;
			}
		}
	}
	const checkpoint = runtime.export() as Save;
	let restoredContinuation: {
		passed: boolean;
		rounds: number;
		error?: string;
	} = { passed: false, rounds: 8 };
	try {
		const restored = restoreRuntime(checkpoint);
		for (let i = 0; i < 8; i++) {
			runtime.step();
			restored.step();
		}
		assert.deepEqual(restored.export(), runtime.export());
		restoredContinuation = { passed: true, rounds: 8 };
	} catch (error) {
		restoredContinuation.error =
			error instanceof Error ? error.message : String(error);
	}
	const candidates = (checkpoint.socialEvenings?.events ?? []).map((e) => {
		const others = Object.entries(e.replies).filter(
			([id]) => id !== e.organiserId,
		);
		const withMethods = others.filter(
			([id, r]) =>
				r.delivered &&
				checkpoint.people.some(
					(p) =>
						p.person.id === id && (p.person.methods?.rules.length ?? 0) > 0,
				),
		);
		return {
			id: e.id,
			kind: e.kind,
			organiserId: e.organiserId,
			startsAt: e.startsAt,
			stage: e.stage,
			notice: !!e.notice,
			booking: !!e.bookingEvent,
			heard: others.length,
			accepted: others.filter(([, r]) => r.reply === "accepted").length,
			declined: others.filter(([, r]) => r.reply === "declined").length,
			attempted: others.filter(([, r]) => r.attempted).length,
			delivered: others.filter(([, r]) => r.delivered).length,
			methodLearners: withMethods.length,
			knownParticipation: checkpoint.people
				.filter((p) => p.known && e.replies[p.person.id])
				.map((p) => ({ id: p.person.id, ...e.replies[p.person.id] })),
			chosenActions: candidateActions[e.id] ?? {},
			organiserTraces: traces[e.id] ?? [],
			result: e.result?.text,
		};
	});
	const errors = Object.entries(diagnostics).filter(
		([, d]) => d.severity === "error",
	);
	const result = {
		seed,
		population,
		elapsedDays: days,
		at: checkpoint.now,
		rounds: checkpoint.round,
		hf: checkpoint.hf,
		hallSafe: checkpoint.hallSafe,
		activatedAt: checkpoint.socialEvenings?.openedAt ?? null,
		candidates,
		chosenActions: chosen,
		startedActions,
		handcart: checkpoint.handcart ?? null,
		knownParticipation,
		methodLearners: checkpoint.people.filter(
			(p) => (p.person.methods?.rules.length ?? 0) > 0,
		).length,
		health: {
			final: finalHealth,
			minimumAliveAtDailyBoundaries: minimumAlive,
			maximumLowHealthAtDailyBoundaries: maximumLowHealth,
			maximumUnderfedAtDailyBoundaries: maximumUnderfed,
		},
		diagnostics,
		restoredContinuation,
		checkpoints,
		finalCheckpointSha256: sha(JSON.stringify(packet(checkpoint))),
		wallSeconds: (performance.now() - started) / 1000,
	};
	if (errors.length || !restoredContinuation.passed) process.exitCode = 1;
	console.log(
		JSON.stringify({
			seed,
			at: result.at,
			activatedAt: result.activatedAt,
			chosenActions: chosen,
			candidates: candidates.map((e) => ({
				id: e.id,
				stage: e.stage,
				accepted: e.accepted,
				attempted: e.attempted,
				delivered: e.delivered,
			})),
			health: finalHealth,
			diagnosticErrors: errors.length,
			restoredContinuation,
		}),
	);
	return result;
}
const results = seeds.map(run);
const endSources = sourceDigests();
const report = {
	schema: "neighbours/evening-profile@1",
	runtime: "typescript-host-released-hf",
	arguments: { seeds, population, days },
	node: process.version,
	sourceFingerprint,
	sources,
	sourcesStableDuringRun:
		JSON.stringify(sources) === JSON.stringify(endSources),
	limitations: [
		"Requested seeds are scenario measurements, not statistical or human-realism proof.",
		"Checkpoints use the Python-compatible packet schema; this profiler does not execute Python Concordia.",
		"Health and diagnostics are sampled at daily boundaries. Up to eight organiser traces per candidate retain the first four and last four choices in the two hours before its scheduled hour and that hour. Choice totals include continuation reviews; startedActions excludes those continuations.",
		"Method learners are delivered participants retaining methods at the final boundary; they may have learned those methods earlier.",
	],
	results,
};
if (!report.sourcesStableDuringRun) process.exitCode = 1;
if (output) {
	mkdirSync(dirname(resolve(output)), { recursive: true });
	writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
	console.log(
		JSON.stringify({
			output: resolve(output),
			sourceFingerprint,
			sourcesStableDuringRun: report.sourcesStableDuringRun,
		}),
	);
} else console.log(JSON.stringify(report));
