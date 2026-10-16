/** Matched local HF assistance controls. Checkpoints stay outside the report. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { canReceiveInspectionRequest } from "../src/core/assistance.ts";
import { restoreRuntime, type Save } from "../src/core/index.ts";
import type { Runtime } from "../src/core/runtime.ts";

const app = resolve(import.meta.dirname, "..");
const rounds = 96;
const continuationRounds = 16;
const methodId = "hall-section-inspection";
function sha(value: string | Buffer): string {
	return createHash("sha256").update(value).digest("hex");
}
export function assistanceSourceDigests() {
	const paths = [
		"package.json",
		"package-lock.json",
		"scripts/probe-assistance.ts",
		"src/contracts.ts",
		"src/experiments/inspection.ts",
		...readdirSync(resolve(app, "src/core"))
			.filter((path) => path.endsWith(".ts"))
			.map((path) => `src/core/${path}`),
	];
	return Object.fromEntries(
		paths.sort().map((path) => [path, sha(readFileSync(resolve(app, path)))]),
	);
}
function runtimeSave(checkpoint: unknown): Save {
	assert(
		checkpoint && typeof checkpoint === "object",
		"Checkpoint must be an object",
	);
	const input = checkpoint as { runtime?: unknown };
	const runtime = restoreRuntime(input.runtime ?? checkpoint) as Runtime;
	assert(
		runtime.s.pending.length === 0,
		"Use a checkpoint at a complete round boundary",
	);
	assert(
		runtime.s.people.every((r) => r.policy === "hf"),
		"This probe requires an HF-only checkpoint; mixed controllers are not silently replaced",
	);
	return runtime.export() as Save;
}
export function probeAssistance(checkpoint: unknown) {
	const inputDigest = sha(JSON.stringify(checkpoint));
	const original = runtimeSave(checkpoint);
	const originalDigest = sha(JSON.stringify(original));
	const sources = assistanceSourceDigests();
	const screening = original.people
		.filter((r) => r.known && r.person.id !== "lea")
		.map((r) => {
			const rules = (r.person.methods?.rules ?? []).filter(
				(rule) =>
					rule.id === methodId &&
					rule.evidence.some((e) => e.sourceId === "lea"),
			);
			const reasons: string[] = [];
			if (!rules.length)
				reasons.push("No retained hall inspection lesson evidence from Lea");
			if (!canReceiveInspectionRequest(r))
				reasons.push(
					"Recipient is not living and awake outside a sleeping activity",
				);
			if (!original.hallSafe) reasons.push("The main hall is not open");
			if (original.assistance)
				reasons.push(
					"This town already has its one bounded assistance request",
				);
			return {
				id: r.person.id,
				name: r.person.name,
				taughtByLea: rules.length > 0,
				eligible: reasons.length === 0,
				reasons,
				receivedRuleCount: rules.length,
				evidenceSourceIds: [
					...new Set(
						rules.flatMap((rule) => rule.evidence.map((e) => e.sourceId)),
					),
				].sort(),
			};
		});
	assert(screening.length <= 8, "Known-resident probe bound exceeded");
	const candidates = screening
		.filter((r) => r.taughtByLea)
		.map((candidate) => {
			if (!candidate.eligible) return { ...candidate, arms: [] };
			const arms = (
				[
					"received-learned",
					"received-method-ablated",
					"request-withheld",
				] as const
			).map((arm) => {
				const input = structuredClone(original);
				const actor = input.people.find((r) => r.person.id === candidate.id);
				assert(actor);
				const initialRules = structuredClone(actor.person.methods?.rules ?? []);
				if (arm === "received-method-ablated" && actor.person.methods)
					actor.person.methods.rules = actor.person.methods.rules.filter(
						(rule) => rule.id !== methodId,
					);
				const ablationCount =
					initialRules.length - (actor.person.methods?.rules.length ?? 0);
				const repaired = structuredClone(input);
				const repairedActor = repaired.people.find(
					(r) => r.person.id === candidate.id,
				);
				assert(repairedActor);
				if (repairedActor.person.methods)
					repairedActor.person.methods.rules = initialRules;
				assert.deepEqual(
					repaired,
					original,
					"Ablation changed more than this person's selected inspection rules",
				);
				const runtime = restoreRuntime(input) as Runtime;
				const startDigest = sha(JSON.stringify(runtime.export()));
				if (arm !== "request-withheld")
					runtime.intervene({
						kind: "request-inspection",
						actorId: candidate.id,
						proposalOrigin: { kind: "authored" },
						proposal: {
							schema: "neighbours-gm-proposal@1",
							kind: "inspection-request",
							target: "hall-annex",
							cue: "dry-sound",
							windowMinutes: 1440,
						},
					});
				const choices: {
					at: number;
					id: string;
					source: string | undefined;
					offeredCount: number | undefined;
					recordedCount: number | undefined;
				}[] = [];
				for (let round = 0; round < rounds; round++)
					for (const id of runtime.prepareRound()) {
						const chosen = runtime.choose(id);
						if (id === candidate.id)
							choices.push({
								at: runtime.s.now,
								id: chosen,
								source: runtime.actor(id).decision?.source,
								offeredCount: runtime.actor(id).decision?.offeredCount,
								recordedCount: runtime.actor(id).decision?.recordedCount,
							});
						runtime.apply(id, chosen);
					}
				const final = runtime.export() as Save;
				const finalDigest = sha(JSON.stringify(final));
				const restored = restoreRuntime(final) as Runtime;
				for (let n = 0; n < continuationRounds; n++) {
					runtime.step();
					restored.step();
				}
				assert.deepEqual(
					restored.export(),
					runtime.export(),
					"Restored HF continuation differed",
				);
				const a = final.assistance;
				const finalActor = final.people.find(
					(r) => r.person.id === candidate.id,
				);
				assert(finalActor);
				const outcome = {
					arm,
					initialRuntimeSha256: startDigest,
					finalRuntimeSha256: finalDigest,
					removedInspectionRules: ablationCount,
					received: a?.received ?? false,
					visitedAt: a?.visit?.at ?? null,
					resultAt: a?.result?.at ?? null,
					opened: a?.opened ?? false,
					action: a?.action ?? null,
					decisionSource: a?.decisionSource ?? null,
					decisionId: a?.decisionId ?? null,
					methodTerms: a?.methodTerms ?? [],
					capacity: final.places.find((p) => p.id === "hall")?.capacity,
					finalInspectionRuleCount: (
						finalActor.person.methods?.rules ?? []
					).filter((rule) => rule.id === methodId).length,
					choices,
					continuation: { rounds: continuationRounds, exact: true },
				};
				assert.equal(
					sha(JSON.stringify(original)),
					originalDigest,
					"Probe mutated the initial runtime",
				);
				return outcome;
			});
			const [learned, ablated, withheld] = arms;
			assert(learned && ablated && withheld);
			return {
				...candidate,
				arms,
				observations: {
					learnedOpened: learned.opened,
					ablatedOpened: ablated.opened,
					withheldOpened: withheld.opened,
					openingDiffersUnderMethodAblation: learned.opened !== ablated.opened,
					firstChoiceDiffersUnderMethodAblation:
						learned.choices[0]?.id !== ablated.choices[0]?.id,
				},
			};
		});
	assert.equal(
		sha(JSON.stringify(checkpoint)),
		inputDigest,
		"Probe mutated its caller's checkpoint",
	);
	assert.deepEqual(
		assistanceSourceDigests(),
		sources,
		"Probe sources changed during execution",
	);
	return {
		schema: "neighbours/assistance-probe@1",
		runtime:
			"TypeScript host with released HF choices; no Python Concordia or model calls",
		hf: original.hf,
		node: process.version,
		checkpointRuntimeSha256: originalDigest,
		sourceFingerprint: sha(JSON.stringify(sources)),
		sources,
		startAt: original.now,
		endAt: original.now + rounds * 15,
		rounds,
		population: original.people.length,
		screening,
		candidates,
		summary: {
			knownNonLea: screening.length,
			taughtByLea: candidates.length,
			eligible: candidates.filter((r) => r.eligible).length,
			receivedLearnedOpenings: candidates.filter((r) =>
				r.arms.some((arm) => arm.arm === "received-learned" && arm.opened),
			).length,
			methodAblatedOpenings: candidates.filter((r) =>
				r.arms.some(
					(arm) => arm.arm === "received-method-ablated" && arm.opened,
				),
			).length,
			withheldOpenings: candidates.filter((r) =>
				r.arms.some((arm) => arm.arm === "request-withheld" && arm.opened),
			).length,
		},
		limits: [
			"All known non-Lea residents with retained inspection lesson evidence from Lea were screened; nobody was selected by searching for a successful outcome.",
			"One selective checkpoint and one authored dry-annex premise are local case evidence, not a population benchmark, entertainment acceptance or HF superiority claim.",
			"The request is authored. This run makes no generative-model calls and does not test a Concordia GM.",
			"Only the selected person's hall-section-inspection rules are removed initially. Their other acquired state remains; later learning remains possible.",
			"Every simulated choice uses the checkpoint's HF policy. No action, waking state, outcome or score was forced.",
			"The host authors feasible actions and physical consequences. These controls do not demonstrate general planning.",
			"Checkpoint contents and person snapshots are omitted. Digests and bounded fictional-resident outcome summaries are retained.",
		],
	};
}
function option(name: string): string {
	const index = process.argv.indexOf(name);
	const value = process.argv[index + 1];
	assert(
		index >= 0 && value && !value.startsWith("--"),
		`${name} requires a value`,
	);
	return value;
}
if (
	process.argv[1] &&
	resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	const checkpointPath = resolve(option("--checkpoint")),
		outputPath = resolve(option("--output"));
	assert(
		checkpointPath !== outputPath,
		"Output must not replace the checkpoint",
	);
	const bytes = readFileSync(checkpointPath),
		checkpointSha256 = sha(bytes);
	const decoded =
		bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes;
	const report = {
		...probeAssistance(JSON.parse(decoded.toString("utf8"))),
		checkpointSha256,
	};
	assert.equal(
		sha(readFileSync(checkpointPath)),
		checkpointSha256,
		"Checkpoint file changed during the probe",
	);
	mkdirSync(dirname(outputPath), { recursive: true });
	writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
	console.log(
		JSON.stringify({
			output: outputPath,
			...report.summary,
			sourceFingerprint: report.sourceFingerprint,
		}),
	);
}
