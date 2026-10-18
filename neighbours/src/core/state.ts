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
		"Ada",
		"carpenter",
		"workshop",
		"Kept the hall tables dry; wants to repair its doors.",
	],
	[
		"musa",
		"Musa",
		"gardener",
		"garden",
		"Lost seedlings in the flood; grows food for neighbours.",
	],
	[
		"elin",
		"Elin",
		"nurse",
		"clinic",
		"Moved evening care into a small clinic.",
	],
	[
		"sam",
		"Sam",
		"cook",
		"market",
		"Promised a shared meal when the hall opens.",
	],
	["jo", "Jo", "ferry keeper", "quay", "Carries supplies from the quay."],
	["lea", "Lea", "teacher", "school", "Evening classes need somewhere dry."],
	[
		"ravi",
		"Ravi",
		"mechanic",
		"workshop",
		"Shares a crowded workshop with Ada.",
	],
	[
		"noor",
		"Noor",
		"organiser",
		"homes",
		"Visits neighbours who have not heard the hall news.",
	],
];
/**
 * Who the returning player already knows (scenario seed data, like `known`): a cousin, a former stall partner
 * and the next-door neighbour. Trust values are engineering starting points; HF's default for an unknown voice
 * is 0.5. Seeded once when the player first acts.
 */
export const PLAYER_TIES: readonly [string, number][] = [
	["lea", 0.8],
	["sam", 0.6],
	["jo", 0.4],
];
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
	/** Absent until the visitor first acts as a resident; absence is the observer-only town. */
	player?: import("./player.ts").PlayerState;
};
