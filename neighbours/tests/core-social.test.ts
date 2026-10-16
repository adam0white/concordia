import { expect, it } from "vitest";
import { createRuntime, restoreRuntime } from "../src/core/index.ts";
import { Runtime } from "../src/core/runtime.ts";
import type { Save } from "../src/core/state.ts";

function town() {
	const r = new Runtime(createRuntime(42, 8).export() as Save);
	r.s.hall = 12;
	r.s.hallSafe = true;
	for (const p of r.s.people) p.person.agenda.commitments = [];
	r.actor("ada").place = "hall";
	r.actor("musa").place = "hall";
	return r;
}
function round(r: Runtime, actions: Record<string, string> = {}) {
	for (const id of r.prepareRound())
		r.apply(id, actions[id] ?? r.actor(id).job?.offer.id ?? "rest");
}
function tie(r: Runtime, a: string, b: string) {
	return r.actor(a).person.social.relationships.find((x) => x.otherId === b);
}
it("does not turn a repair bystander into social company", () => {
	const r = town();
	r.s.hall = 0;
	r.s.hallSafe = false;
	round(r, { ada: "talk", musa: "repair" });
	round(r);
	round(r);
	expect(tie(r, "ada", "musa")).toBeUndefined();
	expect(tie(r, "musa", "ada")).toBeUndefined();
});
it("records one bilateral encounter for overlapping social actions of unequal length", () => {
	const r = town();
	round(r, { ada: "talk", musa: "gather" });
	round(r);
	round(r);
	const a = tie(r, "ada", "musa"),
		m = tie(r, "musa", "ada");
	expect(a).toBeDefined();
	expect(m).toBeDefined();
	expect(a?.familiarity).toBeCloseTo(m?.familiarity ?? -1, 6);
	const before = a?.affection;
	round(r);
	round(r);
	expect(tie(r, "ada", "musa")?.affection).toBeCloseTo(before ?? -1, 6);
	expect(tie(r, "musa", "ada")?.affection).toBeCloseTo(before ?? -1, 6);
});
it("requires another engaged diner for the first shared meal", () => {
	const r = town();
	round(r, { ada: "gather" });
	for (let i = 0; i < 4; i++) round(r);
	expect(r.s.firstMealAt).toBeNull();
	expect(r.s.events.filter((e) => e.kind === "shared-meal")).toEqual([]);
	const shared = town();
	round(shared, { ada: "gather", musa: "gather" });
	for (let i = 0; i < 4; i++) round(shared);
	expect(shared.s.firstMealAt).not.toBeNull();
	expect(shared.s.events.filter((e) => e.kind === "shared-meal")).toHaveLength(
		1,
	);
});
it("lets an existing tie change HF social terms before choosing", () => {
	function choice(affection: number) {
		const r = town();
		r.actor("ada").person.agenda.goals = [];
		r.actor("ada").person.needs.belonging = 0;
		r.actor("ada").person.social.relationships.push({
			otherId: "musa",
			affection,
			trust: 0.5,
			respect: 0,
			familiarity: 1,
			roles: [],
			ledger: 0,
			lastInteraction: 480,
		});
		r.prepareRound();
		r.apply("musa", "talk");
		r.choose("ada");
		expect(
			r.offers.get("ada")?.find((o) => o.action === "talk")?.with,
		).toContain("musa");
		return (
			r
				.actor("ada")
				.record?.considered.flatMap((c) =>
					c.terms.filter((t) => t.source === "social:musa").map((t) => t.value),
				) ?? []
		);
	}
	const dislike = choice(-1),
		like = choice(1);
	expect(dislike.length).toBeGreaterThan(0);
	expect(like).not.toEqual(dislike);
});
it("restores contact receipts without applying the same encounter twice", () => {
	const r = town();
	round(r, { ada: "talk", musa: "gather" });
	round(r);
	round(r);
	const restored = restoreRuntime(r.export());
	for (let i = 0; i < 4; i++) {
		r.step();
		restored.step();
	}
	expect(restored.export()).toEqual(r.export());
});
it("does not preview a busy repairer or a neighbour still travelling as company", () => {
	const r = town();
	r.s.hall = 0;
	r.s.hallSafe = false;
	r.prepareRound();
	r.apply("musa", "repair");
	r.choose("ada");
	expect(r.offers.get("ada")?.find((o) => o.action === "talk")?.with).toEqual(
		[],
	);
	const travel = town();
	travel.actor("musa").place = "homes";
	travel.prepareRound();
	travel.apply("musa", "talk");
	travel.choose("ada");
	expect(
		travel.offers.get("ada")?.find((o) => o.action === "talk")?.with,
	).toEqual([]);
});
it("rejects a forged future contact receipt", () => {
	const r = town();
	round(r, { ada: "talk", musa: "gather" });
	round(r);
	round(r);
	const save = r.export() as Save;
	const musa = save.people.find((p) => p.person.id === "musa");
	expect(musa?.job?.socialContacts).toHaveLength(1);
	const contact = musa?.job?.socialContacts?.[0];
	if (contact) contact.event = save.nextEvent;
	expect(() => restoreRuntime(save)).toThrow("Invalid social contact receipt");
});
