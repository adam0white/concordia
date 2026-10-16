import { promise } from "@adam0white/human-framework";
import { describe, expect, it } from "vitest";
import { createRuntime, restoreRuntime } from "../src/core/index.ts";
import { Runtime } from "../src/core/runtime.ts";
import type { Save } from "../src/core/state.ts";

function sleeping(appointment: boolean) {
	const r = new Runtime(createRuntime(42, 8).export() as Save);
	const ada = r.actor("ada");
	ada.place = "homes";
	ada.person.body.sleepPressure = 0.6;
	ada.person.body.hydration = 1;
	ada.person.body.satiety = 1;
	if (appointment)
		promise(ada.person, {
			kind: "appointment",
			actions: ["drink"],
			from: 570,
			until: 600,
			importance: 1,
			label: "Meet a timed obligation",
		});
	for (const id of r.prepareRound())
		r.apply(id, id === "ada" ? "sleep" : "rest");
	return r;
}
describe("the host honours HF activity reviews", () => {
	it("ordinary appointment review can wake a sleeper; control stays asleep", () => {
		const a = sleeping(true),
			b = sleeping(false);
		for (let i = 0; i < 7; i++) {
			a.step();
			b.step();
		}
		expect(a.s.now).toBe(600);
		expect(a.actor("ada").person.body.asleep).toBe(false);
		expect(a.actor("ada").job?.offer.action).toBe("drink");
		expect(
			a.s.events.filter((e) => e.actorId === "ada" && e.kind === "interrupted"),
		).toHaveLength(1);
		expect(b.actor("ada").person.body.asleep).toBe(true);
		a.step();
		expect(
			a
				.actor("ada")
				.person.agenda.commitments.find(
					(c) => c.label === "Meet a timed obligation",
				)?.status,
		).toBe("kept");
		expect(b.actor("ada").person.body.asleep).toBe(true);
		expect(() => restoreRuntime(a.export())).not.toThrow();
	});
	it("continuing a due review retains the original job and all reservations", () => {
		const r = sleeping(false),
			ada = r.actor("ada");
		const job = structuredClone(ada.job);
		if (!ada.person.activity || !job) throw Error("Missing sleep job");
		ada.person.activity.reviewAt = r.s.now + 15;
		const prepared = r.prepareRound();
		expect(prepared).toContain("ada");
		r.choose("ada");
		r.apply("ada", job.offer.id);
		expect(ada.job).toEqual(job);
		expect(ada.person.activity.reviewAt).toBeGreaterThan(r.s.now);
		expect(r.s.places.find((p) => p.id === "homes")?.reserved).toBe(8);
		expect(
			r.s.events.filter((e) => e.actorId === "ada" && e.kind === "interrupted"),
		).toEqual([]);
	});
});

it("records real conversation before a review ends the visit", () => {
	const r = new Runtime(createRuntime(42, 8).export() as Save);
	r.s.hall = 12;
	r.s.hallSafe = true;
	r.actor("ada").place = "hall";
	r.actor("musa").place = "hall";
	for (const id of r.prepareRound())
		r.apply(id, ["ada", "musa"].includes(id) ? "gather" : "rest");
	const ada = r.actor("ada"),
		musa = r.actor("musa");
	if (!ada.person.activity) throw Error("Missing gathering");
	ada.person.activity.reviewAt = r.s.now + 15;
	r.prepareRound();
	expect(
		ada.person.social.relationships.some(
			(rel) => rel.otherId === "musa" && rel.familiarity > 0,
		),
	).toBe(true);
	expect(
		musa.person.social.relationships.some(
			(rel) => rel.otherId === "ada" && rel.familiarity > 0,
		),
	).toBe(true);
	r.apply("ada", "drink");
	expect(r.s.consumed).toBe(0);
});

it("a travel review waits for arrival, then switching refunds the tool exactly once", () => {
	const r = new Runtime(createRuntime(42, 8).export() as Save);
	for (const id of r.prepareRound())
		r.apply(id, id === "ada" ? "repair" : "rest");
	const ada = r.actor("ada");
	if (!ada.person.activity) throw Error("Missing repair");
	ada.person.activity.reviewAt = r.s.now + 15;
	expect(r.prepareRound()).not.toContain("ada");
	expect(r.s.tools).toBe(2);
	expect(r.prepareRound()).toContain("ada");
	r.choose("ada");
	r.apply("ada", "rest");
	expect(r.s.tools).toBe(3);
	expect(r.s.hall).toBe(0);
	expect(ada.place).toBe("hall");
	expect(ada.job?.from).toBe("hall");
	expect(r.s.places.find((p) => p.id === "hall")?.reserved).toBe(0);
	expect(
		r.s.events.filter((e) => e.actorId === "ada" && e.kind === "interrupted"),
	).toHaveLength(1);
	expect(ada.decision?.source).toBe("Host control");
});
it("the headless convenience step rejects an external-controller world before advancing", () => {
	const r = new Runtime(createRuntime(42, 8).export() as Save);
	r.actor("ada").policy = "llm";
	const before = r.export();
	expect(() => r.step()).toThrow("external controller");
	expect(r.export()).toEqual(before);
});
