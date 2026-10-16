import assert from "node:assert/strict";
import { begin, decide, finish, tick } from "@adam0white/human-framework";
import { describe, expect, it } from "vitest";
import { overlapMinutes, presentAt } from "../src/core/encounters.ts";
import { createRuntime, restoreRuntime, stateHash } from "../src/core/index.ts";
import { buildOffers } from "../src/core/offers.ts";
import { Runtime } from "../src/core/runtime.ts";
import type { Resident, Save } from "../src/core/state.ts";

function exported(r: ReturnType<typeof createRuntime>) {
	return r.export() as Save;
}
function actor(s: Save, id: string): Resident {
	const r = s.people.find((r) => r.person.id === id);
	assert(r);
	return r;
}
function settleRound(r: Runtime, overrides: Record<string, string> = {}) {
	for (const id of r.prepareRound())
		r.apply(id, overrides[id] ?? r.actor(id).job?.offer.id ?? "rest");
}
function fixture() {
	const s = exported(createRuntime(42, 8));
	s.hall = 12;
	actor(s, "ada").place = "hall";
	actor(s, "lea").place = "hall";
	return new Runtime(s);
}
describe("review regressions", () => {
	it("restores a trip after the destination has opened", () => {
		const r = new Runtime(exported(createRuntime(42, 8)));
		r.prepareRound();
		r.apply("ada", "inspect");
		r.s.hall = 12;
		r.s.hallSafe = true;
		expect(() => restoreRuntime(r.export())).not.toThrow();
	});
	it("records table/random rationale without fabricated HF reasoning", () => {
		for (const policy of ["table", "random"] as const) {
			const r = createRuntime(42, 8);
			r.prepareRound();
			const action = r.choose("ada", policy);
			const pending = actor(exported(r), "ada");
			expect(pending.person.trace).toHaveLength(0);
			expect(pending.record?.considered).toEqual([]);
			expect(pending.record?.narration).toContain(policy);
			r.apply("ada", action);
			expect(r.view().people[0]?.decision?.options).toEqual([]);
		}
	});
	it("counts physical occupants separately from reservations and exposes actual journey", () => {
		const r = createRuntime(42, 8);
		r.prepareRound();
		r.apply("ada", "eat");
		expect(r.view().people.find((p) => p.id === "ada")?.journey).toMatchObject({
			fromId: "workshop",
			toId: "market",
			departedAt: 495,
		});
		expect(r.view().places.find((p) => p.id === "market")).toMatchObject({
			occupants: 1,
			reserved: 1,
		});
	});
	it("keeps the first meal marker even after its story is pruned", () => {
		const r = fixture();
		r.s.hallSafe = true;
		settleRound(r, { ada: "gather", lea: "gather" });
		for (let i = 0; i < 3; i++) settleRound(r);
		expect(r.s.firstMealAt).not.toBeNull();
		const first = r.s.firstMealAt;
		r.s.events = [];
		let second = false;
		for (let i = 0; i < 16; i++) {
			for (const id of r.prepareRound()) {
				r.apply(id, id === "ada" && !second ? "gather" : "rest");
				if (id === "ada") second = true;
			}
		}
		expect(second).toBe(true);
		expect(r.s.firstMealAt).toBe(first);
		expect(r.s.events.filter((e) => e.kind === "shared-meal")).toHaveLength(0);
	});
	it("requires an actual shared interaction interval rather than last-minute arrival", () => {
		const r = fixture();
		settleRound(r, { ada: "talk", lea: "drink" });
		const job = actor(r.s, "ada").job;
		assert(job);
		const late = {
			...actor(r.s, "lea"),
			place: "hall",
			job: undefined,
			idleSince: job.end,
		};
		expect(overlapMinutes(job, late, job.end)).toBe(0);
		const present = { ...late, idleSince: job.arrive };
		expect(overlapMinutes(job, present, job.end)).toBe(30);
	});
	it("records external LLM choice without invoking HF decide", () => {
		const r = createRuntime(42, 8);
		r.prepareRound();
		r.acceptExternalChoice(
			"ada",
			"rest",
			"I need a quiet break.",
			"test-model",
		);
		expect(actor(exported(r), "ada").person.trace).toEqual([]);
		r.apply("ada", "rest");
		expect(
			r.view().people.find((p) => p.id === "ada")?.decision?.source,
		).toContain("LLM policy with HF person state");
	});
	it("rejects malformed saved evidence and event references", () => {
		const r = createRuntime(42, 8);
		r.step();
		for (const mutate of [
			(s: Save) => {
				actor(s, "ada").decision = {
					chosen: "x",
					label: "x",
					reason: "forged",
					options: [],
					source: "HF 2.2.1",
					decidedAt: s.now,
					round: s.round,
				};
			},
			(s: Save) => {
				const e = s.events[0];
				assert(e);
				e.actorId = "missing-person";
			},
			(s: Save) => {
				actor(s, "ada").received = [
					{
						id: 1,
						at: s.now,
						kind: "invented",
						text: "false",
						causes: [],
						importance: 1,
						targetId: "ada",
					},
				];
			},
		]) {
			const s = exported(r);
			mutate(s);
			expect(() => restoreRuntime(s)).toThrow();
		}
	});
	it("rejects seeds that cannot round-trip", () => {
		for (const seed of [-1, Number.MAX_SAFE_INTEGER, 2 ** 32])
			expect(() => createRuntime(seed)).toThrow();
	});
});
describe("physical inspection encounter", () => {
	it("seed42 HF choices produce a received explanation, without remote teaching", () => {
		const r = createRuntime();
		for (let i = 0; i < 8; i++) r.step();
		const s = exported(r);
		const ada = actor(s, "ada"),
			lea = actor(s, "lea");
		expect(
			s.events.some((e) => e.kind === "question" && e.actorId === "ada"),
		).toBe(true);
		expect(
			s.events.some(
				(e) =>
					e.kind === "hall-explanation" &&
					e.actorId === "lea" &&
					e.targetId === "ada",
			),
		).toBe(true);
		expect(
			ada.received?.some(
				(e) => e.kind === "hall-explanation" && e.actorId === "lea",
			),
		).toBe(true);
		expect(
			ada.person.methods?.rules.some((rule) =>
				rule.evidence.some((e) => e.sourceId === "lea"),
			),
		).toBe(true);
		expect(
			lea.received?.some((e) => e.kind === "question" && e.actorId === "ada"),
		).toBe(true);
	});
	it("received teaching changes a later choice under matched physical circumstances", () => {
		const r = createRuntime();
		for (let i = 0; i < 8; i++) r.step();
		const s = exported(r);
		const ada = actor(s, "ada");
		assert(ada.job);
		finish(ada.person, {
			affordanceId: ada.job.offer.id,
			action: ada.job.offer.action,
			status: "interrupted",
			at: s.now,
		});
		const p = s.places.find((p) => p.id === ada.job?.offer.placeId);
		assert(p);
		p.reserved--;
		delete ada.job;
		ada.place = "hall";
		s.hall = 12;
		s.hallSafe = false;
		s.pending = ["ada"];
		ada.question = undefined;
		const intact = new Runtime(structuredClone(s));
		const deprivedState = structuredClone(s);
		actor(deprivedState, "ada").person.methods = undefined;
		const deprived = new Runtime(deprivedState);
		const intactChoice = intact.choose("ada");
		const deprivedChoice = deprived.choose("ada");
		expect(intactChoice).not.toBe(deprivedChoice);
		expect(
			actor(intact.s, "ada").record?.considered.some((c) =>
				c.terms.some((t) => t.source.startsWith("method:")),
			),
		).toBe(true);
		expect(stateHash(intact.export())).not.toBe(stateHash(deprived.export()));
	});
});

