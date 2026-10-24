import assert from "node:assert/strict";
import { describe, expect, it } from "vitest";
import { Runtime } from "../src/core/runtime.ts";
import type { Save } from "../src/core/state.ts";
import { createRuntime, restoreRuntime } from "./historical-runtime.ts";

function resident(r: Runtime, id: string) {
	const p = r.s.people.find((p) => p.person.id === id);
	assert(p);
	return p;
}
function town() {
	return new Runtime(createRuntime(42, 8).export() as Save);
}
function round(r: Runtime, choices: Record<string, string> = {}) {
	for (const id of r.prepareRound())
		r.apply(id, choices[id] ?? r.actor(id).job?.offer.id ?? "rest");
}
describe("paid shift availability", () => {
	it("permits only two daytime paid shifts without changing the wage", () => {
		const r = town();
		let sawLimit = false;
		for (let i = 0; i < 10; i++)
			for (const id of r.prepareRound()) {
				if (id === "ada") {
					const p = resident(r, id);
					if (p.job) r.apply(id, p.job.offer.id);
					else if ((p.paidWork?.starts ?? 0) < 2) r.apply(id, "work");
					else {
						expect(r.getChoices(id).some((c) => c.id === "work")).toBe(false);
						sawLimit = true;
						r.apply(id, "rest");
					}
				} else r.apply(id, r.actor(id).job?.offer.id ?? "rest");
			}
		expect(sawLimit).toBe(true);
		expect(resident(r, "ada").paidWork).toMatchObject({
			day: 0,
			starts: 2,
			minutes: 120,
			totalMinutes: 120,
		});
		expect(resident(r, "ada").wealth).toBe(7);
		expect(() => restoreRuntime(r.export())).not.toThrow();
	});
	it("rejects forged shift totals and preserves an active second shift", () => {
		const r = town();
		for (let i = 0; i < 5; i++) round(r, { ada: "work" });
		const p = resident(r, "ada");
		expect(p.paidWork?.starts).toBe(2);
		expect(() => restoreRuntime(r.export())).not.toThrow();
		const s = r.export() as Save;
		const ada = s.people.find((p) => p.person.id === "ada");
		assert(ada?.paidWork);
		ada.paidWork.starts = 3;
		expect(() => restoreRuntime(s)).toThrow();
	});
});
describe("realized activity effects", () => {
	it("a solitary visit does not satisfy belonging while an actual shared interval does", () => {
		function visit(shared: boolean) {
			const r = town();
			resident(r, "ada").place = "hall";
			if (shared) resident(r, "lea").place = "hall";
			const before = resident(r, "ada").person.needs.belonging;
			round(r, { ada: "talk", ...(shared ? { lea: "talk" } : {}) });
			round(r);
			round(r);
			return { before, after: resident(r, "ada").person.needs.belonging };
		}
		const solo = visit(false),
			shared = visit(true);
		expect(solo.after).toBeLessThanOrEqual(solo.before);
		expect(shared.after).toBeGreaterThan(solo.after);
	});
	it("attending an empty school does not invent a learned lesson or competence reward", () => {
		const r = town();
		resident(r, "ada").place = "school";
		resident(r, "lea").place = "homes";
		const before = resident(r, "ada").person.needs.competence;
		round(r, { ada: "learn" });
		for (let i = 0; i < 4; i++) round(r);
		expect(resident(r, "ada").person.methods).toBeUndefined();
		expect(resident(r, "ada").person.needs.competence).toBeLessThanOrEqual(
			before,
		);
	});
	it("an actual inspection result remains visible after routine history is pruned", () => {
		const r = town();
		resident(r, "ada").place = "hall";
		round(r, { ada: "keep-closed" });
		round(r);
		const inspection = resident(r, "ada").inspection;
		assert(inspection?.event);
		expect(inspection.observations).toEqual({
			moisture: r.weather() === "Clear" ? "dry" : "wet",
			support: "loose",
		});
		expect(inspection.event.importance).toBeGreaterThanOrEqual(0.8);
		r.s.events = [];
		const view = r.view();
		expect(
			view.people.find((p) => p.id === "ada")?.inspection?.result,
		).toContain("loose supports");
		expect(view.stories.some((s) => s.kind === "hall-closed")).toBe(true);
		expect(() => restoreRuntime(r.export())).not.toThrow();
	});
});
describe("a request remains refusable", () => {
	it("an urgent physical need can defer a genuinely received request", () => {
		const r = town();
		resident(r, "ada").place = "hall";
		resident(r, "lea").place = "hall";
		r.prepareRound();
		r.apply("ada", "ask-inspector");
		const teacher = resident(r, "lea");
		teacher.person.body.hydration = 0;
		const chosen = r.choose("lea");
		expect(chosen).toBe("drink");
		const record = teacher.record;
		assert(record);
		const resolutions = [
			...(record.suggestions ?? []),
			...(record.suggestion ? [record.suggestion] : []),
		];
		expect(
			resolutions.some(
				(resolution) =>
					resolution.verdict === "deferred" ||
					resolution.verdict === "refused" ||
					resolution.verdict === "modified",
			),
		).toBe(true);
		expect(chosen).not.toBe("answer-inspection:ada");
	});
	it("a question posted out of earshot does not become a remote suggestion", () => {
		const r = town();
		resident(r, "ada").place = "hall";
		resident(r, "lea").place = "school";
		r.prepareRound();
		r.apply("ada", "ask-inspector");
		const teacher = resident(r, "lea");
		expect(teacher.received?.some((e) => e.kind === "question") ?? false).toBe(
			false,
		);
		expect(
			r.getChoices("lea").some((c) => c.id === "answer-inspection:ada"),
		).toBe(false);
		r.choose("lea");
		expect(teacher.record?.suggestion).toBeUndefined();
		expect(teacher.record?.suggestions ?? []).toEqual([]);
	});
});
it("does not replace an unavailable HF choice with a host rest action", () => {
	const r = town();
	r.prepareRound();
	const ada = resident(r, "ada");
	ada.person.body.alive = false;
	expect(() => r.choose("ada")).toThrow("No legal choices");
	expect(ada.job).toBeUndefined();
	const stock = r.s.places.reduce((sum, p) => sum + p.stock, 0);
	expect(() => r.apply("ada", "eat")).toThrow("Action is not currently legal");
	expect(r.s.places.reduce((sum, p) => sum + p.stock, 0)).toBe(stock);
});
