import assert from "node:assert/strict";
import { expect, it } from "vitest";
import { createRuntime, restoreRuntime } from "../src/core/index.ts";
import { Runtime } from "../src/core/runtime.ts";
import type { Save } from "../src/core/state.ts";

it("releases a dead actor reservation without completing or consuming its meal", () => {
	const r = new Runtime(createRuntime(42, 8).export() as Save);
	r.prepareRound();
	r.apply("ada", "eat");
	for (const id of [...r.s.pending]) r.apply(id, "rest");
	const ada = r.actor("ada");
	const money = ada.wealth;
	ada.person.body.alive = false;
	r.prepareRound();
	expect(r.s.pending).not.toContain("ada");
	expect(ada.job).toBeUndefined();
	expect(ada.wealth).toBe(money + 1);
	expect(r.s.consumed).toBe(0);
	expect(r.view().people.find((p) => p.id === "ada")?.lifeState).toBe("dead");
	expect(() => restoreRuntime(r.export())).not.toThrow();
});
it("offers a downed actor genuine local floor rest with no travel", () => {
	const r = new Runtime(createRuntime(42, 8).export() as Save);
	const ada = r.actor("ada");
	ada.person.body.downed = { since: 480, reason: "injury" };
	r.prepareRound();
	const offer = r.affordances("ada").find((a) => a.id === "rest-here");
	assert(offer);
	expect(offer.placeId).toBe("workshop");
	expect(offer.duration).toBe(45);
	r.apply("ada", "rest-here");
	expect(ada.job?.arrive).toBe(r.s.now);
	expect(() => restoreRuntime(r.export())).not.toThrow();
});
it("returns a repair tool on interruption without inventing completed repairs", () => {
	const r = new Runtime(createRuntime(42, 8).export() as Save);
	r.prepareRound();
	r.apply("ada", "repair");
	for (const id of [...r.s.pending]) r.apply(id, "rest");
	const ada = r.actor("ada");
	assert(ada.person.activity);
	ada.person.activity.interrupt = { at: r.s.now, reason: "injury" };
	r.prepareRound();
	expect(ada.job).toBeUndefined();
	expect(r.s.tools).toBe(3);
	expect(r.s.hall).toBe(0);
	expect(() => restoreRuntime(r.export())).not.toThrow();
});
it("allows an asleep actor away from home to continue genuine local sleep through HF", () => {
	const r = new Runtime(createRuntime(42, 8).export() as Save);
	const ada = r.actor("ada");
	ada.person.agenda.commitments = [];
	r.prepareRound();
	ada.person.body.asleep = true;
	ada.person.body.sleepPressure = 0.8;
	const choice = r.choose("ada");
	expect(choice).toBe("sleep-here");
	r.apply("ada", choice);
	expect(ada.job?.arrive).toBe(r.s.now);
	expect(ada.person.activity?.affordance.mode).toBe("sleep");
});
it("retains death evidence and does not emit repeated deaths after log pruning", () => {
	const r = new Runtime(createRuntime(42, 8).export() as Save);
	r.actor("ada").person.body.alive = false;
	r.prepareRound();
	const first = r.actor("ada").lifeEvent;
	assert(first);
	for (const id of [...r.s.pending]) r.apply(id, "rest");
	for (let i = 0; i < 410; i++) r.event("delivery", "Routine delivery.");
	r.prepareRound();
	expect(r.actor("ada").lifeEvent).toEqual(first);
	expect(r.view().people.find((p) => p.id === "ada")?.lifeEvent).toEqual(first);
	expect(() => restoreRuntime(r.export())).not.toThrow();
});
it("lets HF choose a genuine rest action during a rest-compatible break", () => {
	const r = new Runtime(createRuntime(42, 8).export() as Save);
	r.prepareRound();
	const ada = r.actor("ada");
	ada.person.affect.crisis = {
		stress: 1,
		checkedAt: r.s.now,
		break: { behaviourId: "withdraw", since: r.s.now, until: r.s.now + 120 },
		lastBreakAt: r.s.now,
		breaks: 1,
		behaviours: [{ id: "withdraw", actions: ["rest"] }],
	};
	const selected = r.choose("ada");
	expect(r.affordances("ada").find((a) => a.id === selected)?.action).toBe(
		"rest",
	);
	r.apply("ada", selected);
	expect(ada.person.activity?.affordance.action).toBe("rest");
	expect(r.view().people.find((p) => p.id === "ada")?.lifeState).toBe("break");
});

