/**
 * Reproduction for nbh-01z.37 (residents repair once and never return). Discriminates "the work ran out" from
 * "residents decline work that is still offered": after the seeded town finishes its twelve repairs, a copy of
 * the town has fresh damage injected (`hall -= damage`, a host world fact) and runs one more day. Each actual
 * HF decision record is read: was repair among the legal offers, was it chosen, and which terms carried it.
 * Nothing is forced; the control arm is the same checkpoint without damage. Not a realism claim.
 *
 * Usage: node scripts/probe-repair-return.ts [--seed 42] [--population 206] [--inject-day 3] [--damage 6]
 */
import assert from "node:assert/strict";
import { createRuntime, restoreRuntime } from "../src/core/index.ts";
import type { Runtime } from "../src/core/runtime.ts";
import type { Save } from "../src/core/state.ts";

function option(name: string, fallback: number): number {
	const index = process.argv.indexOf(name);
	const value = index < 0 ? fallback : Number(process.argv[index + 1]);
	assert(Number.isSafeInteger(value) && value >= 0, `${name} needs an integer`);
	return value;
}
const seed = option("--seed", 42);
const population = option("--population", 206);
const injectDay = option("--inject-day", 3);
const damage = option("--damage", 6);

type Tally = {
	decisions: number;
	repairOffered: number;
	repairChosen: number;
	medianGap: number | null;
	repairTerms: Record<string, number>;
};
function tally(runtime: Runtime, rounds: number): Tally {
	const seen = new Set<string>();
	const gaps: number[] = [];
	const terms = new Map<string, number>();
	let decisions = 0,
		offered = 0,
		chosen = 0;
	const records = (runtime as unknown as { records: Map<string, unknown> })
		.records as Map<
		string,
		{
			id: string;
			chosenAction: string;
			chosenAffordanceId: string;
			considered: {
				action: string;
				affordanceId: string;
				utility: number;
				terms: { source: string; value: number }[];
			}[];
		}
	>;
	for (let i = 0; i < rounds; i++) {
		runtime.step();
		for (const [actor, record] of records) {
			if (seen.has(`${actor}:${record.id}`)) continue;
			seen.add(`${actor}:${record.id}`);
			decisions++;
			const repair = record.considered.find((c) => c.action === "repair");
			if (!repair) continue;
			offered++;
			if (record.chosenAction === "repair") {
				chosen++;
				continue;
			}
			const best = record.considered.find(
				(c) => c.affordanceId === record.chosenAffordanceId,
			);
			if (best) gaps.push(best.utility - repair.utility);
			for (const t of repair.terms)
				if (!t.source.startsWith("social:"))
					terms.set(t.source, (terms.get(t.source) ?? 0) + t.value);
		}
	}
	gaps.sort((a, b) => a - b);
	const n = Math.max(1, offered - chosen);
	return {
		decisions,
		repairOffered: offered,
		repairChosen: chosen,
		medianGap: gaps.length
			? Number((gaps[Math.floor(gaps.length / 2)] ?? 0).toFixed(4))
			: null,
		repairTerms: Object.fromEntries(
			[...terms]
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([k, v]) => [k, Number((v / n).toFixed(4))]),
		),
	};
}

const town = createRuntime(seed, population) as Runtime;
const opening = tally(town, 2 * 96);
for (let i = 2 * 96; i < injectDay * 96; i++) town.step();
const checkpoint = town.export() as Save;
assert(checkpoint.hall >= damage, "Too little repaired hall to damage");
const control = tally(
	restoreRuntime(structuredClone(checkpoint)) as Runtime,
	96,
);
// Fresh damage as the town's own loosening records it: hall care (hall-care.ts) lets residents who see it adopt
// the aim. The "no care" arm removes only that marker, as in a Phase C save.
const damaged = structuredClone(checkpoint);
damaged.hall -= damage;
if (damaged.timber?.care) damaged.timber.care.loosened += damage;
const withoutCare = structuredClone(damaged);
if (withoutCare.timber) delete withoutCare.timber.care;
const injected = tally(restoreRuntime(damaged) as Runtime, 96);
const injectedWithoutCare = tally(restoreRuntime(withoutCare) as Runtime, 96);
console.log(
	JSON.stringify(
		{
			seed,
			population,
			hf: checkpoint.hf,
			openingDays0to1: opening,
			control: { hall: 12, ...control },
			injected: {
				hall: damaged.hall,
				care: damaged.timber?.care !== undefined,
				...injected,
			},
			injectedWithoutCare: { hall: damaged.hall, ...injectedWithoutCare },
		},
		null,
		2,
	),
);
