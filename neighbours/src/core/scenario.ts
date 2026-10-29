import type { TownRuntime } from "../contracts.ts";
import { teachHallInspection } from "../experiments/inspection.ts";
import { HF_VERSION } from "./hf-version.ts";
import { TownRunOwner } from "./hf4-owner.ts";
import { createTownRun } from "./hf4-run.ts";
import { required } from "./invariants.ts";
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
	const owner = new TownRunOwner(createTownRun(seed, population));
	const people: Resident[] = Object.values(
		owner.export().run.current.people,
	).map((actor, i) => {
		const k = known[i];
		const ordinal = k ? i : i + 2;
		return {
			id: actor.id,
			name: actor.name,
			owner,
			role:
				k?.[2] ??
				required(
					["shop assistant", "parent", "retired neighbour", "student"][
						ordinal % 4
					],
					"Missing resident role",
				),
			description:
				k?.[4] ?? "This neighbour needs food, rest and time with other people.",
			known: !!k,
			place: k?.[3] ?? "homes",
			wealth: 3 + (ordinal % 6),
			policy: "hf",
		};
	});
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
	const runtime = new Runtime({
		owner,
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
	const nora = people.find((person) => person.id === "ada");
	if (!nora) throw Error("Missing authored workshop designer");
	teachHallInspection(nora, "prior-workshop-practice", "nora-workshop-method");
	owner.advance(owner.at + 1);
	owner.advance(owner.at + 1);
	runtime.s.now = owner.at / 60000;
	return runtime;
}
