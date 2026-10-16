/** Read an actual received opportunity before interpreting a zero-request town. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	abandonGoal,
	type DecisionRecord,
	decide,
} from "@adam0white/human-framework";
import { restoreRuntime, type Save } from "../src/core/index.ts";
import { Runtime } from "../src/core/runtime.ts";

const [capturePath, outputPath] = process.argv.slice(2);
assert(
	capturePath && outputPath,
	"Use probe-cart-choices.ts CHECKPOINT OUTPUT",
);
const encoded = readFileSync(capturePath, "utf8");
const capture = JSON.parse(encoded);
const initial: Save = capture.checkpoint?.runtime ?? capture.runtime;
assert(initial?.schema === "neighbours-1");
const runtime = restoreRuntime(initial) as Runtime;
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const app = resolve(import.meta.dirname, "..");
const sourcePaths = [
	"scripts/probe-cart-choices.ts",
	"package-lock.json",
	"package.json",
	"src/contracts.ts",
	"src/experiments/inspection.ts",
	...readdirSync(resolve(app, "src/core"))
		.filter((p) => p.endsWith(".ts"))
		.map((p) => `src/core/${p}`),
];
const sources = () =>
	Object.fromEntries(
		sourcePaths
			.sort()
			.map((p) => [p, sha(readFileSync(resolve(app, p), "utf8"))]),
	);
const beforeSources = sources();
const terms = (record: DecisionRecord) => ({
	chosen: record.chosenAffordanceId,
	consideredIds: record.considered.map((c) => c.affordanceId),
	considered: record.considered
		.filter((c) => c.affordanceId.startsWith("cart-"))
		.map((c) => ({ id: c.affordanceId, utility: c.utility, terms: c.terms })),
});
let opportunity: unknown = null;
let raviDecisions = 0;
for (
	let round = 0;
	round < 96 * 10 && !opportunity && !runtime.s.handcart?.handover;
	round++
) {
	for (const id of runtime.prepareRound()) {
		const actor = runtime.actor(id);
		const offered = id === "ravi" && !actor.job ? runtime.affordances(id) : [];
		if (id === "ravi") raviDecisions++;
		const ask = offered.find((o) => o.id === "cart-ask");
		const slow = offered.find((o) => o.id === "cart-slow");
		if (ask && slow && runtime.s.handcart?.raviGoalId) {
			const branch = new Runtime(structuredClone(runtime.s));
			assert(
				abandonGoal(branch.actor(id).person, runtime.s.handcart.raviGoalId),
			);
			branch.choose(id);
			const person = structuredClone(actor.person);
			const fast = {
				...slow,
				id: "cart-fast-probe",
				action: "cart-fast",
				label: "Hypothetical granted main bench",
				duration: slow.duration - 60,
			};
			const pair = decide(structuredClone(person), [slow, fast], {
				scarcity: Math.max(0, 1 - actor.wealth / 8),
			});
			const ablated = structuredClone(person);
			assert(abandonGoal(ablated, runtime.s.handcart.raviGoalId));
			const pairNoGoal = decide(ablated, [slow, fast], {
				scarcity: Math.max(0, 1 - actor.wealth / 8),
			});
			const chosen = runtime.choose(id);
			opportunity = {
				at: runtime.s.now,
				round: runtime.s.round,
				place: actor.place,
				adaPlace: runtime.actor("ada").place,
				physicalProjectProgress: runtime.s.handcart.progress,
				offeredIds: offered.map((o) => o.id),
				baseline: terms(actor.record as DecisionRecord),
				goalAblated: {
					...terms(branch.actor(id).record as DecisionRecord),
				},
				matchedDurationOffers: [slow, fast],
				matchedDurationChoice: terms(pair),
				matchedDurationGoalAblated: terms(pairNoGoal),
			};
			runtime.apply(id, chosen);
		} else runtime.apply(id, runtime.choose(id));
	}
}
assert.deepEqual(sources(), beforeSources, "Sources changed during probe");
const result = {
	schema: "neighbours/cart-choice-probe@1",
	hf: initial.hf,
	runtime: "typescript-host-released-hf",
	node: process.version,
	seed: initial.seed,
	startRound: initial.round,
	inputSha256: sha(encoded),
	raviDecisions,
	opportunity,
	sources: beforeSources,
	limitations: [
		"This is a probe of actual received choices in one restored town, not a generic planning benchmark.",
		"HF scores all supplied offers. An absent recorded top-ranked alternative does not establish that the option was not evaluated.",
		"The goal ablation changes only Ravi's selected goal status; it does not remove his remembered project or legal offers.",
		"The matched duration pair is explicitly hypothetical: access is supplied as an offer, not negotiated or enacted in the town.",
		"The pair records immediate decision terms, not completion speed or the future value of waiting for tomorrow's agreement.",
	],
};
writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(
	JSON.stringify({
		output: outputPath,
		opportunityFound: !!opportunity,
		raviDecisions,
	}),
);
