import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Save } from "../src/core/state.ts";
import {
	createRuntime,
	restoreRuntime,
	stateHash,
} from "./historical-runtime.ts";

describe("causal controls", () => {
	it("preserves conservation across all208 and measures three-day run", () => {
		const r = createRuntime();
		const start = performance.now();
		for (let i = 0; i < 288; i++) r.step();
		const elapsed = performance.now() - start;
		const s = r.export() as Save;
		expect(s.people).toHaveLength(208);
		expect(s.people.slice(8).every((p) => p.person.trace.length > 0)).toBe(
			true,
		);
		expect(
			s.places.reduce((n, p) => n + p.stock, 0) +
				s.consumed +
				s.people.reduce((n, p) => n + (p.job?.food ?? 0), 0),
		).toBe(s.initialFood + s.produced);
		expect(s.events.length).toBeLessThanOrEqual(400);
		expect(s.people.every((p) => p.person.trace.length <= 4)).toBe(true);
		writeFileSync(
			"/tmp/neighbours-core-profile.json",
			JSON.stringify({
				profile: "208 people / 288 rounds / three days",
				elapsedMs: Math.round(elapsed),
				saveBytes: JSON.stringify(s).length,
				consumed: s.consumed,
				hall: s.hall,
				backgroundCompleted: s.people
					.slice(8)
					.reduce((n, p) => n + p.person.nextDecision, 0),
			}),
		);
	}, 30000);
	it("food completion occurs after travel and reservation, never at selection", () => {
		const r = createRuntime(5, 8);
		r.prepareRound();
		const before = r.view().stats.foodConsumed;
		r.choose("ada");
		r.apply("ada", "eat");
		expect(r.view().stats.foodConsumed).toBe(before);
		for (const id of ["musa", "elin", "sam", "jo", "lea", "ravi", "noor"]) {
			r.choose(id);
			r.apply(id, "rest");
		}
		r.step();
		expect(r.view().people.find((p) => p.id === "ada")?.activity).toContain(
			"Eat",
		);
		for (let i = 0; i < 4; i++)
			for (const id of r.prepareRound()) {
				const active = (r.export() as Save).people.find(
					(p) => p.person.id === id,
				)?.job;
				r.apply(id, active?.offer.id ?? "rest");
			}
		expect(r.view().stats.foodConsumed).toBeGreaterThan(before ?? 0);
	});
	it("rejects corruption without mutating the active runtime", () => {
		const r = createRuntime(42, 8);
		r.step();
		const before = stateHash(r.export());
		for (const mutate of [
			(s: Save) => Object.assign(s, { extra: true }),
			(s: Save) => Object.assign(requiredPlace(s, 0), { capacity: 999 }),
			(s: Save) => requiredPlace(s, 1).stock++,
			(s: Save) => (requiredResident(s, 0).person.id = "forged"),
			(s: Save) => s.now++,
		]) {
			const save = r.export() as Save;
			mutate(save);
			expect(() => restoreRuntime(save)).toThrow();
			expect(stateHash(r.export())).toBe(before);
		}
	});
	it("different policies are labelled and cause different worlds", () => {
		const a = createRuntime(42, 8),
			b = createRuntime(42, 8);
		for (let t = 0; t < 16; t++) {
			for (const id of a.prepareRound()) a.apply(id, a.choose(id, "table"));
			for (const id of b.prepareRound()) b.apply(id, b.choose(id, "random"));
		}
		expect(stateHash(a.export())).not.toBe(stateHash(b.export()));
		expect(a.view().people.every((p) => p.decision?.source === "table")).toBe(
			true,
		);
	});
});
describe("policy and save boundaries", () => {
	it("keeps table choices legal for208 and preserves imported controllers", () => {
		const r = createRuntime();
		for (let t = 0; t < 8; t++)
			for (const id of r.prepareRound()) r.apply(id, r.choose(id, "table"));
		const b = restoreRuntime(r.export());
		b.step();
		expect(b.view().people.every((p) => p.policy === "table")).toBe(true);
		expect(b.view().metrics.hfPeople).toBe(0);
	});
	it("rejects forged physical outcomes in host and HF activity", () => {
		const r = createRuntime(42, 8);
		r.step();
		const s = r.export() as import("../src/core/state").Save;
		const actor = s.people.find((p) => p.job);
		expect(actor).toBeTruthy();
		if (!actor?.job) throw Error("No activity");
		actor.job.offer.advertises.food = 100;
		if (actor.person.activity)
			actor.person.activity.affordance.advertises.food = 100;
		expect(() => restoreRuntime(s)).toThrow();
	});
});

function requiredPlace(s: Save, index: number) {
	const p = s.places[index];
	assert(p);
	return p;
}
function requiredResident(s: Save, index: number) {
	const p = s.people[index];
	assert(p);
	return p;
}
