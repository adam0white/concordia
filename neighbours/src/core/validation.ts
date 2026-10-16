import type { DecisionRecord } from "@adam0white/human-framework";
import type { TownEvent } from "../contracts.ts";
import type { Resident, Save } from "./state.ts";

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
	"shared-meal",
	"hall-open",
	"inspection-failed",
	"hall-closed",
	"question",
	"hall-explanation",
	"missed-encounter",
	"lesson",
]);
function text(value: unknown, max = 4000): value is string {
	return typeof value === "string" && value.length <= max;
}
function minute(value: unknown, now: number): value is number {
	return (
		Number.isSafeInteger(value) && Number(value) >= 480 && Number(value) <= now
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
			(e.source !== "town-bulletin" || e.kind !== "intervention")) ||
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
function validateRecord(record: DecisionRecord, s: Save) {
	if (!record || typeof record !== "object")
		throw Error("Invalid decision record");
	keys(record, [
		"id",
		"at",
		"chosenAffordanceId",
		"chosenAction",
		"considered",
		"suggestion",
		"suggestions",
		"intention",
		"narration",
		"review",
		"interrupt",
	]);
	if (
		!text(record.id, 200) ||
		record.at !== s.now ||
		!text(record.chosenAffordanceId, 200) ||
		!text(record.chosenAction, 100) ||
		!text(record.intention) ||
		!text(record.narration) ||
		!Array.isArray(record.considered) ||
		record.considered.length > 64 ||
		JSON.stringify(record).length > 100000 ||
		record.considered.some(
			(c) =>
				!c ||
				!text(c.affordanceId, 200) ||
				!text(c.action, 100) ||
				!Number.isFinite(c.utility) ||
				!Array.isArray(c.terms) ||
				c.terms.some((t) => !text(t.source, 300) || !Number.isFinite(t.value)),
		)
	)
		throw Error("Invalid decision record");
}
export function validateResidentEvidence(
	r: Resident,
	s: Save,
	ids: Set<string>,
): void {
	keys(r, [
		"person",
		"role",
		"description",
		"known",
		"place",
		"wealth",
		"policy",
		"job",
		"decision",
		"record",
		"received",
		"question",
		"inspection",
		"paidWork",
		"idleSince",
		"lifeEvent",
	]);
	if (r.lifeEvent) {
		validateEvent(r.lifeEvent, s, ids);
		if (
			r.lifeEvent.actorId !== r.person.id ||
			!["death", "incapacity"].includes(r.lifeEvent.kind) ||
			(r.lifeEvent.kind === "death" && r.person.body.alive)
		)
			throw Error("Invalid lifecycle evidence");
	}
	if (r.idleSince !== undefined && !minute(r.idleSince, s.now))
		throw Error("Invalid idle clock");
	if (r.received !== undefined) {
		if (!Array.isArray(r.received) || r.received.length > 12)
			throw Error("Invalid received observations");
		for (const event of r.received) {
			validateEvent(event, s, ids);
			if (event.targetId !== r.person.id)
				throw Error("Observation belongs to another person");
		}
	}
	if (r.question) {
		const q = r.question;
		keys(q, ["event", "at", "note", "status", "answeredBy", "lessonEvent"]);
		validateEvent(q.note, s, ids);
		if (
			q.note.kind !== "question" ||
			q.note.actorId !== r.person.id ||
			q.note.id !== q.event ||
			q.note.at !== q.at ||
			!["waiting", "answered", "missed"].includes(q.status) ||
			(q.answeredBy !== undefined && !ids.has(q.answeredBy)) ||
			(q.lessonEvent !== undefined &&
				(!Number.isSafeInteger(q.lessonEvent) ||
					q.lessonEvent <= q.event ||
					q.lessonEvent >= s.nextEvent))
		)
			throw Error("Invalid inspection question");
	}
	if (r.inspection) {
		keys(r.inspection, [
			"key",
			"action",
			"at",
			"event",
			"observations",
			"result",
			"source",
			"methodTerms",
		]);
		if (
			!text(r.inspection.key, 100) ||
			!["open-section", "keep-closed"].includes(r.inspection.action) ||
			!minute(r.inspection.at, s.now)
		)
			throw Error("Invalid inspection evidence");
	}
	if (r.inspection?.event) {
		const evidence = r.inspection;
		validateEvent(r.inspection.event, s, ids);
		if (
			evidence.event?.actorId !== r.person.id ||
			evidence.event.at !== evidence.at ||
			!evidence.observations ||
			!["dry", "wet"].includes(evidence.observations.moisture) ||
			!["sound", "loose"].includes(evidence.observations.support) ||
			!text(evidence.source, 300) ||
			!text(evidence.result) ||
			!Array.isArray(evidence.methodTerms) ||
			evidence.methodTerms.length > 64 ||
			evidence.methodTerms.some(
				(t) =>
					!text(t.source, 300) ||
					!t.source.startsWith("method:") ||
					!Number.isFinite(t.value),
			)
		)
			throw Error("Invalid inspection result evidence");
	}
	if (r.paidWork) {
		const w = r.paidWork;
		keys(w, ["day", "starts", "minutes", "totalMinutes"]);
		if (
			!Number.isSafeInteger(w.day) ||
			w.day < 0 ||
			w.day > Math.floor(s.now / 1440) ||
			!Number.isSafeInteger(w.starts) ||
			w.starts < 0 ||
			w.starts > 2 ||
			!Number.isSafeInteger(w.minutes) ||
			w.minutes < 0 ||
			w.minutes % 60 !== 0 ||
			w.minutes > w.starts * 60 ||
			!Number.isSafeInteger(w.totalMinutes) ||
			w.totalMinutes < w.minutes ||
			w.totalMinutes % 60 !== 0 ||
			w.totalMinutes > 120 * (w.day + 1)
		)
			throw Error("Invalid paid shift ledger");
	}
	if (r.decision) {
		const d = r.decision;
		keys(d, [
			"chosen",
			"label",
			"reason",
			"options",
			"source",
			"decidedAt",
			"round",
			"offeredCount",
			"recordedCount",
		]);
		if (
			!text(d.chosen, 200) ||
			!text(d.label, 300) ||
			!text(d.reason) ||
			!text(d.source, 300) ||
			!minute(d.decidedAt, s.now) ||
			!Number.isSafeInteger(d.round) ||
			Number(d.round) < 0 ||
			Number(d.round) > s.round ||
			!Array.isArray(d.options) ||
			d.options.length > 64 ||
			d.options.some(
				(o) =>
					!text(o.id, 200) ||
					!text(o.label, 300) ||
					!Number.isFinite(o.utility),
			)
		)
			throw Error("Invalid decision evidence");
		if (
			(d.offeredCount !== undefined || d.recordedCount !== undefined) &&
			(d.source !== "HF 2.2.1" ||
				!Number.isSafeInteger(d.offeredCount) ||
				!Number.isSafeInteger(d.recordedCount) ||
				Number(d.offeredCount) < 1 ||
				Number(d.offeredCount) > 1000 ||
				Number(d.recordedCount) !== d.options.length ||
				Number(d.recordedCount) > Number(d.offeredCount))
		)
			throw Error("Invalid recorded option counts");
		if (
			d.source === "HF 2.2.1" &&
			!r.person.trace.some(
				(t) =>
					t.at === d.decidedAt &&
					t.chosenAffordanceId === d.chosen &&
					t.narration === d.reason,
			)
		)
			throw Error("HF decision does not match saved trace");
	}
	if (r.record) {
		validateRecord(r.record, s);
		if (
			!s.pending.includes(r.person.id) ||
			(r.job &&
				!(
					r.person.activity &&
					(r.person.activity.reviewAt <= s.now ||
						r.person.activity.interrupt) &&
					r.job.arrive <= s.now
				)) ||
			r.decision?.chosen !== r.record.chosenAffordanceId
		)
			throw Error("Decision is not pending");
		if (
			r.policy === "hf" &&
			!r.person.trace.some(
				(t) => JSON.stringify(t) === JSON.stringify(r.record),
			)
		)
			throw Error("Pending HF record does not match trace");
		if (r.policy !== "hf" && r.record.considered.length !== 0)
			throw Error("External policy carries HF utilities");
	}
}