it("teacher and learner completing together acquire the same method in either processing order", () => {
	function classBoundary(reverse: boolean) {
		const s = exported(createRuntime(42, 8));
		const learner = actor(s, "ada"),
			teacher = actor(s, "lea");
		learner.place = "school";
		teacher.place = "school";
		const teacherOffer = buildOffers(s, "lea").find((a) => a.id === "teach");
		assert(teacherOffer);
		begin(teacher.person, teacherOffer, decide(teacher.person, [teacherOffer]));
		teacher.job = {
			offer: teacherOffer,
			end: 600,
			arrive: 480,
			from: "school",
			event: 1,
			food: 0,
			tools: 0,
		};
		tick(learner.person, 540);
		const learnerOffer = buildOffers(s, "ada").find((a) => a.id === "learn");
		assert(learnerOffer);
		begin(learner.person, learnerOffer, decide(learner.person, [learnerOffer]));
		learner.job = {
			offer: learnerOffer,
			end: 600,
			arrive: 540,
			from: "school",
			event: 2,
			food: 0,
			tools: 0,
		};
		for (const r of s.people) tick(r.person, 585);
		s.now = 585;
		s.round = 7;
		s.nextEvent = 3;
		const school = s.places.find((p) => p.id === "school");
		assert(school);
		school.reserved = 2;
		if (reverse) s.people.reverse();
		const runtime = new Runtime(s);
		runtime.prepareRound();
		return actor(runtime.s, "ada").person.methods?.rules.map((r) => ({
			action: r.action,
			conditions: r.conditions,
			evidence: r.evidence.map((e) => ({
				sourceId: e.sourceId,
				outcome: e.outcome,
			})),
		}));
	}
	const forward = classBoundary(false);
	expect(forward).toHaveLength(2);
	expect(classBoundary(true)).toEqual(forward);
});
it("withholding physical overlap prevents the lesson and does not invalidate a response already underway", () => {
	function scheduled(withhold: boolean) {
		const r = fixture();
		const ids = r.prepareRound();
		r.apply("ada", "ask-inspector");
		r.apply("lea", "answer-inspection:ada");
		for (const id of ids.filter((id) => id !== "ada" && id !== "lea"))
			r.apply(id, "rest");
		r.prepareRound();
		if (withhold) {
			const ada = actor(r.s, "ada");
			const job = ada.job;
			assert(job);
			finish(ada.person, {
				affordanceId: job.offer.id,
				action: job.offer.action,
				status: "interrupted",
				at: r.s.now,
			});
			const hall = r.s.places.find((p) => p.id === "hall");
			assert(hall);
			hall.reserved--;
			delete ada.job;
			r.s.pending.push("ada");
			r.apply("ada", "work");
			expect(() => restoreRuntime(r.export())).not.toThrow();
		}
		r.prepareRound();
		return actor(r.s, "ada");
	}
	expect(
		scheduled(false).person.methods?.rules.some((rule) =>
			rule.evidence.some((e) => e.sourceId === "lea"),
		),
	).toBe(true);
	expect(scheduled(true).person.methods).toBeUndefined();
});
it("sleeping residents count as physically present, while they do not become social companions", () => {
	const r = fixture();
	actor(r.s, "ada").place = "homes";
	r.prepareRound();
	r.apply("ada", "sleep");
	expect(r.view().places.find((p) => p.id === "homes")?.occupants).toBe(2);
	expect(presentAt(actor(r.s, "ada"), "homes", r.s.now)).toBe(false);
});
it("supports the maximum accepted population with a legal fallback for every resident", () => {
	const r = createRuntime(42, 300);
	r.step();
	expect(r.view().people).toHaveLength(300);
	expect(r.view().diagnostics.filter((d) => d.severity === "error")).toEqual(
		[],
	);
	expect(() => createRuntime(42, 301)).toThrow();
});
it("completion witnesses see the same people regardless of completion processing order", () => {
	const source = fixture();
	for (const person of source.s.people) person.place = "hall";
	for (const id of source.prepareRound()) source.apply(id, "talk");
	const state = source.export() as Save;
	function completed(reverse: boolean) {
		const s = structuredClone(state);
		if (reverse) s.people.reverse();
		const r = new Runtime(s);
		r.prepareRound();
		r.prepareRound();
		return actor(r.s, "ada")
			.person.memory.episodes.filter((e) =>
				e.summary.includes("finished visit neighbours"),
			)
			.map((e) => e.summary)
			.sort();
	}
	const forward = completed(false);
	expect(forward).toHaveLength(7);
	expect(completed(true)).toEqual(forward);
});
it("a trained inspector asks about loose supports without reading her own note as testimony", () => {
	const r = fixture();
	r.s.hall = 4;
	for (const id of r.prepareRound())
		r.apply(id, id === "lea" ? "post-structural-question" : "rest");
	const lea = actor(r.s, "lea");
	expect(lea.question?.note.text).toContain("loose supports");
	r.prepareRound();
	expect(
		lea.received?.some((e) => e.actorId === "lea" && e.kind === "question") ??
			false,
	).toBe(false);
});
