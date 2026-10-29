import type {
	DeepReadonly,
	Input,
	Offer,
	RunArchive,
} from "@adam0white/human-framework";

/** Actual public HF4 native snapshot. Never constructed by the host or passed to an HF3-shaped API. */
export type NativeActor = DeepReadonly<RunArchive>["current"]["people"][string];
export type DecisionRecord = NativeActor["trace"][number] & {
	narration?: string;
};
export type SuggestionResolution = NonNullable<DecisionRecord["suggestion"]>;
type OrdinarySuggestion = Extract<
	Extract<Input, { kind: "suggestion.received" }>["payload"]["received"],
	{ kind: "ordinary" }
>["suggestion"];
export type Suggestion = Omit<OrdinarySuggestion, "adviceId">;
/** Physical host offer, before mapping to HF4's one public Offer representation. */
export interface Affordance {
	id: string;
	action: string;
	label: string;
	placeId?: string;
	targetId?: string;
	duration: number;
	effort: number;
	focus?: number;
	mode?: "awake" | "sleep";
	advertises: Offer["expected"]["needs"];
	material?: number;
	tags?: string[];
	norms?: Offer["norms"];
	fulfills?: string[];
	advances?: string[];
	diminishes?: string[];
	alongside?: string[];
	with?: string[];
	methodContext?: string;
	risk?: { chance: number; severity: number; kind: string };
	skill?: { id: string; difficulty: number; domain?: string; support?: number };
	demands?: Offer["demands"];
	requires?: Record<string, number>;
	reviewAfter?: number;
	promise?: unknown;
}
export interface Outcome {
	status: "completed" | "failed" | "interrupted";
	needs?: Offer["expected"]["needs"];
	material?: number;
}
