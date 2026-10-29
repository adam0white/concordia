import assert from "node:assert/strict";
import { tick } from "@adam0white/human-framework";
import { describe, expect, it } from "vitest";
import { eveningOffers, updateEvenings } from "../src/core/evenings.ts";
import { Runtime } from "../src/core/runtime.ts";
import type { Save } from "../src/core/state.ts";
import { createRuntime, restoreRuntime } from "./historical-runtime.ts";

type Kind = "class" | "meal";
function initial() {
	const r = new Runtime(createRuntime(42, 8).export() as Save);
	r.s.hall = 12;
	r.s.hallSafe = true;
	updateEvenings(r);
	r.s.now = 1920;
	r.s.round = 96;
	for (const p of r.s.people) {
		const body = structuredClone(p.person.body);
		tick(p.person, r.s.now);
		p.person.body = { ...body, since: r.s.now };
		p.place = ["sam", "lea", "ada"].includes(p.person.id) ? "hall" : "homes";
	}
	updateEvenings(r);
	return r;
}
function round(r: Runtime, actions: Record<string, string> = {}) {
	const acted: string[] = [];
	for (const id of r.prepareRound()) {
		const requested = actions[id];
		const legal =
			requested && r.affordances(id).some((o) => o.id === requested);
		r.apply(id, legal ? requested : (r.actor(id).job?.offer.id ?? "drink"));
		if (legal) acted.push(id);
	}
	return acted;
}
function perform(r: Runtime, id: string, action: string) {
	for (let i = 0; i < 16; i++)
		if (round(r, { [id]: action }).includes(id)) return;
	throw Error(`${id} did not become available for ${action}`);
}
function readyCheck(r: Runtime, actor: string, check: () => void) {
	for (let attempts = 0; attempts < 16; attempts++) {
		let checked = false;
		for (const id of r.prepareRound()) {
			if (id === actor && !r.actor(id).job) {
				expect(r.actor(id).job).toBeUndefined();
				check();
				checked = true;
			}
			r.apply(id, r.actor(id).job?.offer.id ?? "drink");
		}
		if (checked) return;
	}
	throw Error(`No decision boundary for ${actor}`);
}
function event(r: Runtime, kind: Kind) {
	const e = r.s.socialEvenings?.events.find(
		(e) => e.id === `evening-0-${kind}`,
	);
	assert(e);
	return e;
}
function proposed(kind: Kind) {
	const r = initial(),
		host = kind === "class" ? "lea" : "sam";
	round(r, { [host]: `propose:evening-0-${kind}`, ada: "talk" });
	round(r);
	perform(r, "ada", `accept:evening-0-${kind}`);
	for (
		let i = 0;
		i < 16 && event(r, kind).replies.ada?.reply !== "accepted";
		i++
	)
		round(r);
	expect(event(r, kind).replies.ada?.reply).toBe("accepted");
	return r;
}
function prepared(kind: Kind) {
	const r = proposed(kind),
		host = kind === "class" ? "lea" : "sam";
	perform(r, host, `prepare:evening-0-${kind}`);
	for (let i = 0; i < 16 && event(r, kind).stage !== "prepared"; i++) round(r);
	expect(event(r, kind).stage).toBe("prepared");
	return r;
}
function advance(r: Runtime, at: number) {
	for (let i = 0; i < 384 && r.s.now < at; i++) round(r);
	expect(r.s.now).toBeGreaterThanOrEqual(at);
}
function settle(r: Runtime, kind: Kind) {
	advance(r, event(r, kind).endsAt + 135);
}
function cash(r: Runtime) {
	return r.s.people.reduce((sum, p) => sum + p.wealth, 0);
}
function conserved(r: Runtime) {
	expect(r.view().diagnostics.filter((d) => d.severity === "error")).toEqual(
		[],
	);
	expect(() => restoreRuntime(r.export())).not.toThrow();
}

