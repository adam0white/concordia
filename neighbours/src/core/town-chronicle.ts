import type { TownEvent } from "../contracts.ts";
import { allEvenings } from "./evenings.ts";
import type { Save } from "./state.ts";
import { validateEvent } from "./validation.ts";
export interface TownChronicle {
	version: 1;
	events: TownEvent[];
}
export const TOWN_CHRONICLE_LIMIT = 128;
/** Inspection failures remain in the current inspection record, rather than filling history. */
export const CHRONICLE_KINDS: ReadonlySet<string> = new Set([
	"annex-observed",
	"annex-inspected",
	"hall-repaired",
	"hall-open",
	"lesson",
	"hall-explanation",
	"shared-meal",
	"missed-encounter",
	"evening-proposed",
	"evening-ended",
	"cart-returned",
]);
/** Keep the live reference: callers finish recipient metadata after creating an event. */
export function recordTownEvent(s: Save, event: TownEvent): void {
	if (!CHRONICLE_KINDS.has(event.kind)) return;
	s.townChronicle ??= { version: 1, events: [] };
	s.townChronicle.events.push(event);
	if (s.townChronicle.events.length > TOWN_CHRONICLE_LIMIT)
		s.townChronicle.events.splice(
			0,
			s.townChronicle.events.length - TOWN_CHRONICLE_LIMIT,
		);
}
function signature(e: TownEvent): string {
	return JSON.stringify([
		e.id,
		e.at,
		e.kind,
		e.text,
		e.actorId ?? null,
		e.targetId ?? null,
		e.placeId ?? null,
		e.source ?? null,
		e.causes,
		e.importance,
	]);
}
/** The journal is observer evidence; it grants no knowledge, actions, or physical outcomes. */
export function validateTownChronicle(s: Save, ids: Set<string>): void {
	const log = s.townChronicle;
	if (log === undefined) return;
	if (
		!log ||
		typeof log !== "object" ||
		Array.isArray(log) ||
		Object.keys(log).sort().join() !== "events,version" ||
		log.version !== 1 ||
		!Array.isArray(log.events) ||
		log.events.length > TOWN_CHRONICLE_LIMIT
	)
		throw Error("Invalid town chronicle");
	const canonical = [
		...s.events,
		...(s.assistance?.visit ? [s.assistance.visit] : []),
		...(s.assistance?.result ? [s.assistance.result] : []),
		...s.people.flatMap((r) =>
			r.inspection?.event ? [r.inspection.event] : [],
		),
		...allEvenings(s).flatMap((e) => [
			...(e.notice ? [e.notice] : []),
			...(e.result ? [e.result] : []),
		]),
		...(s.handcart?.handover ? [s.handcart.handover] : []),
	];
	let previousId = 0,
		previousAt = 480;
	for (const event of log.events) {
		validateEvent(event, s, ids);
		if (
			!CHRONICLE_KINDS.has(event.kind) ||
			typeof event.actorId !== "string" ||
			!ids.has(event.actorId) ||
			event.id <= previousId ||
			event.at < previousAt
		)
			throw Error("Invalid chronological town event");
		if (
			canonical.some(
				(retained) =>
					retained.id === event.id && signature(retained) !== signature(event),
			)
		)
			throw Error("Town chronicle contradicts retained event");
		previousId = event.id;
		previousAt = event.at;
	}
}
