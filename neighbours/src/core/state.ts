import type {
	Affordance,
	DecisionRecord,
	Person,
} from "@adam0white/human-framework";
import type { PersonView, Policy, TownEvent } from "../contracts";
import type { SocialEvenings } from "./evenings.ts";
import type { Handcart } from "./handcart-state.ts";
import type { TownChronicle } from "./town-chronicle.ts";
export const SCHEMA = "neighbours-1";
export const known = [
	[
		"ada",
		"Nora",
		"repair designer",
		"workshop",
		"Nora designs repairs and shares the workshop. Her older brother lives elsewhere.",
	],
	[
		"elin",
		"Derya",
		"visiting night nurse",
		"homes",
		"Derya is a night nurse visiting for a limited period to cover shifts. She needs to sleep in the morning. She keeps her family life private.",
	],
	[
		"sam",
		"Sam",
		"meal helper",
		"market",
		"Sam is an eighteen-year-old repair apprentice. He helps prepare the shared meal with an experienced kitchen worker.",
	],
	[
		"jo",
		"Bilal",
		"supply helper",
		"quay",
		"Bilal is a maintenance technician helping move supplies during a limited stay. His spouse and stepchild are at home.",
	],
	[
		"ravi",
		"Rafi",
		"repair learner",
		"workshop",
		"Rafi is a nineteen-year-old who washes dishes for work. He is visiting through a workshop exchange. He asks before borrowing tools.",
	],
	[
		"noor",
		"Ece",
		"courier",
		"homes",
		"Ece is a courier and studies logistics part time. She is visiting through a temporary supply exchange. She normally lives with her aunt.",
	],
];
/** The returning player has no unearned family relationship or familiarity with this new cohort. */
export const PLAYER_TIES: readonly [string, number][] = [];
export const placeSpecs = [
	["homes", "Riverside homes", 12, 65, 300, "home"],
	["market", "Market kitchen", 42, 60, 16, "food"],
	["clinic", "Clinic", 68, 62, 6, "care"],
	["workshop", "Workshop", 74, 35, 8, "work"],
	["quay", "Quay", 14, 35, 12, "supply"],
	["garden", "Community garden", 30, 18, 18, "grow"],
	["school", "School", 58, 18, 14, "learn"],
	["hall", "Flooded hall", 47, 39, 10, "community"],
] as const;
export type Place = {
	id: string;
	name: string;
	x: number;
	y: number;
	capacity: number;
	kind: string;
	stock: number;
	reserved: number;
};
export type Job = {
	assistanceDecision?: {
		id: string;
		source: string;
		methodTerms: { source: string; value: number }[];
	};
	offer: Affordance;
	end: number;
	arrive: number;
	from: string;
	event: number;
	food: number;
	tools: number;
	inspectionCues?: { moisture: string; support: string };
	socialContacts?: { otherId: string; event: number }[];
};
export type Resident = {
	person: Person;
	role: string;
	description: string;
	known: boolean;
	place: string;
	idleSince?: number;
	lifeEvent?: TownEvent;
	wealth: number;
	policy: Policy;
	job?: Job;
	decision?: PersonView["decision"];
	record?: DecisionRecord;
	received?: TownEvent[];
	question?: {
		event: number;
		at: number;
		note: TownEvent;
		status: "waiting" | "answered" | "missed";
		answeredBy?: string;
		lessonEvent?: number;
	};
	inspection?: {
		key: string;
		action: string;
		at: number;
		event?: TownEvent;
		observations?: { moisture: string; support: string };
		result?: string;
		source?: string;
		methodTerms?: { source: string; value: number }[];
	};
	paidWork?: {
		day: number;
		starts: number;
		minutes: number;
		totalMinutes: number;
	};
};
export type Save = {
	chapter?: import("./cast-continuity.ts").CastChapter;
	assistance?: import("./assistance.ts").Assistance;
	/** Observer history begins with the next selected event, including in legacy saves. */
	townChronicle?: TownChronicle;
	schema: string;
	hf: string;
	seed: number;
	now: number;
	round: number;
	controls: number;
	bus: boolean;
	tools: number;
	hall: number;
	hallSafe: boolean;
	firstMealAt: number | null;
	events: TownEvent[];
	nextEvent: number;
	people: Resident[];
	places: Place[];
	pending: string[];
	initialFood: number;
	produced: number;
	consumed: number;
	/** Optional in first public saves. Activation never reconstructs past events. */
	socialEvenings?: SocialEvenings;
	handcart?: Handcart;
	/** Hall timber damp (timber.ts). Absent in saves made before it existed: legacy weather-only physics. */
	timber?: import("./timber.ts").Timber;
	/**
	 * Present (true) in towns begun under HF 2.8.0: evening offers name who is already going (`Affordance.alongside`).
	 * Absent in older saves, whose offers stay exactly as they were.
	 */
	together?: true;
	/** Absent until the visitor first acts as a resident; absence is the observer-only town. */
	player?: import("./player.ts").PlayerState;
};
