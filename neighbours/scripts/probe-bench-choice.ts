/** Fixed natural-town cases. Actual Node host/HF continuation; no Python or model calls. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
	type Affordance,
	abandonGoal,
	consequenceEvidence,
	type DecisionRecord,
	decide,
	FRAMEWORK_VERSION,
	type Person,
	restore,
	snapshot,
	trustOf,
} from "@adam0white/human-framework";
import type { TownEvent } from "../src/contracts.ts";
import type { BenchSlot } from "../src/core/bench-window.ts";
import { restoreRuntime, type Save } from "../src/core/index.ts";
import type { Runtime } from "../src/core/runtime.ts";
import { summarizeBenchStudy } from "../src/ui/bench-study-report.ts";
import { benchWindowShiftRounds, captureBench } from "./capture-bench.ts";

const SEEDS = [42, 73] as const;
/**
 * Seeds kept in the study with no natural case under current physics (lead decision, 2026-10-18). The probe
 * re-searches each one and fails if a natural case appears, so the record cannot go stale. Never substituted.
 */
const NO_CASE_SEEDS = [101] as const;
const NO_CASE = /^No natural premise-admissible boundary/;
const SLOTS: BenchSlot[] = ["soon", "tomorrow", "brief"];
const ROUNDS = 192;
const app = resolve(import.meta.dirname, "..");
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const sourcePaths = [
	"package.json",
	"package-lock.json",
	"scripts/probe-bench-choice.ts",
	"scripts/capture-bench.ts",
	"src/contracts.ts",
	"src/ui/bench-study-report.ts",
	"src/experiments/inspection.ts",
	...readdirSync(resolve(app, "src/core"))
		.filter((name) => name.endsWith(".ts"))
		.map((name) => `src/core/${name}`),
].sort();
const sources = () =>
	Object.fromEntries(
		sourcePaths.map((path) => [
			path,
			sha(readFileSync(resolve(app, path), "utf8")),
		]),
	);
const git = (...args: string[]) =>
	execFileSync("git", args, { cwd: app, encoding: "utf8" }).trim();
