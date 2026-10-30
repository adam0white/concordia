import type { DeepReadonly, HostRequest } from "@adam0white/human-framework";
import type { NativeActor } from "./core/host-types.ts";
export type Policy = "hf" | "table" | "random" | "llm";
export interface TownEvent {
	id: number;
	at: number;
	kind: string;
	source?: "town-bulletin" | "player";
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
	/** A worded read of how they seem, from HF needs, affect, outward signs and commitments. */
	read?: string;
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
export interface SpeechAnswer {
	voiceId: string;
	verdict:
		| "assented"
		| "complied"
		| "deferred"
		| "modified"
		| "refused"
		| "commanded";
	kind?: "cannot" | "notNow" | "willNot";
	reason: string;
	says: string;
	counterOffer?: { affordanceId?: string; label: string };
	insteadAffordanceId?: string;
	likelihood?: number;
	insisted?: boolean;
}
/**
 * What the player can see before speaking: the person's actual legal offers and a vague read worded from HF
 * state ("Seems tired", "Set on working a paid shift"). It carries no verdict and no answer line.
 */
export interface SpeechPrediction {
	targetId: string;
	at: number;
	offers: { affordanceId: string; label: string }[];
	read: string[];
}
export interface JournalEntry {
	id: string;
	at: number;
	day: number;
	text: string;
	label: "recorded";
	sourceEventIds: number[];
}
export type PlayerWorkKind =
	| "carry-meals"
	| "help-repair"
	| "cover-shift"
	| "dry-timber";
export interface PlayerView {
	/** False until the first player input; the defaults below are then derived, not saved. */
	active: boolean;
	/** Absent while travelling. */
	placeId?: string;
	job?: {
		kind: "travel" | "work";
		fromId: string;
		toId: string;
		departedAt: number;
		arriveAt: number;
		endsAt: number;
		work?: PlayerWorkKind;
		pledgeId?: string;
	};
	workHoursLeft: number;
	helpOffers?: {
		toId: string;
		toName: string;
		work: "cover-shift";
		placeId: string;
		placeName: string;
		minutes: number;
		endsAt: number;
		label: string;
		blocked?: string;
	}[];
	/** Whether there is damp hall timber the player can still prop and air (false once the hall has reopened). */
	canAirTimber?: boolean;
	/** Own work that cannot start now, with the host's reason (player.ts `workRefusal`). */
	workBlocked?: Partial<
		Record<"carry-meals" | "help-repair" | "dry-timber", string>
	>;
	/** Deadlines a promise made now may name (minutes); see PLEDGE_HOURS. */
	pledgeDeadlines?: number[];
	canMove: boolean;
	present: {
		id: string;
		name: string;
		known: boolean;
		activity: string;
		trust?: number;
	}[];
	presentCount: number;
	destinations: { id: string; name: string; minutes: number }[];
	requests: {
		id: number;
		at: number;
		/** Where the request was made. */
		placeId?: string;
		targetId: string;
		targetName: string;
		affordanceId: string;
		label: string;
		mode: "ask" | "urge" | "promise";
		verdict: SpeechAnswer["verdict"];
		says: string;
		/** For a refusal: the plain reason HF gave, in the narrator's words (voicing.ts `refusalWhy`). */
		why?: string;
		counterOffer?: { affordanceId?: string; label: string };
		status: string;
		decision?: {
			at: number;
			verdict: SpeechAnswer["verdict"];
			says: string;
			chosenAffordanceId: string;
			chosenLabel: string;
		};
		result?: string;
		pledgeId?: string;
	}[];
	pledges: {
		direct?: true;
		id: string;
		toId: string;
		toName: string;
		work: PlayerWorkKind;
		label: string;
		placeId: string;
		dueBy: number;
		status: "offered" | "open" | "kept" | "lapsed" | "released";
		/** Actual completed work and a kept promise received by the resident. */
		remembered?: boolean;
		result?: string;
		canStart?: boolean;
		blocked?: string;
	}[];
	journal: JournalEntry[];
	goals: {
		id: string;
		title: string;
		hint: string;
		status: "done" | "current";
		doneAt?: number;
		eventIds: number[];
	}[];
	notices: number;
	latestNotice?: { at: number; text: string; eventId: number };
}
export interface TownView {
	player?: PlayerView;
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
		canProposeBench?: boolean;
		premiseCount?: number;
		valuationMode?: "legacy" | "received-consequences@1";
		opportunity?: {
			from: number;
			until: number;
			received: boolean;
			origin: ProposalOrigin;
		};
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
		| "propose-bench-window"
		| "request-inspection"
		| "restore-bus"
		| "lend-tools"
		| "share-news"
		| "open-evening-slot"
		| "advertise-evening"
		| "player-move"
		| "player-speak"
		| "player-work"
		| "player-help"
		| "player-private";
	eventId?: string;
	actorId?: string;
	/** player-move destination. */
	placeId?: string;
	/** player-speak: one of the target's actual legal offers. */
	affordanceId?: string;
	mode?: "ask" | "urge" | "promise";
	/** player-speak: take up this person's latest counter-offer (affordanceId must name it). */
	acceptCounter?: boolean;
	/** player-speak with mode promise: one hour of the player's own work. */
	pledge?: { work: PlayerWorkKind; by?: number };
	/** player-work: keep an open pledge, or work unpledged with `work`. */
	pledgeId?: string;
	work?: PlayerWorkKind;
}
export interface Choice {
	id: string;
	label: string;
}
export interface TownRuntime {
	/** Exact current public actors; complete checkpoints remain a separate boundary. */
	currentActors(): Readonly<Record<string, NativeActor>>;
	prepareBoundary(): {
		at: number;
		done: boolean;
		requests: DeepReadonly<HostRequest>[];
	};
	roundComplete(): boolean;
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
	/** Pure telegraph for the player's speech; never changes state. */
	predictSpeech(id: string): SpeechPrediction;
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
export interface AdvanceRequest {
	type: "advance";
	requestId: number;
	until: "story" | "person-story" | "hall-choice";
	actorId?: string;
	maxRounds: number;
}
export interface AdvanceResult {
	requestId: number;
	reason:
		| "story"
		| "person-story"
		| "hall-choice"
		| "player"
		| "horizon"
		| "cancelled";
	rounds: number;
}
export interface AdvanceProgress {
	requestId: number;
	rounds: number;
	maxRounds: number;
	day: number;
	now: number;
}
export type UiCommand =
	| AdvanceRequest
	| { type: "cancel-advance"; requestId: number }
	| { type: "step"; rounds?: number }
	| {
			type: "new";
			seed: number;
			population?: number;
			initial?: unknown;
			newRequestId?: number;
	  }
	| { type: "intervene"; intervention: Intervention }
	| { type: "cast-capture"; requestId: number; actorId: string }
	| { type: "cast-cancel"; requestId: number }
	| { type: "save" | "save-journal"; requestId?: number }
	| {
			type: "restore";
			save: unknown;
			local?: boolean;
			restoreRequestId?: number;
	  }
	| { type: "inspect"; actorId: string }
	| { type: "predict-speech"; requestId: number; actorId: string }
	| { type: "cancel-comparison" }
	| { type: "compare"; intervention: Intervention; rounds: number };
export type UiReply =
	| {
			type: "ready" | "state";
			restoreRequestId?: number;
			newRequestId?: number;
			view: TownView;
			elapsedMs?: number;
			advance?: AdvanceResult;
			/** A player input's checkpoint, taken in the same FIFO slot; the UI stores it before showing the view. */
			save?: unknown;
			/** Complete journal taken in the same worker queue slot as save. */
			recording?: unknown;
	  }
	| { type: "progress"; message: string; advance?: AdvanceProgress }
	| { type: "cast-snapshot"; requestId: number; save: unknown }
	| { type: "save"; save: unknown; recording?: unknown; requestId?: number }
	| { type: "inspection"; actorId: string; data: unknown }
	| {
			type: "speech-predictions";
			requestId: number;
			actorId: string;
			prediction?: SpeechPrediction;
			error?: string;
	  }
	| { type: "comparison"; report: TownComparison }
	| {
			type: "error";
			message: string;
			restoreRequestId?: number;
			newRequestId?: number;
	  };
