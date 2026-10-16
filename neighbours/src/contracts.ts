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
export type ProposalOrigin =
	| { kind: "authored" }
	| {
			kind: "recorded-gm";
			recordedAt: string;
			sourceFingerprint: string;
			modelIds: string[];
	  };
export interface PersonView {
	canReceiveInspectionRequest?: boolean;
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
	lessons?: {
		id: string;
		label: string;
		at: number;
		sourceIds: string[];
		successes: number;
		failures: number;
	}[];
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
	purposes?: { id: string; label: string; progress: number; status: string }[];
	invitations?: {
		eventId: string;
		title: string;
		startsAt: number;
		status: "heard" | "accepted" | "declined" | "attended" | "missed";
	}[];
	decision?: {
		offeredCount?: number;
		recordedCount?: number;
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
	assistance?: {
		origin: ProposalOrigin;
		decisionSource?: string;
		methodTerms?: { source: string; value: number }[];
		decisionId?: string;
		actorId: string;
		expiresAt: number;
		received: boolean;
		visitedAt?: number;
		opened: boolean;
		action?: string;
		result?: TownEvent;
		request: TownEvent;
		cue: string;
	};
	schema: string;
	seed: number;
	now: number;
	day: number;
	people: PersonView[];
	places: PlaceView[];
	events: TownEvent[];
	stories: {
		id: string;
		actorId?: string;
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
	canShareNews?: boolean;
	canLendTools?: boolean;
	canRestoreBus?: boolean;
	metrics: Record<string, number>;
	evenings?: {
		id: string;
		kind: "class" | "meal";
		organiserId: string;
		title: string;
		startsAt: number;
		endsAt: number;
		stage: string;
		heard: number;
		accepted: number;
		attended: number;
		result?: string;
		participantIds: string[];
		recurring?: boolean;
		supportRemaining?: 0 | 1;
		canOpenSlot?: boolean;
		canAdvertise?: boolean;
		advertised?: boolean;
		advertisementReceipt?: TownEvent;
		roomReserved?: boolean;
		roomReservedBy?: string;
		originalStartsAt?: number;
		slotReceipt?: TownEvent;
	}[];
	eveningSchedule?: {
		cyclesGenerated: number;
		cyclesCompleted: number;
		weeklyDeliveredClasses: number;
		weeklyDeliveredMeals: number;
		cyclesLimit: number;
		finished: boolean;
		nextStartsAt?: number;
	};
	handcart?: {
		progress: number;
		total: number;
		returned: boolean;
		completedAt?: number;
		returnedAt?: number;
		bench?: { from: number; until: number };
		latest?: TownEvent;
		requests: number;
	};
}
export interface Intervention {
	proposal?: unknown;
	proposalOrigin?: ProposalOrigin;
	kind:
		| "request-inspection"
		| "restore-bus"
		| "lend-tools"
		| "share-news"
		| "open-evening-slot"
		| "advertise-evening";
	eventId?: string;
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
		stories: { id?: string; at?: number; title: string; summary: string }[];
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
	| { type: "cancel-comparison" }
	| { type: "compare"; intervention: Intervention; rounds: number };
export type UiReply =
	| { type: "ready" | "state"; view: TownView; elapsedMs?: number }
	| { type: "progress"; message: string }
	| { type: "save"; save: unknown; requestId?: number }
	| { type: "inspection"; actorId: string; data: unknown }
	| { type: "comparison"; report: TownComparison }
	| { type: "error"; message: string };
