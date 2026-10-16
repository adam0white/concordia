import assert from "node:assert/strict";
import { describe, expect, it } from "vitest";
import { createRuntime, restoreRuntime, stateHash } from "../src/core";
import { Runtime } from "../src/core/runtime.ts";
import type { Save } from "../src/core/state.ts";

describe("physical town", () => {
	it("has 208 brains and defers consequences", () => {
		const r = createRuntime();
		expect(r.view().people).toHaveLength(208);
		const ids = r.prepareRound();
		const id = ids[0];
		assert(id);
		const choice = r.choose(id);
		r.apply(id, choice);
		expect(r.view().now).toBe(495);
		expect(r.view().people.find((p) => p.id === id)?.until).toBeGreaterThan(
			495,
		);
		expect((r.inspect(id) as { person: unknown }).person).toBeTruthy();
	});
	it("restores exact continuation", () => {
		const a = createRuntime(17, 12);
		a.step();
		const b = restoreRuntime(JSON.parse(JSON.stringify(a.export())));
		for (let i = 0; i < 8; i++) {
			a.step();
			b.step();
		}
		expect(stateHash(a.export())).toBe(stateHash(b.export()));
	});
	it("rejects illegal choices and malformed imports", () => {
		const a = createRuntime();
		expect(() => a.apply("ada", "invent-food")).toThrow();
		expect(() => restoreRuntime({})).toThrow();
	});
	it("interventions consume allowance and change resources", () => {
		const a = createRuntime(42, 8);
		const b = createRuntime(42, 8);
		a.intervene({ kind: "lend-tools" });
		expect(a.view().stats.tools).toBeGreaterThan(b.view().stats.tools ?? 0);
		a.intervene({ kind: "share-news" });
		a.intervene({ kind: "restore-bus" });
		expect(() => a.intervene({ kind: "lend-tools" })).toThrow();
	});
	it("conserves stock/capacity and uses HF traces", () => {
		const r = createRuntime(42, 20);
		for (let i = 0; i < 24; i++) r.step();
		expect(
			r.view().places.every((p) => p.stock >= 0 && p.occupants <= p.capacity),
		).toBe(true);
		expect(
			r
				.view()
				.people.some(
					(p) =>
						p.decision?.source === "HF 2.2.1" && p.decision.options.length > 1,
				),
		).toBe(true);
	});
});
it("restores a checkpoint between choosing and applying", () => {
	const a = createRuntime(42, 8);
	const ids = a.prepareRound();
	const id = ids[0];
	assert(id);
	const chosen = a.choose(id);
	const b = restoreRuntime(a.export());
	a.apply(id, chosen);
	b.apply(id, chosen);
	for (const id of ids.slice(1)) {
		a.apply(id, a.choose(id));
		b.apply(id, b.choose(id));
	}
	expect(stateHash(a.export())).toBe(stateHash(b.export()));
});

it("does not spend allowance or tell stale hall news after repairs finish", () => {
	const runtime = new Runtime(createRuntime(42, 8).export() as Save);
	expect(runtime.view().canShareNews).toBe(true);
	runtime.s.hall = 12;
	const before = stateHash(runtime.export());
	expect(runtime.view().canShareNews).toBe(false);
	expect(() => runtime.intervene({ kind: "share-news" })).toThrow(
		"Hall repairs are complete",
	);
	expect(stateHash(runtime.export())).toBe(before);
	runtime.s.hallSafe = true;
	expect(runtime.view().canShareNews).toBe(false);
	expect(() => runtime.intervene({ kind: "share-news" })).toThrow(
		"Hall repairs are complete",
	);
});

it("does not spend allowance lending tools with no hall repair work remaining", () => {
	const runtime = new Runtime(createRuntime(42, 8).export() as Save);
	expect(runtime.view().canLendTools).toBe(true);
	runtime.s.hall = 12;
	const before = stateHash(runtime.export());
	expect(runtime.view().canLendTools).toBe(false);
	expect(() => runtime.intervene({ kind: "lend-tools" })).toThrow(
		"Hall repairs are complete",
	);
	expect(stateHash(runtime.export())).toBe(before);
});
it("does not share hall news or spend allowance when no living listener is awake", () => {
	const runtime = new Runtime(createRuntime(42, 8).export() as Save);
	for (const r of runtime.s.people) r.person.body.asleep = true;
	const before = stateHash(runtime.export());
	expect(runtime.view().canShareNews).toBe(false);
	expect(() => runtime.intervene({ kind: "share-news" })).toThrow(
		"No awake neighbours",
	);
	expect(stateHash(runtime.export())).toBe(before);
	runtime.actor("ada").person.body.asleep = false;
	runtime.actor("ada").person.body.alive = false;
	expect(runtime.view().canShareNews).toBe(false);
	runtime.actor("ada").person.body.alive = true;
	expect(runtime.view().canShareNews).toBe(true);
});
it("excludes a sleeping activity from both hall-news eligibility and delivery", () => {
	const runtime = new Runtime(createRuntime(42, 8).export() as Save);
	runtime.actor("ada").place = "homes";
	for (const id of runtime.prepareRound())
		runtime.apply(id, id === "ada" ? "sleep" : "rest");
	for (const r of runtime.s.people) r.person.body.asleep = true;
	runtime.actor("ada").person.body.asleep = false;
	expect(runtime.actor("ada").job?.offer.mode).toBe("sleep");
	const before = stateHash(runtime.export());
	expect(runtime.view().canShareNews).toBe(false);
	expect(() => runtime.intervene({ kind: "share-news" })).toThrow(
		"No awake neighbours",
	);
	expect(stateHash(runtime.export())).toBe(before);
	runtime.actor("lea").person.body.asleep = false;
	const adaBefore = structuredClone(runtime.actor("ada").person);
	expect(runtime.view().canShareNews).toBe(true);
	runtime.intervene({ kind: "share-news" });
	expect(runtime.actor("ada").person).toEqual(adaBefore);
	expect(
		runtime.actor("ada").received?.some((e) => e.source === "town-bulletin"),
	).not.toBe(true);
	expect(runtime.s.controls).toBe(2);
});
