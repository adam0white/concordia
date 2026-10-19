/**
 * Phase B controls: behaviour rules read occupations and retained HF methods, never person ids.
 * The seeded town reproduces its earlier intended cast; changing the facts moves the behaviour; renaming or
 * reordering people changes nothing.
 */
import assert from "node:assert/strict";
import type { Affordance } from "@adam0white/human-framework";
import { describe, expect, it } from "vitest";
import {
	holder,
	inspectionInstructor,
	inspectionInstructors,
	taughtByNeighbour,
} from "../src/core/cast.ts";
import { organiserFor } from "../src/core/evenings.ts";
import { cartCast } from "../src/core/handcart.ts";
import { createRuntime, restoreRuntime } from "../src/core/index.ts";
import { buildOffers } from "../src/core/offers.ts";
import { Runtime } from "../src/core/runtime.ts";
import type { Save } from "../src/core/state.ts";
import { teachHallInspection } from "../src/experiments/inspection.ts";

const town = () => new Runtime(createRuntime(42, 8).export() as Save);
function round(r: Runtime, requested: Record<string, string> = {}) {
	for (const id of r.prepareRound()) {
		const actor = r.actor(id);
		const desired = requested[id];
		const action =
			actor.job?.offer.id ??
			(desired && r.getChoices(id).some((c) => c.id === desired)
				? desired
				: r.choose(id));
		r.apply(id, action);
	}
}
function until(
	r: Runtime,
	done: () => boolean,
	requested: Record<string, string> = {},
) {
	for (let i = 0; i < 384 && !done(); i++) round(r, requested);
	expect(done(), `Milestone not reached at ${r.s.now}`).toBe(true);
}
const ids = (offers: Affordance[]) => offers.map((o) => o.id);
const atHall = (r: Runtime, id: string) => {
	const resident = r.actor(id);
	delete resident.job;
	resident.place = "hall";
	return resident;
};

describe("seeded town keeps its intended cast", () => {
	it("derives each position from occupation", () => {
		const r = town();
		expect(holder(r.s, "teacher")?.person.id).toBe("lea");
		expect(holder(r.s, "cook")?.person.id).toBe("sam");
		expect(organiserFor(r.s, "class")).toBe("lea");
		expect(organiserFor(r.s, "meal")).toBe("sam");
		const cast = cartCast(r.s);
		expect([
			cast.repairer.person.id,
			cast.lender.person.id,
			cast.owner.person.id,
		]).toEqual(["ravi", "ada", "jo"]);
	});
	it("Lea can post the structural note because she teaches and retains the method; others cannot", () => {
		const r = town();
		expect(inspectionInstructors(r.s).map((x) => x.person.id)).toEqual(["lea"]);
		atHall(r, "lea");
		const lea = buildOffers(r.s, "lea");
		expect(ids(lea)).toContain("post-structural-question");
		expect(lea.find((o) => o.action === "ask-inspector")?.duration).toBe(15);
		expect(ids(buildOffers(r.s, "lea"))).toContain("teach");
		for (const id of ["ada", "musa", "noor"]) {
			atHall(r, id);
			const offers = buildOffers(r.s, id);
			expect(ids(offers)).not.toContain("post-structural-question");
			expect(offers.find((o) => o.action === "ask-inspector")?.duration).toBe(
				120,
			);
			expect(ids(offers)).toContain("learn");
		}
	});
	it("knowledge without the teaching occupation does not qualify, nor does the occupation without knowledge", () => {
		const r = town();
		const ada = r.actor("ada");
		teachHallInspection(ada.person, "lea", "control-lesson");
		expect(taughtByNeighbour(r.s, ada)).toBe(true);
		expect(inspectionInstructor(ada)).toBe(false);
		const lea = r.actor("lea");
		expect(taughtByNeighbour(r.s, lea)).toBe(false);
		assert(lea.person.methods);
		lea.person.methods.rules = [];
		expect(inspectionInstructor(lea)).toBe(false);
		atHall(r, "lea");
		expect(ids(buildOffers(r.s, "lea"))).not.toContain(
			"post-structural-question",
		);
	});
});

describe("behaviour follows the facts, not the id", () => {
	it("a different teacher with the method posts the note and teaches; Lea then attends", () => {
		const r = town();
		const musa = r.actor("musa"),
			lea = r.actor("lea");
		[musa.role, lea.role] = ["teacher", "gardener"];
		teachHallInspection(musa.person, "prior-trade-course", "control-course");
		expect(inspectionInstructors(r.s).map((x) => x.person.id)).toEqual([
			"musa",
		]);
		expect(organiserFor(r.s, "class")).toBe("musa");
		atHall(r, "musa");
		atHall(r, "lea");
		expect(ids(buildOffers(r.s, "musa"))).toEqual(
			expect.arrayContaining(["post-structural-question", "teach"]),
		);
		const leaOffers = ids(buildOffers(r.s, "lea"));
		expect(leaOffers).toContain("learn");
		expect(leaOffers).not.toContain("post-structural-question");
		expect(
			buildOffers(r.s, "lea").find((o) => o.action === "wait-inspector"),
		).toBeUndefined();
	});
	it("the workshop mechanic is whoever holds that occupation", () => {
		const r = town();
		[r.actor("elin").role, r.actor("ravi").role] = ["mechanic", "nurse"];
		expect(cartCast(r.s).repairer.person.id).toBe("elin");
	});
	it("a resident's questions reach whichever instructor is at the hall", () => {
		const r = town();
		until(r, () => r.s.hall >= 1, { ada: "repair", ravi: "repair" });
		const musa = r.actor("musa"),
			lea = r.actor("lea");
		[musa.role, lea.role] = ["teacher", "gardener"];
		teachHallInspection(musa.person, "prior-trade-course", "control-course");
		atHall(r, "musa");
		atHall(r, "noor");
		r.postQuestion("noor", 0);
		expect(
			musa.received?.some((e) => e.id === r.actor("noor").question?.event),
		).toBe(true);
		expect(
			lea.received?.some((e) => e.id === r.actor("noor").question?.event),
		).not.toBe(true);
		expect(r.instructorSuggestions(musa)).toHaveLength(1);
		expect(r.instructorSuggestions(lea)).toEqual([]);
	});
});

