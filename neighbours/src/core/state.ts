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
		"A repair designer sharing the workshop; her older brother lives elsewhere.",
	],
	[
		"elin",
		"Derya",
		"visiting night nurse",
		"homes",
		"A night nurse on a bounded relief visit. Morning sleep matters; her family is private.",
	],
	[
		"sam",
		"Sam",
		"meal helper",
		"market",
		"An eighteen-year-old repair apprentice helping with the shared meal, with experienced kitchen cover.",
	],
	[
		"jo",
		"Bilal",
		"supply helper",
		"quay",
		"A maintenance technician helping move supplies during a bounded stay; his spouse and stepchild are at home.",
	],
	[
		"ravi",
		"Rafi",
		"repair learner",
		"workshop",
		"A nineteen-year-old dish worker on a workshop exchange. He asks before borrowing tools.",
	],
	[
		"noor",
		"Ece",
		"courier",
		"homes",
		"A courier and part-time logistics student on a temporary supply exchange. She lives with her aunt at home.",
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