it("rejects a death claim attached to a living person", () => {
	const r = new Runtime(createRuntime(42, 8).export() as Save);
	r.actor("ada").person.body.alive = false;
	r.prepareRound();
	const save = r.export() as Save;
	const ada = save.people.find((p) => p.person.id === "ada");
	assert(ada);
	ada.person.body.alive = true;
	expect(() => restoreRuntime(save)).toThrow("Invalid lifecycle evidence");
});
it("permits on-site floor rest at a full activity venue without reserving another slot", () => {
	const r = new Runtime(createRuntime(42, 8).export() as Save);
	r.prepareRound();
	for (const id of r.s.pending.filter((id) => id !== "ada").slice(0, 6))
		r.apply(id, "care");
	const ada = r.actor("ada");
	ada.place = "clinic";
	ada.person.body.downed = { since: r.s.now, reason: "injury" };
	expect(r.s.places.find((p) => p.id === "clinic")?.reserved).toBe(6);
	r.apply("ada", "rest-here");
	expect(r.s.places.find((p) => p.id === "clinic")?.reserved).toBe(6);
	expect(r.view().diagnostics.filter((d) => d.severity === "error")).toEqual(
		[],
	);
	expect(() => restoreRuntime(r.export())).not.toThrow();
});
it("rotates capacity priority by keyed round and restores the exact pending order", () => {
	const r = new Runtime(createRuntime(42, 208).export() as Save);
	const first = new Set<string>();
	for (let round = 0; round < 64; round++) {
		const ready = r.prepareRound();
		if (ready[0]) first.add(ready[0]);
		if (round === 7 || round === 31 || round === 63) {
			const restored = restoreRuntime(r.export());
			expect((restored.export() as Save).pending).toEqual(ready);
			for (const id of ready) restored.apply(id, "rest");
			for (const id of ready) r.apply(id, "rest");
			expect(restored.export()).toEqual(r.export());
			continue;
		}
		for (const id of ready) r.apply(id, "rest");
	}
	expect(first.size).toBeGreaterThan(12);
});

it("does not let table, random or external control bypass sleeping body vetoes", () => {
	for (const policy of ["table", "random"] as const) {
		const r = new Runtime(createRuntime(42, 8).export() as Save);
		r.prepareRound();
		const ada = r.actor("ada");
		ada.person.agenda.commitments = [];
		ada.person.body.asleep = true;
		ada.person.body.sleepPressure = 0.8;
		expect(r.getChoices("ada").map((c) => c.id)).toEqual(["sleep-here"]);
		expect(() =>
			r.acceptExternalChoice("ada", "inspect", "Inspect", "fixture"),
		).toThrow();
		const chosen = r.choose("ada", policy);
		expect(chosen).toBe("sleep-here");
		r.apply("ada", chosen);
		expect(ada.person.activity?.mode).toBe("sleep");
	}
});
it("does not duplicate local sleep while asleep during a break", () => {
	const r = new Runtime(createRuntime(42, 8).export() as Save);
	r.prepareRound();
	const ada = r.actor("ada");
	ada.person.body.asleep = true;
	ada.person.body.sleepPressure = 0.8;
	ada.person.affect.crisis = {
		stress: 1,
		checkedAt: r.s.now,
		break: { behaviourId: "sleep", since: r.s.now, until: r.s.now + 120 },
		breaks: 1,
		behaviours: [{ id: "sleep", actions: ["sleep"] }],
	};
	expect(
		r.affordances("ada").filter((a) => a.id === "sleep-here"),
	).toHaveLength(1);
});
