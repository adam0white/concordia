import assert from "node:assert/strict";
import { expect, it } from "vitest";
import type { TownEvent } from "../src/contracts.ts";
import { createRuntime, restoreRuntime } from "../src/core/index.ts";
import { Runtime } from "../src/core/runtime.ts";
import type { Save } from "../src/core/state.ts";

type ChronicleSave = Save & {
	townChronicle?: { version: 1; events: TownEvent[] };
};
function realExplanation() {
	const r = new Runtime(createRuntime(42, 8).export() as Save);
	r.actor("ada").place = "hall";
	r.actor("lea").place = "hall";
	r.prepareRound();
	r.apply("ada", "ask-inspector");
	r.apply("lea", "answer-inspection:ada");
	for (const id of [...r.s.pending]) r.apply(id, "rest");
	for (let i = 0; i < 3; i++)
		for (const id of r.prepareRound()) r.apply(id, "rest");
	const event = r.s.events.find((e) => e.kind === "hall-explanation");
	assert(event);
	return { r, event };
}
function packet(r: Runtime) {
	return JSON.parse(JSON.stringify(r.export())) as ChronicleSave;
}
function evictLiveFeed(r: Runtime) {
	// Deliberate retention pressure, separate from the genuinely completed explanation.
	for (let i = 0; i < 12; i++)
		r.event("missed-encounter", `Retention pressure ${i}`, "lea", "hall");
	for (let i = 0; i < 500; i++)
		r.event("completed", `Routine completion ${i}`, "lea", "hall");
}
it("retains a real explanation's final recipient, actor and original words after feed eviction", () => {
	const { r, event } = realExplanation();
	expect(event.targetId).toBe("ada");
	const stored = (r.s as ChronicleSave).townChronicle?.events.find(
		(e) => e.id === event.id,
	);
	expect(stored).toEqual(event);
	evictLiveFeed(r);
	expect(r.s.events.some((e) => e.id === event.id)).toBe(false);
	const story = r.view().stories.find((s) => s.id === `story-${event.id}`);
	expect(story).toMatchObject({
		at: event.at,
		actorId: "lea",
		summary: event.text,
	});
	expect(
		(r.s as ChronicleSave).townChronicle?.events.find((e) => e.id === event.id)
			?.targetId,
	).toBe("ada");
	expect(() => restoreRuntime(packet(r))).not.toThrow();
});
it("legacy saves begin recording at their next real event without reconstructing old history", () => {
	const { r, event } = realExplanation(),
		legacy = packet(r);
	delete legacy.townChronicle;
	const restored = restoreRuntime(legacy) as Runtime;
	expect((restored.s as ChronicleSave).townChronicle).toBeUndefined();
	for (let i = 0; i < 3; i++) restored.step();
	const newId = restored.event(
		"missed-encounter",
		"Next post-restore host encounter",
		"lea",
		"hall",
	);
	expect(
		(restored.s as ChronicleSave).townChronicle?.events.some(
			(e) => e.id === newId,
		),
	).toBe(true);
	expect(
		(restored.s as ChronicleSave).townChronicle?.events.some(
			(e) => e.id === event.id,
		) ?? false,
	).toBe(false);
});
it("the journal restores with exact continuation", () => {
	const { r } = realExplanation();
	evictLiveFeed(r);
	const restored = restoreRuntime(packet(r));
	for (let i = 0; i < 8; i++) {
		r.step();
		restored.step();
	}
	expect(restored.export()).toEqual(r.export());
});
it("withholding the observer journal changes no HF choices or physical state", () => {
	const { r } = realExplanation(),
		other = restoreRuntime(packet(r)) as Runtime;
	for (let i = 0; i < 12; i++) {
		delete (other.s as ChronicleSave).townChronicle;
		r.step();
		other.step();
		const left = packet(r),
			right = packet(other);
		delete left.townChronicle;
		delete right.townChronicle;
		expect(right).toEqual(left);
	}
});
it.each([
	"version",
	"count",
	"future",
	"duplicate",
	"actor",
	"kind",
	"contradiction",
])(
	"rejects malformed chronicle %s before changing the live town",
	(problem) => {
		const { r, event } = realExplanation(),
			source = packet(r),
			before = r.export();
		const e = structuredClone(event);
		source.townChronicle = { version: 1, events: [e] };
		switch (problem) {
			case "version":
				Object.assign(source.townChronicle, { version: 2 });
				break;
			case "count":
				source.townChronicle.events = Array.from({ length: 129 }, () =>
					structuredClone(e),
				);
				break;
			case "future":
				e.at = source.now + 15;
				break;
			case "duplicate":
				source.townChronicle.events.push(structuredClone(e));
				break;
			case "actor":
				e.actorId = "unknown-resident";
				break;
			case "kind":
				e.kind = "completed";
				break;
			case "contradiction":
				e.text = "Invented explanation";
				break;
		}
		expect(() => restoreRuntime(source)).toThrow();
		expect(r.export()).toEqual(before);
	},
);
it("bounds history at 128 and exposes 64 deduplicated dated stories", () => {
	const { r } = realExplanation();
	for (let i = 0; i < 140; i++)
		r.event("missed-encounter", `Distinct encounter ${i}`, "lea", "hall");
	const entries = (r.s as ChronicleSave).townChronicle?.events;
	assert(entries);
	expect(entries).toHaveLength(128);
	expect(new Set(entries.map((e) => e.id)).size).toBe(128);
	const stories = r.view().stories;
	expect(stories).toHaveLength(64);
	expect(new Set(stories.map((s) => s.id)).size).toBe(64);
	expect(() => restoreRuntime(packet(r))).not.toThrow();
});
it("does not record routine starts or repeated inspection failures", () => {
	const { r } = realExplanation(),
		before = structuredClone((r.s as ChronicleSave).townChronicle);
	for (let i = 0; i < 12; i++) {
		r.event("started", "Routine start", "lea", "hall");
		r.event("inspection-failed", "The same unsafe timber", "lea", "hall");
	}
	expect((r.s as ChronicleSave).townChronicle).toEqual(before);
});
it("rejects out-of-order journal time even when the source has left the live feed", () => {
	const { r, event } = realExplanation(),
		s = packet(r);
	s.events = [];
	s.townChronicle = {
		version: 1,
		events: [
			{ ...event, at: s.now },
			{ ...event, id: s.nextEvent++, at: event.at },
		],
	};
	expect(() => restoreRuntime(s)).toThrow("Invalid chronological town event");
});
it("rejects a contradiction with a retained receipt after the live event is gone", () => {
	let r = new Runtime(createRuntime(0, 8).export() as Save);
	for (let seed = 1; r.weather() !== "Clear" && seed < 30; seed++)
		r = new Runtime(createRuntime(seed, 8).export() as Save);
	expect(r.weather()).toBe("Clear");
	// This receipt test is not about timber: dry timber lets the clear-day inspection open (timber.ts).
	r.s.timber = { damp: 0 };
	r.s.hall = 12;
	r.actor("ada").place = "hall";
	r.prepareRound();
	r.apply("ada", "open-section");
	for (const id of [...r.s.pending]) r.apply(id, "rest");
	for (const id of r.prepareRound()) r.apply(id, "rest");
	const event = r.actor("ada").inspection?.event;
	assert(event);
	expect(event.kind).toBe("hall-open");
	const s = packet(r);
	s.events = [];
	// The unchanged actual inspection record remains canonical after live-feed eviction.
	expect(() => restoreRuntime(s)).not.toThrow();
	const journal = s.townChronicle?.events.find((e) => e.id === event.id);
	assert(journal);
	journal.text = "Contradictory archived result";
	expect(() => restoreRuntime(s)).toThrow(
		"Town chronicle contradicts retained event",
	);
});
