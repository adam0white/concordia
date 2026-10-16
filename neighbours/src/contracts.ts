export type Policy = "hf" | "table" | "random" | "llm";
export interface TownEvent {
	id: number;
	at: number;
	kind: string;
	source?: "town-bulletin";
	actorId?: string;
	targetId?: string;
	placeId?: string;
	text: string;
	causes: number[];
	importance: number;
}
export interface PlaceView {
	id: string;
	name: string;
	kind: string;
	x: number;
	y: number;
	open: boolean;
	stock: number;
	capacity: number;
	occupants: number;
	reserved?: number;
	description: string;
}
export interface PersonView {
	id: string;
	name: string;
	role: string;
	description: string;
	known: boolean;
	color: string;
	policy: Policy;
	placeId: string;
	destination?: string;
	journey?: {
		fromId: string;
		toId: string;
		departedAt: number;
		arriveAt: number;
	};
	lifeState?: "awake" | "asleep" | "downed" | "dead" | "break";
	lifeEvent?: TownEvent;
	activity: string;
	until: number;
	needs: Record<string, number>;
	mood: number;
	wealth: number;
	history: TownEvent[];
	observations?: TownEvent[];
	inspection?: {
		at: number;
		action: string;
		observations: { moisture: string; support: string };
		result: string;
		source: string;
		methodTerms: { source: string; value: number }[];
		event: TownEvent;
	};
	paidWork?: {
		day: number;
		starts: number;
		minutes: number;
		remaining: number;
	};
	relationships: {
		id: string;
		name: string;
		trust: number;
		summary: string;
		origin?: "initial" | "observed";
	}[];
	commitments: { label: string; at: number; status: string }[];
	decision?: {
		decidedAt?: number;
		round?: number;
		chosen: string;
		label: string;
		reason: string;
		options: { id: string; label: string; utility: number }[];
		source: string;
	};
}
export interface TownView {
	schema: string;
	seed: number;
	now: number;
	day: number;
	people: PersonView[];
	places: PlaceView[];
	events: TownEvent[];
	stories: {
		id: string;
		title: string;
		summary: string;
		eventIds: number[];
		missingEventIds?: number[];
		kind: string;
		groupId?: string;
		at?: number;
	}[];
	stats: Record<string, number>;
	diagnostics: {
		code: string;
		message: string;
		severity: "info" | "warning" | "error";
	}[];
	weather: string;
	controlsRemaining: number;
	metrics: Record<string, number>;
}
export interface Intervention {
	kind: "restore-bus" | "lend-tools" | "share-news";
	actorId?: string;
}
export interface Choice {
	id: string;
	label: string;
}
export interface TownRuntime {
	prepareRound(): string[];
	getObservation(id: string): string;
	getChoices(id: string): Choice[];
	choose(id: string, policy?: Policy): string;
	apply(id: string, actionId: string): void;
	acceptExternalChoice(
		id: string,
		actionId: string,
		reason: string,
		source: string,
	): void;
	view(): TownView;
	export(): unknown;
	intervene(input: Intervention): void;
	inspect(id: string): unknown;
	step(): void;
}
export interface TownComparison {
	schema: "town-comparison@1";
	seed: number;
	startAt: number;
	endAt: number;
	rounds: number;
	startHash: string;
	intervention: Intervention;
	baseline: {
		stats: Record<string, number>;
		known: { id: string; name: string; activity: string; wealth: number }[];
		stories: { title: string; summary: string }[];
	};
	treatment: TownComparison["baseline"];
	limits: string[];
}
export type UiCommand =
	| { type: "step"; rounds?: number }
	| { type: "new"; seed: number; population?: number }
	| { type: "intervene"; intervention: Intervention }
	| { type: "save"; requestId?: number }
	| { type: "restore"; save: unknown }
	| { type: "inspect"; actorId: string }
	| { type: "compare"; intervention: Intervention; rounds: number };
export type UiReply =
	| { type: "ready" | "state"; view: TownView; elapsedMs?: number }
	| { type: "progress"; message: string }
	| { type: "save"; save: unknown; requestId?: number }
	| { type: "inspection"; actorId: string; data: unknown }
	| { type: "comparison"; report: TownComparison }
	| { type: "error"; message: string };