/** Domain-neutral control: replace every known id with an opaque token throughout the save. */
const KNOWN = ["ada", "musa", "elin", "sam", "jo", "lea", "ravi", "noor"];
const TOKENS = Object.fromEntries(KNOWN.map((id, i) => [id, `person-${i}`]));
const pattern = new RegExp(`\\b(${KNOWN.join("|")})\\b`, "g");
const rename = <T>(value: T): T =>
	JSON.parse(
		JSON.stringify(value).replace(pattern, (id) => TOKENS[id] ?? id),
	) as T;
/** Reached checkpoints plus arranged copies that place idle people where the episode rules apply. */
function checkpoints(): { save: Save; arranged: boolean }[] {
	const r = town();
	// These checkpoints are about who holds positions, not timber: start from dry timber (timber.ts).
	r.s.timber = { damp: 0 };
	// The bench-request checkpoint needs Ravi to ask before he finishes the cart on the side bench; with HF
	// fullness he stops drinking idly and can finish first. Positions, not hydration, are under test here.
	for (const p of r.s.people) delete p.person.body.fullness;
	const out = [{ save: structuredClone(r.s), arranged: false }];
	const arrange = (places: Record<string, string>) => {
		const save = structuredClone(r.s);
		for (const [id, place] of Object.entries(places)) {
			const resident = save.people.find((p) => p.person.id === id);
			assert(resident);
			if (resident.job) placesFreed(save, resident.job.offer);
			delete resident.job;
			resident.place = place;
		}
		out.push({ save, arranged: true });
	};
	until(r, () => r.s.hall >= 2, { ada: "repair", lea: "repair" });
	arrange({ lea: "hall", musa: "hall", noor: "hall" });
	until(r, () => r.s.hall >= 12, {
		ada: "repair",
		lea: "repair",
		ravi: "repair",
	});
	until(r, () => r.s.hallSafe, { lea: "open-section" });
	until(r, () => !!r.s.handcart?.raviGoalId, { ravi: "work" });
	out.push({ save: structuredClone(r.s), arranged: false });
	arrange({ ravi: "workshop", ada: "workshop", jo: "quay" });
	until(r, () => (r.s.handcart?.requests.length ?? 0) > 0, {
		ravi: "cart-ask",
	});
	out.push({ save: structuredClone(r.s), arranged: false });
	arrange({ ravi: "workshop", ada: "workshop", jo: "quay" });
	return out;
}
function placesFreed(save: Save, offer: Affordance) {
	const place = save.places.find((p) => p.id === offer.placeId);
	if (place && !offer.tags?.includes("floor")) place.reserved--;
}
describe("renaming and reordering people changes nothing", () => {
	const saves = checkpoints();
	it("the arranged checkpoints exercise the derived episode rules", () => {
		const offered = saves.flatMap(({ save }) => {
			const rt = new Runtime(structuredClone(save));
			return save.people.flatMap((p) =>
				rt.affordances(p.person.id).map((o) => `${p.person.id}:${o.id}`),
			);
		});
		expect(offered).toEqual(
			expect.arrayContaining([
				"lea:post-structural-question",
				"lea:teach",
				"ravi:cart-ask",
				"ravi:cart-slow",
				"ada:cart-agree",
			]),
		);
	});
	it("renamed saves offer the renamed choices to every resident", () => {
		for (const { save, arranged } of saves) {
			const renamed = rename(save);
			// Cast-derived validators accept the real save. The import boundary separately pins
			// each array position to the scenario's seeded identity, so a renamed town is not importable.
			if (!arranged) expect(() => restoreRuntime(save)).not.toThrow();
			expect(() => restoreRuntime(renamed)).toThrow("Invalid resident");
			const before = new Runtime(structuredClone(save));
			const after = new Runtime(structuredClone(renamed));
			for (const r of save.people) {
				const id = r.person.id;
				expect(after.affordances(TOKENS[id] ?? id)).toEqual(
					rename(before.affordances(id)),
				);
				expect(
					after.instructorSuggestions(after.actor(TOKENS[id] ?? id)),
				).toEqual(rename(before.instructorSuggestions(before.actor(id))));
			}
			expect(cartCast(after.s).repairer.person.id).toBe(TOKENS.ravi);
		}
	});
	it("reordered people hold the same positions and receive the same choices", () => {
		for (const { save } of saves) {
			const reordered = structuredClone(save);
			reordered.people.reverse();
			const before = new Runtime(structuredClone(save));
			const after = new Runtime(reordered);
			for (const position of [
				"teacher",
				"cook",
				"cartOwner",
				"cartRepairer",
				"benchHolder",
			] as const)
				expect(holder(after.s, position)?.person.id).toBe(
					holder(before.s, position)?.person.id,
				);
			const sorted = (offers: Affordance[]) =>
				[...offers].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
			for (const r of save.people)
				expect(sorted(after.affordances(r.person.id))).toEqual(
					sorted(before.affordances(r.person.id)),
				);
		}
	});
});
