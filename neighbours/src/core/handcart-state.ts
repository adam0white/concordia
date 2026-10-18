import type { ProposalOrigin, TownEvent } from "../contracts.ts";
import type { BenchSlot } from "./bench-window.ts";
import type { Save } from "./state.ts";
export interface BenchRequest {
	id: number;
	event: TownEvent;
	heardAt: number;
	proposedFrom: number;
	proposedUntil: number;
	opportunityEventId?: number;
	reply?: "agree" | "refuse" | "later";
	replyEvent?: TownEvent;
	from?: number;
	until?: number;
	commitmentId?: string;
	benefitReceived?: boolean;
	benefitEvent?: TownEvent;
}
export interface Handcart {
	version: 1;
	activatedAt: number;
	progress: number;
	work: {
		event: TownEvent;
		mode: "main" | "side";
		startedAt: number;
		endedAt: number;
	}[];
	observation?: TownEvent;
	raviGoalId?: string;
	adaGoalId?: string;
	adaObservation?: TownEvent;
	premise?: {
		slot: BenchSlot;
		at: number;
		from: number;
		until: number;
		event: TownEvent;
		received: boolean;
		origin: ProposalOrigin;
	};
	requests: BenchRequest[];
	bench?: {
		requestId: number;
		from: number;
		until: number;
		commitmentId: string;
	};
	handover?: TownEvent;
}
/** Optional for existing saves. No prior request or relationship is reconstructed. */
export type HandcartSave = Save & { handcart?: Handcart };
