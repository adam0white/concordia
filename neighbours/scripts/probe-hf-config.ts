/** Isolated HF engineering sensitivity controls. Never changes production weights. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as HF from "@adam0white/human-framework";
import { assistanceOffers, observeAssistance } from "../src/core/assistance.ts";
import { updateHandcart } from "../src/core/handcart.ts";
import { createRuntime } from "../src/core/index.ts";
import { Runtime } from "../src/core/runtime.ts";
import type { Save } from "../src/core/state.ts";

const app = resolve(import.meta.dirname, "..");
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
function option(key: string, fallback: string) {
	const i = process.argv.indexOf(key);
	return i < 0 ? fallback : (process.argv[i + 1] ?? fallback);
}
const days = Number(option("--days", "14"));
assert(
	Number.isInteger(days) && days >= 1 && days <= 25,
	"--days must be 1..25",
);
function sources() {
	const paths = [
		"package.json",
		"package-lock.json",
		"scripts/probe-hf-config.ts",
		"src/contracts.ts",
		"src/experiments/inspection.ts",
		...readdirSync(resolve(app, "src/core"))
			.filter((p) => p.endsWith(".ts"))
			.map((p) => `src/core/${p}`),
	];
	return Object.fromEntries(
		paths.sort().map((p) => [p, sha(readFileSync(resolve(app, p), "utf8"))]),
	);
}
function configuration() {
	return Object.fromEntries(
		Object.entries(HF)
			.filter(([key]) => key.endsWith("_DEFAULTS"))
			.map(([key, value]) => [key, structuredClone(value)]),
	);
}
/** Raise only the record retention limit on an independent clone, never a town arm. */
function fullDecision(runtime: Runtime, actorId: string) {
	const s = runtime.export() as Save;
	const normal = new Runtime(structuredClone(s));
	const expanded = new Runtime(structuredClone(s));
	const chosen = normal.choose(actorId);
	const limit = HF.COGNITION_DEFAULTS.maxConsidered;
	try {
		HF.COGNITION_DEFAULTS.maxConsidered = 1000;
		assert.equal(
			expanded.choose(actorId),
			chosen,
			"Logging limit changed the selected offer",
		);
	} finally {
		HF.COGNITION_DEFAULTS.maxConsidered = limit;
	}
	const top = normal.actor(actorId).record;
	const all = expanded.actor(actorId).record;
	assert(top && all);
	const offers = runtime.affordances(actorId).map((o) => o.id);
	assert(
		offers.every((id) => all.considered.some((c) => c.affordanceId === id)),
		"An offered option is missing from full scores",
	);
	assert.deepEqual(top.considered, all.considered.slice(0, limit));
	return {
		chosen,
		offeredIds: offers,
		recordedTop: top.considered,
		allScores: all.considered,
		omittedFromTop: offers.filter(
			(id) => !top.considered.some((c) => c.affordanceId === id),
		),
	};
}
function health(s: Save) {
	return {
		alive: s.people.filter((p) => p.person.body.alive).length,
		underfed: s.people.filter((p) => p.person.body.satiety < 0.1).length,
		minimumSatiety: Math.min(...s.people.map((p) => p.person.body.satiety)),
		brokenPromises: s.people.reduce(
			(n, p) =>
				n +
				p.person.agenda.commitments.filter(
					(c) => c.kind === "promise" && c.status === "broken",
				).length,
			0,
		),
		keptPromises: s.people.reduce(
			(n, p) =>
				n +
				p.person.agenda.commitments.filter(
					(c) => c.kind === "promise" && c.status === "kept",
				).length,
			0,
		),
	};
}
function assistance(
	seed: number,
	arm: "learned" | "methods-ablated" | "request-withheld" | "unsupported",
) {
	const runtime = new Runtime(createRuntime(seed, 8).export() as Save);
	// Explicit authored starting circumstances, not a simulated successful reopening.
	runtime.s.hall = 12;
	runtime.s.hallSafe = true;
	runtime.actor("lea").place = "hall";
	const lea = runtime.actor("lea");
	const initialMethodCount = lea.person.methods?.rules.length ?? 0;
	assert(
		initialMethodCount > 0,
		"Scenario prior-course demonstrations did not create methods",
	);
	if (arm === "methods-ablated" && lea.person.methods)
		lea.person.methods.rules = [];
	if (arm !== "request-withheld")
		runtime.intervene({
			kind: "request-inspection",
			actorId: "lea",
			proposal: {
				schema: "neighbours-gm-proposal@1",
				kind: "inspection-request",
				target: "hall-annex",
				cue: arm === "unsupported" ? "unsupported" : "dry-sound",
				windowMinutes: 240,
			},
		});
	const visitDecision = fullDecision(runtime, "lea");
	if (arm === "request-withheld") {
		assert(!visitDecision.offeredIds.some((id) => id.startsWith("annex-")));
		return {
			arm,
			initialMethodCount,
			visitDecision,
			restrictedInspection: null,
			autonomousInspection: null,
			forcedVisit: false,
			lookup: "no-request-no-action",
		};
	}
	assert(runtime.s.assistance?.received, "Request was not attended");
	// Execute a legal visit as a controlled intervention. Do not call it autonomous assistance.
	for (let round = 0; round < 4 && !runtime.s.assistance.visit; round++) {
		const ids = runtime.prepareRound();
		if (runtime.s.assistance.visit) break;
		for (const id of ids) {
			const resident = runtime.actor(id);
			const action =
				id === "lea" && !resident.job && !runtime.s.assistance.visit
					? "annex-visit"
					: (resident.job?.offer.id ?? "rest");
			runtime.apply(id, action);
		}
	}
	assert(
		runtime.s.assistance.visit,
		"Controlled legal visit failed to complete",
	);
	observeAssistance(runtime.s, lea);
	const offers = assistanceOffers(runtime.s, lea);
	assert.equal(offers.length, 3);
	const restricted = HF.decide(structuredClone(lea.person), offers);
	const expected =
		arm === "learned" ? "annex-open-section" : "annex-ask-inspector";
	assert.equal(
		restricted.chosenAffordanceId,
		expected,
		"Learning/unsupported negative control failed",
	);
	const autonomousInspection = fullDecision(runtime, "lea");
	const capacityBeforeOutcome = runtime.s.places.find(
		(p) => p.id === "hall",
	)?.capacity;
	for (let round = 0; round < 20 && !runtime.s.assistance.result; round++) {
		for (const id of runtime.s.pending.length
			? [...runtime.s.pending]
			: runtime.prepareRound())
			runtime.apply(id, runtime.choose(id));
	}
	const outcome = {
		opened: runtime.s.assistance.opened,
		action: runtime.s.assistance.action ?? null,
		result: runtime.s.assistance.result ?? null,
		capacity: runtime.s.places.find((p) => p.id === "hall")?.capacity,
		health: health(runtime.s),
	};
	assert.equal(
		outcome.opened,
		arm === "learned",
		"Actual controlled assistance outcome disagreed with method control",
	);
	return {
		arm,
		initialMethodCount,
		methodsRetained: lea.person.methods?.rules.length ?? 0,
		requestReceived: runtime.s.assistance.received,
		visitDecision,
		restrictedInspection: restricted,
		autonomousInspection,
		forcedVisit: true,
		capacityAfterDecisionOnly: capacityBeforeOutcome,
		outcome,
		lookup:
			arm === "unsupported" ? "annex-ask-inspector" : "annex-open-section",
	};
}
function sensitivityControl() {
	const person = new Runtime(createRuntime(42, 8).export() as Save).actor(
		"ada",
	).person;
	const common = {
		action: "talk",
		label: "Matched social sensitivity offer",
		duration: 15,
		effort: 0,
		advertises: {},
	};
	const offers = [
		{ ...common, id: "known-company", targetId: "lea", tags: ["social"] },
		{ ...common, id: "alone", tags: [] },
	];
	const record = HF.decide(structuredClone(person), offers);
	const socialTerm = record.considered
		.find((c) => c.affordanceId === "known-company")
		?.terms.find((t) => t.source === "social:lea")?.value;
	assert(
		socialTerm !== undefined && socialTerm > 0,
		"Positive socialScale sensitivity control is missing",
	);
	return {
		provenance:
			"hypothetical matched options using Ada's authored existing relationship with Lea; no world outcome",
		record,
		socialTerm,
	};
}
function cartFixture(seed: number) {
	const runtime = new Runtime(createRuntime(seed, 8).export() as Save);
	runtime.s.handcart = {
		version: 1,
		activatedAt: runtime.s.now,
		progress: 0,
		work: [],
		requests: [],
	};
	runtime.actor("ravi").place = "workshop";
	runtime.actor("ada").place = "workshop";
	updateHandcart(runtime);
	assert(
		runtime.s.handcart.raviGoalId,
		"Actual cart observation did not create Ravi's acquired goal",
	);
	const decision = fullDecision(runtime, "ravi");
	assert(
		decision.offeredIds.includes("cart-ask") &&
			decision.offeredIds.includes("cart-slow"),
	);
	return {
		provenance:
			"authored-cart-present-control; actual HF received observation and acquired goal; no claimed preceding evening",
		acquiredGoalId: runtime.s.handcart.raviGoalId,
		decision,
	};
}
function run(seed: number) {
	const runtime = new Runtime(createRuntime(seed, 8).export() as Save);
	let cart: (ReturnType<typeof fullDecision> & { at: number }) | null = null;
	let minimumAlive = 8,
		maximumUnderfed = 0;
	const daily: ReturnType<typeof health>[] = [];
	for (let round = 0; round < days * 96; round++) {
		for (const id of runtime.prepareRound()) {
			if (!cart && id === "ravi" && !runtime.actor(id).job) {
				const offers = runtime.affordances(id);
				if (
					offers.some((o) => o.id === "cart-ask") &&
					offers.some((o) => o.id === "cart-slow")
				)
					cart = { at: runtime.s.now, ...fullDecision(runtime, id) };
			}
			runtime.apply(id, runtime.choose(id));
		}
		if ((round + 1) % 96 === 0) {
			const sample = health(runtime.s);
			daily.push(sample);
			minimumAlive = Math.min(minimumAlive, sample.alive);
			maximumUnderfed = Math.max(maximumUnderfed, sample.underfed);
		}
	}
	return {
		seed,
		split: [42, 73].includes(seed) ? "training" : "holdout",
		days,
		population: 8,
		assistance: (
			["learned", "methods-ablated", "request-withheld", "unsupported"] as const
		).map((arm) => assistance(seed, arm)),
		genuineCartOpportunity: cart,
		authoredCartControl: cartFixture(seed),
		healthAtDailyBoundaries: daily,
		minimumAlive,
		maximumUnderfed,
		finalHealth: health(runtime.s),
		finalStateSha256: sha(JSON.stringify(runtime.export())),
	};
}
const before = sources();
const arm = option("--arm", "");
if (arm) {
	const scale = Number(arm);
	assert([0.3, 0.6, 0.9].includes(scale));
	const defaults = configuration();
	HF.COGNITION_DEFAULTS.socialScale = scale;
	const results = [42, 73, 9, 101].map(run);
	assert.deepEqual(sources(), before, "Sources changed during child probe");
	console.log(
		JSON.stringify({
			pid: process.pid,
			socialScale: scale,
			originalConfiguration: defaults,
			configuration: configuration(),
			positiveSensitivityControl: sensitivityControl(),
			results,
		}),
	);
} else {
	const start = performance.now();
	const parentConfiguration = configuration();
	const arms = [0.3, 0.6, 0.9].map((scale) => {
		const child = spawnSync(
			process.execPath,
			[import.meta.filename, "--arm", String(scale), "--days", String(days)],
			{ encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: 55_000 },
		);
		assert.equal(child.status, 0, child.stderr || String(child.error));
		return JSON.parse(child.stdout);
	});
	assert(
		arms[0].positiveSensitivityControl.socialTerm <
			arms[1].positiveSensitivityControl.socialTerm &&
			arms[1].positiveSensitivityControl.socialTerm <
				arms[2].positiveSensitivityControl.socialTerm,
		"Changing socialScale failed to change its positive control term",
	);
	assert.deepEqual(
		configuration(),
		parentConfiguration,
		"Child configuration leaked into parent",
	);
	assert.equal(
		new Set(arms.map((a) => a.pid)).size,
		3,
		"Configuration arms shared a process",
	);
	assert.deepEqual(sources(), before, "Sources changed during probe");
	const report = {
		schema: "neighbours/hf-config-probe@1",
		runtime: "typescript-host-released-hf",
		hf: (createRuntime(42, 8).export() as Save).hf,
		node: process.version,
		sourceFingerprint: sha(JSON.stringify(before)),
		sources: before,
		sourcesStableDuringRun: true,
		days,
		seeds: { training: [42, 73], holdout: [9, 101] },
		wallSeconds: (performance.now() - start) / 1000,
		limitations: [
			"Engineering sensitivity controls, not validated calibration, human realism or HF superiority.",
			"Each socialScale runs in a separate Node process. Production weights are unchanged. All exported HF default objects are recorded.",
			"Assistance uses authored open-hall starting circumstances and Lea's scenario prior-course HF demonstrations. It does not claim an attended in-town class or naturally learned checkpoint.",
			"The visit is legally executed under experimenter control. Full-offer decisions reveal whether autonomous HF would choose it; the three-option inspection control separately isolates learned method effects.",
			"The simple cue lookup is an explicitly authored comparator. It needs no learning and does not demonstrate HF superiority.",
			"Genuine cart opportunities come from ordinary autonomous progression; null means none occurred in the bounded horizon. A separately labelled authored cart-present control measures actual received goals and legal host offers without claiming natural prior progression. All offered scores are recovered on a clone; maxConsidered changes logging only and chosen equality is asserted.",
			"Daily hunger and retained promise outcomes are bounded adverse-effect screens, not lifetime counts. Assistance stops at its physical result, so its endpoint health is not a matched-time adverse-effect comparison. This script does not execute Python Concordia.",
		],
		arms,
	};
	const output = option("--output", "");
	if (output) {
		mkdirSync(dirname(resolve(output)), { recursive: true });
		writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
		console.log(
			JSON.stringify({
				output: resolve(output),
				sourceFingerprint: report.sourceFingerprint,
				wallSeconds: report.wallSeconds,
			}),
		);
	} else console.log(JSON.stringify(report));
}