function recordView(record: DecisionRecord) {
	return {
		chosen: record.chosenAffordanceId,
		recordedCount: record.considered.length,
		considered: record.considered.map((c) => ({
			id: c.affordanceId,
			action: c.action,
			utility: c.utility,
			terms: c.terms,
		})),
	};
}
function choiceControls(host: Runtime) {
	const r = host.actor("ravi"),
		offers = host.affordances("ravi"),
		goalId = host.s.handcart?.raviGoalId;
	assert(goalId);
	const original = snapshot(r.person);
	const score = (change: (person: Person) => void) => {
		const p = restore(original);
		change(p);
		const diagnosticStart = snapshot(p);
		const perOfferDiagnostics = offers
			.filter((offer) => offer.action.startsWith("cart-"))
			.map((offer) => {
				const diagnostic = decide(restore(diagnosticStart), [offer], {
					scarcity: Math.max(0, 1 - r.wealth / 8),
				});
				const actual = diagnostic.considered.find(
					(c) => c.affordanceId === offer.id,
				);
				assert(
					actual,
					"Single-offer diagnostic omitted its supplied actual offer",
				);
				return {
					id: actual.affordanceId,
					action: actual.action,
					utility: actual.utility,
					terms: actual.terms,
				};
			});
		return {
			goal: structuredClone(p.agenda.goals.find((g) => g.id === goalId)),
			perOfferDiagnostics,
			...recordView(
				decide(p, offers, { scarcity: Math.max(0, 1 - r.wealth / 8) }),
			),
		};
	};
	const intact = score(() => {});
	const removed = score((p) => {
		delete p.prospection;
	});
	const modeOff = score((p) => {
		const goal = p.agenda.goals.find((g) => g.id === goalId);
		assert(goal);
		delete goal.temporal;
	});
	const goalRemoved = score((p) => {
		assert(abandonGoal(p, goalId));
	});
	assert.deepEqual(
		intact.goal,
		removed.goal,
		"Knowledge control changed the temporal goal",
	);
	assert.deepEqual(
		snapshot(r.person),
		original,
		"Scoring mutated the live person",
	);
	const ask = offers.find((a) => a.action === "cart-ask");
	return {
		at: host.s.now,
		physicalStateHash: sha(JSON.stringify(host.export())),
		offers,
		sourceTrust: trustOf(r.person, "town-bulletin"),
		receivedEvidence: ask ? consequenceEvidence(r.person, ask) : null,
		arms: { intact, removed, modeOff, goalRemoved },
		withheld: {
			executed: false,
			reason:
				"No production admission API withholds the percept. Removed means actual receipt followed by removal of structured prospection; it is not called withheld.",
		},
	};
}
/** Replay earlier actors normally to the captured Ravi turn; never force a choice or clear a job. */
function decisionBoundary(initial: Save) {
	const h = restoreRuntime(initial) as Runtime;
	assert.equal(h.s.pending.length, 0);
	const ready = h.prepareRound();
	assert(
		ready.includes("ravi"),
		"Frozen checkpoint no longer reaches Ravi's captured decision",
	);
	for (const id of ready) {
		if (id === "ravi") break;
		h.apply(id, h.choose(id));
	}
	assert(h.s.pending.includes("ravi"));
	assert(h.affordances("ravi").some((a) => a.action === "cart-ask"));
	return h;
}
function continueTown(initial: Save, admitted?: Save) {
	const host = decisionBoundary(admitted ?? initial),
		startAt = host.s.now,
		firstEventId = initial.nextEvent;
	const initialAda = initial.people.find((p) => p.person.id === "ada");
	assert(initialAda);
	const adaBefore = initialAda.paidWork?.totalMinutes ?? 0;
	const paidJobs = new Map<number, NonNullable<typeof initialAda.job>>();
	if (initialAda.job?.offer.action === "work")
		paidJobs.set(initialAda.job.event, structuredClone(initialAda.job));
	if (host.actor("ada").job?.offer.action === "work") {
		const job = host.actor("ada").job;
		assert(job);
		paidJobs.set(job.event, structuredClone(job));
	}
	const events = new Map<number, TownEvent>();
	const collect = () => {
		for (const event of host.s.events)
			if (event.id >= firstEventId)
				events.set(event.id, structuredClone(event));
	};
	collect();
	const controls = admitted ? choiceControls(host) : undefined;
	const decisions: {
		at: number;
		actorId: string;
		chosen: string;
		offer: Affordance;
		source: string;
		record: ReturnType<typeof recordView>;
	}[] = [];
	const applyPending = () => {
		for (const id of [...host.s.pending]) {
			const chosen = host.choose(id),
				actor = host.actor(id),
				offer = host.affordances(id).find((a) => a.id === chosen);
			assert(offer);
			if (id === "ravi" || id === "ada") {
				assert(actor.record);
				decisions.push({
					at: host.s.now,
					actorId: id,
					chosen,
					offer: structuredClone(offer),
					source: actor.decision?.source ?? "unknown",
					record: recordView(actor.record),
				});
			}
			host.apply(id, chosen);
			if (id === "ada" && actor.job?.offer.action === "work")
				paidJobs.set(actor.job.event, structuredClone(actor.job));
		}
		collect();
	};
	applyPending();
	for (let round = 1; round < ROUNDS; round++) {
		host.prepareRound();
		applyPending();
	}
	assert.equal(host.s.now - startAt, (ROUNDS - 1) * 15);
	assert.equal(host.s.now - initial.now, 2 * 1440);
	assert.deepEqual(host.s.pending, []);
	const ordered = [...events.values()].sort((a, b) => a.id - b.id),
		cart = host.s.handcart;
	const requests = (cart?.requests ?? []).filter(
		(q) => q.event.id >= firstEventId,
	);
	const work = (cart?.work ?? []).filter((w) => w.event.id >= firstEventId);
	const handover =
		cart?.handover && cart.handover.id >= firstEventId ? cart.handover : null;
	const startJob = initial.people.find((p) => p.person.id === "ada")?.job;
	const endPacket = {
		schema: "neighbours/concordia@1",
		rounds: host.s.round,
		runtime: host.export(),
	};
	const actualPaidMinutes =
		(host.actor("ada").paidWork?.totalMinutes ?? 0) - adaBefore;
	const paidReceipts = ordered.filter(
		(e) =>
			e.kind === "completed" &&
			e.actorId === "ada" &&
			e.causes.some((cause) => paidJobs.has(cause)),
	);
	assert.equal(
		actualPaidMinutes,
		paidReceipts.length * 60,
		"Ada's completed shift ledger and actual job-linked receipts disagree",
	);
	return {
		startAt,
		admissionAt: admitted?.handcart?.premise?.at ?? null,
		decisionAt: startAt,
		endAt: host.s.now,
		completedRounds: ROUNDS,
		fullIntervalMinutes: host.s.now - initial.now,
		initialStateHash: sha(JSON.stringify(initial)),
		branchStartCheckpointSha256: sha(
			JSON.stringify({
				schema: "neighbours/concordia@1",
				rounds: (admitted ?? initial).round,
				runtime: admitted ?? initial,
			}),
		),
		finalCheckpointSha256: sha(JSON.stringify(endPacket)),
		controls,
		chain: {
			notice: cart?.premise?.event ?? null,
			receivedNotice: cart?.premise?.received ?? false,
			raviFirstDecision: decisions.find((d) => d.actorId === "ravi") ?? null,
			requests,
			receivedReplies: requests
				.filter((q) => q.replyEvent)
				.map((q) => ({ reply: q.reply, event: q.replyEvent })),
			actualMainBenchWork: work.filter((w) => w.mode === "main"),
			allCartWork: work,
			handover,
			startingCartProgress: initial.handcart?.progress ?? 0,
			endingCartProgress: cart?.progress ?? 0,
			ada: {
				paidMinutesCompleted: actualPaidMinutes,
				completedPaidShiftReceipts: paidReceipts,
				paidJobsStarted: [...paidJobs.values()].filter(
					(job) => job.event >= firstEventId,
				),
				jobAtStart: startJob ?? null,
				jobAtEnd: host.actor("ada").job ?? null,
			},
		},
		decisions,
		events: ordered,
		outcome: {
			returned: !!handover,
			mainBenchWorkPeriods: work.filter((w) => w.mode === "main").length,
			newRequests: requests.length,
			newReceivedAgreements: requests.filter((q) => q.reply === "agree").length,
			adaPaidMinutesCompleted: actualPaidMinutes,
		},
	};
}
export function runBenchChoiceProbe(
	outputPath: string,
	checkpointDirectory: string,
	requireClean = false,
	summaryOutput?: string,
) {
	assert.equal(
		FRAMEWORK_VERSION,
		"2.6.0",
		"Install exact published npm HF2.6.0 before this probe",
	);
	const beforeSources = sources(),
		commit = git("rev-parse", "HEAD"),
		status = git("status", "--porcelain", "--untracked-files=all");
	if (requireClean)
		assert.equal(status, "", "Final probe requires a clean worktree");
	mkdirSync(checkpointDirectory, { recursive: true });
	// Freeze every seed before evaluating any slot or outcome. Never resample failures.
	const frozen = SEEDS.map((seed) => {
		const captured = captureBench(seed),
			encoded = JSON.stringify(captured.checkpoint);
		assert.equal(captured.checkpoint.runtime.people.length, 8);
		assert.deepEqual(captured.checkpoint.runtime.pending, []);
		const name = `bench-start-${seed}.json`;
		writeFileSync(resolve(checkpointDirectory, name), `${encoded}\n`);
		return {
			seed,
			checkpoint: captured.checkpoint,
			captureEvidence: captured.captureEvidence,
			file: name,
			sha256: sha(encoded),
		};
	});
	const noNaturalCase = NO_CASE_SEEDS.map((seed) => {
		let found = false;
		try {
			captureBench(seed);
			found = true;
		} catch (error) {
			assert(
				error instanceof Error && NO_CASE.test(error.message),
				`Seed ${seed} capture failed for another reason`,
			);
		}
		assert(
			!found,
			`Seed ${seed} now has a natural case; return it to SEEDS and rerun`,
		);
		const current = benchWindowShiftRounds(seed),
			legacy = benchWindowShiftRounds(seed, true);
		return {
			seed,
			searchedDays: 40,
			population: 8,
			benchWindowRounds: current.windowRounds,
			adaAtShiftRounds: current.adaAtShift,
			legacyBenchWindowRounds: legacy.windowRounds,
			legacyAdaAtShiftRounds: legacy.adaAtShift,
			reason: `No genuine Ravi cart-ask decision with Ada at the workshop within 40 days. Ada was at her workshop shift in ${current.adaAtShift} of ${current.windowRounds} rounds in which a bench proposal was possible; with legacy timber physics, ${legacy.adaAtShift} of ${legacy.windowRounds}.`,
		};
	});
	const frozenSetHash = sha(
		JSON.stringify(frozen.map(({ seed, sha256 }) => ({ seed, sha256 }))),
	);
	// Freeze lawful complete proposal starts before evaluating any outcome.
	const admitted = new Map<string, Save>();
	const activeCheckpoints = frozen.flatMap((f) =>
		SLOTS.map((slot) => {
			const host = restoreRuntime(f.checkpoint.runtime) as Runtime;
			assert.equal(host.s.pending.length, 0);
			host.intervene({
				kind: "propose-bench-window",
				proposal: {
					schema: "neighbours-bench-proposal@1",
					kind: "bench-window",
					slot,
				},
			});
			const ravi = host.actor("ravi");
			assert(
				(ravi.person.prospection?.entries.length ?? 0) > 0,
				"Active-faculty restore control did not acquire a premise",
			);
			const packet = {
				schema: "neighbours/concordia@1",
				rounds: host.s.round,
				runtime: host.export(),
			};
			assert.equal(packet.runtime.pending.length, 0);
			const file = `bench-active-${f.seed}-${slot}.json`,
				encoded = JSON.stringify(packet);
			writeFileSync(resolve(checkpointDirectory, file), `${encoded}\n`);
			admitted.set(`${f.seed}:${slot}`, packet.runtime);
			return {
				seed: f.seed,
				slot,
				file,
				sha256: sha(encoded),
				at: host.s.now,
				received: host.s.handcart?.premise?.received ?? false,
				retainedEntries: ravi.person.prospection?.entries.length ?? 0,
			};
		}),
	);
	const cases = frozen.flatMap((f) => {
		const noProposal = continueTown(f.checkpoint.runtime);
		return SLOTS.map((slot) => {
			const proposalStart = admitted.get(`${f.seed}:${slot}`);
			assert(proposalStart, "Missing frozen complete proposal start");
			return {
				seed: f.seed,
				slot,
				frozenInputSha256: f.sha256,
				noProposal,
				proposal: continueTown(f.checkpoint.runtime, proposalStart),
			};
		});
	});
	const afterSources = sources(),
		stable = JSON.stringify(beforeSources) === JSON.stringify(afterSources),
		sameCommit = git("rev-parse", "HEAD") === commit;
	const report = {
		schema: "neighbours/bench-choice-probe@1",
		recordedAt: new Date().toISOString(),
		runtime: "node-typescript-host-released-hf",
		hf: FRAMEWORK_VERSION,
		node: process.version,
		arguments: {
			seeds: SEEDS,
			noCaseSeeds: NO_CASE_SEEDS,
			slots: SLOTS,
			population: 8,
			roundsPerPhysicalBranch: ROUNDS,
		},
		modelCalls: 0,
		sourceCommit: commit,
		sourceWorktreeClean: status === "",
		sourcesStableDuringRun: stable,
		sourceCommitUnchanged: sameCommit,
		sourceFingerprint: sha(JSON.stringify(beforeSources)),
		sources: beforeSources,
		frozenSetHash,
		activeCheckpoints,
		noNaturalCase,
		captures: frozen.map(({ seed, captureEvidence, file, sha256 }) => ({
			seed,
			captureEvidence,
			file,
			sha256,
		})),
		assumptions: {
			chance: 0.5,
			confidence: 0.8,
			halfLifeMinutes: 120,
			source: "town-bulletin",
			calibrated: false,
		},
		limitations: [
			"Fresh fixed-seed captures contain eight actual HF residents. They are not forced-success fixtures, population averages or evidence of realism.",
			"This probe runs the actual TypeScript physical host and published HF under Node. It does not run Python Concordia or a live model; native/WASM parity is a separate check.",
			"Both natural complete checkpoints and six lawful complete proposal starts are frozen before any outcome evaluation. Seed 101 is kept in the study as a recorded no-case (noNaturalCase): it was searched again and had no natural case in 40 days; no other seed was substituted. Proposal admission occurs before prepareRound, as in the browser. Each case scores the real next Ravi turn after earlier actors choose normally.",
			"Each bench-active checkpoint file is the exact complete start of its physical proposal branch, including actual retained HF knowledge. admissionAt records the complete-boundary notice; decisionAt/startAt records Ravi's later actual decision.",
			"The physical proposal/no-proposal contrast combines temporal-goal opt-in, received knowledge, one spent allowance and possible legal request-window changes. It does not isolate knowledge causally.",
			"The person-only intact/removed comparison holds actual legal offers, the entire physical state and temporal goals fixed. Removed deletes structured prospection after actual receipt; no withheld arm was executed.",
			"Full-offer decision records retain only HF's top-ranked alternatives. An unrecorded offer was not necessarily unevaluated. perOfferDiagnostics separately supplies each same actual cart offer alone to a fresh person clone to expose its terms; those diagnostic choices are not enacted or presented as full-choice decisions.",
			"Mode-off retains received knowledge while removing temporal valuation. Goal-removed abandons only Ravi's cart goal. These are different controls, not knowledge-only contrasts.",
			"Two-day Node continuations record events after every completed round to avoid the host's rolling-event pruning. They cover this interval only; jobs may span its boundaries.",
			"Returned is a new handover receipt within the interval; its absence is not proof that the cart can never be returned. Asking, agreement, work and delivery are separate observed outcomes.",
			"Successor chance0.5 and confidence0.8 are frozen engineering assumptions, not an Ada-consent model or fitted psychological estimates. Current learned action success and source trust are reported separately.",
		],
		cases,
	};
	mkdirSync(dirname(resolve(outputPath)), { recursive: true });
	const rawReportText = `${JSON.stringify(report, null, 2)}\n`;
	writeFileSync(outputPath, rawReportText);
	if (summaryOutput) {
		assert.notEqual(
			resolve(summaryOutput),
			resolve(outputPath),
			"Summary must not replace the original report",
		);
		const summary = {
			...summarizeBenchStudy(report),
			rawReportSha256: sha(rawReportText),
		};
		mkdirSync(dirname(resolve(summaryOutput)), { recursive: true });
		writeFileSync(summaryOutput, `${JSON.stringify(summary, null, 2)}\n`);
	}
	assert(
		stable && sameCommit,
		"Sources or commit changed during probe; report is not final evidence",
	);
	return report;
}
if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
	const value = (flag: string) => {
		const i = process.argv.indexOf(flag);
		assert(i >= 0 && process.argv[i + 1], `Use ${flag} PATH`);
		return resolve(process.argv[i + 1] as string);
	};
	const report = runBenchChoiceProbe(
		value("--output"),
		value("--checkpoint-directory"),
		process.argv.includes("--require-clean"),
		process.argv.includes("--summary-output")
			? value("--summary-output")
			: undefined,
	);
	console.log(
		JSON.stringify({
			output: value("--output"),
			sourceFingerprint: report.sourceFingerprint,
			frozenSetHash: report.frozenSetHash,
			cases: report.cases.map((c) => ({
				seed: c.seed,
				slot: c.slot,
				controlChoice: c.proposal.controls?.arms.intact.chosen,
				removedChoice: c.proposal.controls?.arms.removed.chosen,
				outcome: c.proposal.outcome,
			})),
		}),
	);
}