describe("physical delivery of a planned evening", () => {
	it.each(["class", "meal"] as const)(
		"an empty %s has no delivered lesson or meal",
		(kind) => {
			const r = prepared(kind),
				host = kind === "class" ? "lea" : "sam";
			advance(r, event(r, kind).startsAt - 75);
			perform(r, host, `host:evening-0-${kind}`);
			settle(r, kind);
			expect(event(r, kind).replies[host]?.delivered).toBe(false);
			expect(
				Object.values(event(r, kind).replies).some((x) => x.delivered),
			).toBe(false);
			expect(r.s.events.filter((e) => e.kind === "evening-attended")).toEqual(
				[],
			);
			expect(r.s.consumed).toBe(0);
			conserved(r);
		},
	);
	it.each(["class", "meal"] as const)(
		"attending %s without the organiser gives no delivery or kept promise",
		(kind) => {
			const r = prepared(kind);
			advance(r, event(r, kind).startsAt - 45);
			const beforeCash = cash(r),
				beforeFood = r.s.consumed;
			perform(r, "ada", `attend:evening-0-${kind}`);
			settle(r, kind);
			const e = event(r, kind),
				reply = e.replies.ada;
			assert(reply);
			expect(reply.delivered).toBe(false);
			expect(reply.attendedMinutes).toBe(0);
			expect(r.actor("ada").person.methods).toBeUndefined();
			expect(
				r
					.actor("ada")
					.person.agenda.commitments.find((c) => c.id === reply.commitmentId)
					?.status,
			).not.toBe("kept");
			expect(cash(r)).toBe(beforeCash);
			expect(r.s.consumed).toBe(beforeFood);
			conserved(r);
		},
	);
	it("a present teacher and learner receive an actual retained method", () => {
		const r = prepared("class"),
			e = event(r, "class");
		advance(r, e.startsAt - 75);
		perform(r, "lea", `host:${e.id}`);
		perform(r, "ada", `attend:${e.id}`);
		settle(r, "class");
		expect(e.replies.ada?.delivered).toBe(true);
		expect(e.replies.ada?.attendedMinutes).toBeGreaterThanOrEqual(15);
		expect(r.actor("ada").person.methods?.rules.length).toBeGreaterThan(0);
		expect(
			r
				.actor("ada")
				.person.agenda.commitments.find(
					(c) => c.id === e.replies.ada?.commitmentId,
				)?.status,
		).toBe("kept");
		expect(r.s.consumed).toBe(0);
		conserved(r);
	});
	it("a present supper host delivers exactly one reserved meal and charges one coin", () => {
		const r = prepared("meal"),
			e = event(r, "meal");
		advance(r, e.startsAt - 75);
		const beforeCash = cash(r),
			beforeConsumed = r.s.consumed;
		perform(r, "sam", `host:${e.id}`);
		perform(r, "ada", `attend:${e.id}`);
		settle(r, "meal");
		expect(e.replies.ada?.delivered).toBe(true);
		expect(cash(r)).toBe(beforeCash - 1);
		expect(r.s.consumed).toBe(beforeConsumed + 1);
		conserved(r);
	});
	it("interrupting preparation releases the exclusive room booking", () => {
		const r = proposed("meal"),
			e = event(r, "meal");
		perform(r, "sam", `prepare:${e.id}`);
		const a = r.actor("sam").person.activity;
		assert(a);
		a.interrupt = { at: r.s.now, reason: "injury" };
		perform(r, "sam", "rest");
		expect(e.stage).toBe("proposed");
		expect(e.bookingEvent).toBeUndefined();
		expect(r.actor("sam").job?.offer.id).not.toBe(`prepare:${e.id}`);
		conserved(r);
	});

	it("ordinary hall meals cannot occupy the booked hour", () => {
		const r = prepared("class");
		readyCheck(r, "musa", () =>
			expect(r.affordances("musa").some((o) => o.action === "gather")).toBe(
				true,
			),
		);
		advance(r, event(r, "class").startsAt - 15);
		readyCheck(r, "musa", () =>
			expect(r.affordances("musa").some((o) => o.action === "gather")).toBe(
				false,
			),
		);
	});
	it("a stranger who did not read the notice cannot accept or attend", () => {
		const r = prepared("meal"),
			e = event(r, "meal");
		expect(e.replies.musa).toBeUndefined();
		readyCheck(r, "musa", () => {
			expect(r.affordances("musa").some((o) => o.id === `accept:${e.id}`)).toBe(
				false,
			);
			expect(() => r.apply("musa", `accept:${e.id}`)).toThrow(
				"Action is not currently legal",
			);
		});
		advance(r, e.startsAt - 30);
		readyCheck(r, "musa", () => {
			expect(r.affordances("musa").some((o) => o.id === `attend:${e.id}`)).toBe(
				false,
			);
			expect(() => r.apply("musa", `attend:${e.id}`)).toThrow(
				"Action is not currently legal",
			);
		});
	});
});

it("keeps the organiser's seat available while guests reserve the other nine", () => {
	const r = prepared("meal");
	advance(r, event(r, "meal").startsAt - 60);
	const hall = r.s.places.find((p) => p.id === "hall");
	assert(hall);
	// Offer-boundary capacity input: nine guest bookings, one organiser place.
	// This isolates the seat rule; full runtime conservation is checked above.
	hall.reserved = 9;
	expect(
		eveningOffers(r.s, r.actor("ada")).some(
			(a) => a.id === "attend:evening-0-meal",
		),
	).toBe(false);
	expect(
		eveningOffers(r.s, r.actor("sam")).some(
			(a) => a.id === "host:evening-0-meal",
		),
	).toBe(true);
});
