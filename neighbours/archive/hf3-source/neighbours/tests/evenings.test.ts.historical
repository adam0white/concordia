import assert from "node:assert/strict";
import { tick } from "@adam0white/human-framework";
import { describe, expect, it } from "vitest";
import { eveningOffers, updateEvenings } from "../src/core/evenings.ts";
import { Runtime } from "../src/core/runtime.ts";
import type { Save } from "../src/core/state.ts";
import { createRuntime, restoreRuntime } from "./historical-runtime.ts";

function opened() {
	const r = new Runtime(createRuntime(42, 8).export() as Save);
	r.s.hall = 12;
	r.s.hallSafe = true;
	updateEvenings(r);
	return r;
}
describe("two real evenings", () => {
	it("starts from actual activation and never invents past invitations", () => {
		const r = opened();
		expect(r.s.socialEvenings?.events).toHaveLength(4);
		expect(r.s.socialEvenings?.events.every((e) => e.startsAt > r.s.now)).toBe(
			true,
		);
		expect(
			r.s.socialEvenings?.events.every(
				(e) => Object.keys(e.replies).length === 0,
			),
		).toBe(true);
		const old = r.export() as Save;
		delete old.socialEvenings;
		const restored = restoreRuntime(old) as Runtime;
		expect(restored.s.socialEvenings).toBeUndefined();
		updateEvenings(restored);
		expect(restored.s.socialEvenings?.openedAt).toBe(old.now);
	});
	it("a candidate is a refusable organiser option, not a broadcast or a commitment", () => {
		const r = opened();
		const sam = r.actor("sam");
		expect(
			eveningOffers({ ...r.s, now: r.s.now + 1440 }, sam).some(
				(a) => a.action === "propose-meal",
			),
		).toBe(true);
		expect(
			eveningOffers(r.s, r.actor("ada")).some(
				(a) => a.action === "accept-evening",
			),
		).toBe(false);
		expect(
			sam.person.agenda.commitments.filter((c) =>
				c.actions.includes("host-meal"),
			),
		).toHaveLength(0);
		expect(r.s.events.some((e) => e.kind === "evening-proposed")).toBe(false);
	});
	it("an actual posted invitation is local; accepting creates one future appointment", () => {
		const r = opened();
		for (let i = 0; i < 96; i++) r.step();
		// A controlled physical checkpoint: no invented perception or commitment.
		for (const p of r.s.people) {
			if (p.job) continue;
			p.place =
				p.person.id === "ada" || p.person.id === "sam" ? "hall" : "homes";
		}
		for (
			let tries = 0;
			tries < 16 && !r.s.socialEvenings?.events[1]?.notice;
			tries++
		) {
			for (const id of r.prepareRound()) {
				const choices = r.getChoices(id);
				const choice =
					id === "sam" && choices.some((c) => c.id === "propose:evening-0-meal")
						? "propose:evening-0-meal"
						: (r.actor(id).job?.offer.id ?? "rest");
				r.apply(id, choice);
			}
		}
		expect(r.s.socialEvenings?.events[1]?.notice).toBeDefined();
	});
});

function morning() {
	const r = opened();
	r.s.now = 1920;
	r.s.round = 96;
	for (const resident of r.s.people) {
		const body = structuredClone(resident.person.body);
		tick(resident.person, r.s.now);
		resident.person.body = { ...body, since: r.s.now };
		resident.place = ["sam", "lea", "ada"].includes(resident.person.id)
			? "hall"
			: "homes";
	}
	updateEvenings(r);
	return r;
}
function controlled(r: Runtime, choices: Record<string, string> = {}) {
	for (const id of r.prepareRound())
		r.apply(id, choices[id] ?? r.actor(id).job?.offer.id ?? "rest");
}
function proposed() {
	const r = morning();
	controlled(r, {
		sam: "propose:evening-0-meal",
		lea: "propose:evening-0-class",
		ada: "talk",
	});
	controlled(r);
	controlled(r, { ada: "accept:evening-0-meal" });
	controlled(r);
	return r;
}
describe("invitation and room controls", () => {
	it("only received notice enables acceptance; reply creates exactly one targeted promise", () => {
		const r = proposed(),
			event = r.s.socialEvenings?.events[1];
		assert(event);
		expect(event.replies.ada?.reply).toBe("accepted");
		expect(event.replies.musa).toBeUndefined();
		expect(
			eveningOffers(r.s, r.actor("musa")).some(
				(a) => a.action === "accept-evening",
			),
		).toBe(false);
		const promises = r
			.actor("ada")
			.person.agenda.commitments.filter((c) =>
				c.actions.includes("attend-meal"),
			);
		expect(promises).toHaveLength(1);
		expect(promises[0]).toMatchObject({
			targetId: "sam",
			toId: "sam",
			from: event.startsAt,
			until: event.endsAt,
			status: "pending",
		});
		expect(
			eveningOffers(r.s, r.actor("ada")).some(
				(a) => a.id === `accept:${event.id}`,
			),
		).toBe(false);
		expect(() => restoreRuntime(r.export())).not.toThrow();
	});
	it("preparing claims one room atomically and remains restorable mid-preparation", () => {
		const r = proposed();
		perform(r, "sam", "prepare:evening-0-meal");
		expect(r.s.socialEvenings?.events[1]?.stage).toBe("preparing");
		expect(
			eveningOffers(r.s, r.actor("lea")).some(
				(a) => a.id === "prepare:evening-0-class",
			),
		).toBe(false);
		const copy = restoreRuntime(r.export());
		for (let i = 0; i < 8; i++) {
			r.step();
			copy.step();
		}
		expect(copy.export()).toEqual(r.export());
	});
	it("new notice readers can reply after preparation, without a room conflict", () => {
		const r = proposed();
		const meal = r.s.socialEvenings?.events[1];
		assert(meal?.notice);
		perform(r, "sam", "prepare:evening-0-meal");
		for (let i = 0; i < 8 && meal.stage !== "prepared"; i++) controlled(r);
		perform(r, "musa", "talk");
		for (let i = 0; i < 4 && !meal.replies.musa; i++) controlled(r);
		expect(meal.replies.musa).toBeDefined();
		expect(
			eveningOffers(r.s, r.actor("musa")).some(
				(a) => a.id === `accept:${meal.id}`,
			),
		).toBe(true);
	});
	it("rejects invented delivery before the scheduled hour", () => {
		const r = proposed();
		const packet = r.export() as Save;
		const reply = packet.socialEvenings?.events[1]?.replies.ada;
		assert(reply);
		Object.assign(reply, {
			attendedMinutes: 60,
			attempted: true,
			delivered: true,
		});
		expect(() => restoreRuntime(packet)).toThrow();
	});
});

function perform(r: Runtime, actor: string, action: string) {
	for (let i = 0; i < 20; i++) {
		let acted = false;
		for (const id of r.prepareRound()) {
			if (id === actor) {
				r.apply(id, action);
				acted = true;
			} else r.apply(id, r.actor(id).job?.offer.id ?? "rest");
		}
		if (acted) return;
	}
	throw Error(`Actor ${actor} never became free`);
}

it("posting a notice uses the outside board rather than taking a room seat", () => {
	const r = morning();
	r.prepareRound();
	const before = r.s.places.find((p) => p.id === "hall")?.reserved;
	r.apply("sam", "propose:evening-0-meal");
	expect(r.s.places.find((p) => p.id === "hall")?.reserved).toBe(before);
});
