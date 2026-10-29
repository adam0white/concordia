import type { TownEvent } from "../contracts.ts";
import { PLAYER_EVENT_KINDS } from "./player-events.ts";
import type { Save } from "./state.ts";

const EVENT_KINDS = new Set([
	"annex-observed",
	"annex-inspected",
	"cart-observed",
	"bench-work",
	"bench-request",
	"bench-reply",
	"cart-progress",
	"bench-used",
	"cart-returned",
	"evening-retold",
	"hall-purpose",
	"evening-attended",
	"attempt-failed",
	"evening-proposed",
	"evening-accepted",
	"evening-declined",
	"evening-prepared",
	"evening-ended",
	"evening-missed",
	"death",
	"incapacity",
	"interrupted",
	"started",
	"completed",
	"delivery",
	"intervention",
	"hall-repaired",
	"repair-slipped",
	"hall-loosened",
	"shared-meal",
	"hall-open",
	"inspection-failed",
	"hall-closed",
	"question",
	"hall-explanation",
	"missed-encounter",
	"lesson",
	...PLAYER_EVENT_KINDS,
]);
function text(value: unknown, max = 4000): value is string {
	return typeof value === "string" && value.length <= max;
}
function minute(value: unknown, now: number): value is number {
	return (
		typeof value === "number" &&
		Number.isSafeInteger(Math.round(value * 60000)) &&
		Math.abs(value * 60000 - Math.round(value * 60000)) < 0.000001 &&
		value >= 480 &&
		value <= now
	);
}
function keys(value: object, allowed: string[]) {
	if (Object.keys(value).some((key) => !allowed.includes(key)))
		throw Error("Unexpected evidence field");
}
export function validateEvent(e: TownEvent, s: Save, ids: Set<string>): void {
	if (!e || typeof e !== "object") throw Error("Invalid event");
	keys(e, [
		"id",
		"at",
		"kind",
		"source",
		"actorId",
		"targetId",
		"placeId",
		"text",
		"causes",
		"importance",
	]);
	if (
		!Number.isSafeInteger(e.id) ||
		e.id < 1 ||
		e.id >= s.nextEvent ||
		!minute(e.at, s.now) ||
		!EVENT_KINDS.has(e.kind) ||
		(e.source !== undefined &&
			!(
				(e.source === "town-bulletin" && e.kind === "intervention") ||
				(e.source === "player" && e.kind.startsWith("player-"))
			)) ||
		!text(e.text) ||
		!Number.isFinite(e.importance) ||
		e.importance < 0 ||
		e.importance > 1 ||
		!Array.isArray(e.causes) ||
		e.causes.length > 32 ||
		e.causes.some((c) => !Number.isSafeInteger(c) || c < 1 || c >= e.id) ||
		(e.actorId !== undefined && !ids.has(e.actorId)) ||
		(e.targetId !== undefined && !ids.has(e.targetId)) ||
		(e.placeId !== undefined && !s.places.some((p) => p.id === e.placeId))
	)
		throw Error("Invalid event evidence");
}
