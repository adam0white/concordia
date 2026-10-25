import {
	adoptGoal,
	createPerson,
	enableFullness,
	promise,
	setRetention,
} from "@adam0white/human-framework";
import type { TownRuntime } from "../contracts";
import { teachHallInspection } from "../experiments/inspection.ts";
import { canonicalOpening } from "./canonical-cast.ts";
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
export function createRuntime(seed = 42, population = 206): TownRuntime {
	if (
		!Number.isSafeInteger(seed) ||
		seed < 0 ||
		seed > 4294967295 ||
		!Number.isInteger(population) ||
		population < 6 ||
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
		// Retiring two foreground arcs must not reseed or rename the generated crowd.
		const ordinal = k ? i : i + 2;
		const id = k?.[0] ?? `resident-${i - 5}`;
		const person = createPerson({
			id,
			name:
				k?.[1] ?? required(backgroundNames[i - 6], "Missing neighbour name"),
			seed: (seed + ordinal * 7919) >>> 0,
			now: 480,
			bornAt: -1440 * 365 * (23 + (ordinal % 47)),
			sex: ordinal % 2 ? "male" : "female",
			...(k
				? canonicalOpening(k[0] as string)
				: { values: { benevolence: 0.35 + keyed(seed, 0, id) * 0.5 } }),
			skills: { repair: k?.[2] === "repair designer" ? 0.8 : 0.1 },
		});
		setRetention(person, { trace: 4, chronicleDays: 31 });
		// HF 2.8.0 fullness: someone who is not thirsty stops picking a drink as the cheapest idle choice. It lives
		// in the person's own state, so people restored from older saves keep their behaviour.
		enableFullness(person);
		if (id === "ada")
			teachHallInspection(
				person,
				"prior-workshop-practice",
				"nora-workshop-method",
			);
		if (id === "elin")
			promise(person, {
				kind: "appointment",
				actions: ["sleep"],
				from: 480,
				until: 720,
				importance: 0.9,
				label: "Sleep in the morning after night work; cover shifts later",
			});
		if (k) {
			const action = required(
				["repair", "care", "supply", "supply", "learn", "talk"][i],
				"Known resident missing promise action",
			);
			promise(person, {
				kind: "promise",
				toId: known[(i + 1) % 6]?.[0],
				actions: [action],
				from: 480,
				until: 1080,
				importance: 0.6,
				label: [
					"Repair the hall doors before evening",
					"Keep the clinic open during the agreed shift",
					"Help prepare the shared meal with an experienced kitchen worker",
					"Carry supplies during the agreed visit",
					"Practise a repair without claiming expertise",
					"Check the supply route and meet neighbours",
				][i],
			});
		}
		if (id === "ada")
			adoptGoal(
				person,
				{
					label: "Check the flood-damaged timber before reopening",
					serves: ["competence", "meaning"],
					importance: 0.7,
					deadline: 1200,
					advancedBy: [
						{ action: "inspect", amount: 0.1 },
						{ action: "open-section", amount: 0.75 },
						{ action: "keep-closed", amount: 0.75 },
					],
				},
				480,
			);

		return {
			person,
			role:
				k?.[2] ??
				required(
					["shop assistant", "parent", "retired neighbour", "student"][
						ordinal % 4
					],
					"Missing background role",
				),
			description:
				k?.[4] ?? "This neighbour needs food, rest and time with other people.",
			known: !!k,
			place: k?.[3] ?? "homes",
			wealth: 3 + (ordinal % 6),
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
		together: true,
	});
}
