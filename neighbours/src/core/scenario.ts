import {
	adoptGoal,
	createPerson,
	promise,
	setRetention,
} from "@adam0white/human-framework";
import type { TownRuntime } from "../contracts";
import { teachHallInspection } from "../experiments/inspection.ts";
import { keyed } from "./hash.ts";
import { HF_VERSION } from "./hf-version.ts";
import { required } from "./invariants.ts";
import { neighbourNames } from "./neighbour-names.ts";
import { Runtime } from "./runtime.ts";
import {
	known,
	type Place,
	placeSpecs,
	type Resident,
	SCHEMA,
} from "./state.ts";
import { floodTimber } from "./timber.ts";
export function createRuntime(seed = 42, population = 208): TownRuntime {
	if (
		!Number.isSafeInteger(seed) ||
		seed < 0 ||
		seed > 4294967295 ||
		!Number.isInteger(population) ||
		population < 8 ||
		population > 300
	)
		throw Error("Invalid seed or population");
	const places: Place[] = placeSpecs.map(
		([id, name, x, y, capacity, kind]) => ({
			id,
			name,
			x,
			y,
			capacity,
			kind,
			stock: id === "market" ? 80 : 0,
			reserved: 0,
		}),
	);
	const backgroundNames = neighbourNames(seed);
	const people: Resident[] = Array.from({ length: population }, (_, i) => {
		const k = known[i];
		const id = k?.[0] ?? `resident-${i - 7}`;
		const person = createPerson({
			id,
			name:
				k?.[1] ?? required(backgroundNames[i - 8], "Missing neighbour name"),
			seed: (seed + i * 7919) >>> 0,
			now: 480,
			bornAt: -1440 * 365 * (23 + (i % 47)),
			sex: i % 2 ? "male" : "female",
			relationships:
				id === "ada"
					? [
							{
								otherId: "lea",
								roles: ["neighbour"],
								trust: 0.65,
								familiarity: 0.6,
								affection: 0.25,
							},
						]
					: id === "lea"
						? [
								{
									otherId: "ada",
									roles: ["neighbour"],
									trust: 0.65,
									familiarity: 0.6,
									affection: 0.25,
								},
							]
						: [],
			skills: { repair: k?.[2] === "carpenter" ? 0.8 : 0.1 },
			values: { benevolence: 0.35 + keyed(seed, 0, id) * 0.5 },
		});
		setRetention(person, { trace: 4, chronicleDays: 31 });
		if (id === "lea")
			teachHallInspection(
				person,
				"prior-trade-course",
				"lea-background-training",
			);
		if (k) {
			const action = required(
				["repair", "grow", "care", "supply", "supply", "teach", "work", "talk"][
					i
				],
				"Known resident missing promise action",
			);
			promise(person, {
				kind: "promise",
				toId: known[(i + 1) % 8]?.[0],
				actions: [action],
				from: 480,
				until: 1080,
				importance: 0.6,
				label: [
					"Repair doors before evening",
					"Harvest food for Sam",
					"Keep the clinic open",
					"Collect food for the shared meal",
					"Bring food ashore",
					"Hold the displaced class",
					"Earn money for workshop supplies",
					"Meet neighbours at the hall",
				][i],
			});
		}
		if (id === "ada" || id === "lea")
			adoptGoal(
				person,
				{
					label:
						id === "ada"
							? "Understand the flood-damaged timber before reopening"
							: "Help neighbours understand the hall inspection",
					serves: ["competence", "meaning"],
					importance: 0.7,
					deadline: 1200,
					advancedBy: [
						{ action: "inspect", amount: 0.1 },
						{ action: "ask-inspector", amount: 0.75 },
						{ action: "answer-inspection", amount: 0.75 },
						{ action: "open-section", amount: 0.75 },
						{ action: "keep-closed", amount: 0.75 },
					],
				},
				480,
			);
		if (id === "ada")
			promise(person, {
				kind: "appointment",
				toId: "lea",
				actions: ["inspect"],
				from: 660,
				until: 840,
				importance: 0.7,
				label: "Be at the hall after Lea’s class to compare the flood damage",
			});
		if (id === "lea")
			promise(person, {
				kind: "promise",
				actions: ["inspect", "open-section", "keep-closed"],
				from: 900,
				until: 3000,
				importance: 0.6,
				label: "Inspect the hall before resuming classes there",
			});
		if (id === "ravi" || (!k && i % 4 === 3))
			promise(person, {
				kind: "appointment",
				toId: "lea",
				actions: ["learn"],
				from: 480,
				until: 615,
				importance: 0.7,
				label: "Attend Lea’s displaced practical class",
			});
		return {
			person,
			role:
				k?.[2] ??
				required(
					["shop assistant", "parent", "retired neighbour", "student"][i % 4],
					"Missing background role",
				),
			description:
				k?.[4] ?? "A persistent neighbour with food, rest and social needs.",
			known: !!k,
			place: k?.[3] ?? "homes",
			wealth: 3 + (i % 6),
			policy: "hf",
		};
	});
	return new Runtime({
		schema: SCHEMA,
		hf: HF_VERSION,
		seed,
		now: 480,
		round: 0,
		controls: 3,
		bus: false,
		tools: 3,
		hall: 0,
		hallSafe: false,
		firstMealAt: null,
		events: [],
		nextEvent: 1,
		people,
		places,
		pending: [],
		initialFood: 80,
		produced: 0,
		consumed: 0,
		timber: floodTimber(),
	});
}
