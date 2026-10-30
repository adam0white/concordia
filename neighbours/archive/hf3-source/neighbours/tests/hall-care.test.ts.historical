/**
 * Phase D hall care (hall-care.ts) and the going-along evening marker (`Save.together`).
 * New towns loosen repaired sections on wet timber and let a resident who sees it adopt one bounded goal; saves
 * without `timber.care` or `together` keep their earlier behaviour.
 */
import type { Affordance } from "@adam0white/human-framework";
import { expect, it } from "vitest";
import { allEvenings } from "../src/core/evenings.ts";
import {
	HALL_GOAL_LABEL,
	LOOSEN_CHANCE,
	loosenHall,
	noticeLooseHall,
	settleHallGoals,
	validateHallCare,
} from "../src/core/hall-care.ts";
import { keyed } from "../src/core/hash.ts";
import { buildOffers } from "../src/core/offers.ts";
import { Runtime } from "../src/core/runtime.ts";
import type { Resident, Save } from "../src/core/state.ts";
import { createRuntime, restoreRuntime } from "./historical-runtime.ts";

const save = () => createRuntime(42, 8).export() as Save;
/** A 06:00 on a day whose keyed draw loosens (or not) at full damp. */
function morning(s: Save, loosens: boolean): Save {
	for (let day = 1; day < 200; day++)
		if (keyed(s.seed, day, "hall-loosen") < LOOSEN_CHANCE === loosens) {
			s.now = day * 1440 + 360;
			return s;
		}
	throw Error("no such day");
}
const hallGoals = (r: Resident) =>
	r.person.agenda.goals.filter(
		(g) => g.label === HALL_GOAL_LABEL && g.status === "active",
	);
function atHall(s: Save, id: string): Resident {
	const r = s.people.find((p) => p.person.id === id);
	if (!r) throw Error(id);
	delete r.job;
	r.place = "hall";
	r.person.body.asleep = false;
	return r;
}

it("new towns carry hall care and the together marker; both validate on restore", () => {
	const s = save();
	expect(s.timber?.care).toEqual({ loosened: 0 });
	expect(s.together).toBe(true);
	expect(() => restoreRuntime(structuredClone(s))).not.toThrow();
	const bad = structuredClone(s) as unknown as { together: unknown };
	bad.together = false;
	expect(() => restoreRuntime(bad)).toThrow("Invalid together marker");
	expect(() => validateHallCare({ loosened: -1 })).toThrow();
	expect(() => validateHallCare({ loosened: 1.5 })).toThrow();
	expect(() => validateHallCare({ loosened: 0, extra: 1 })).toThrow();
	expect(() => validateHallCare({ loosened: 2 })).not.toThrow();
});

it("a section works loose only at 06:00 on damp timber, on the keyed draw, while the hall is shut", () => {
	const s = morning(save(), true);
	s.hall = 5;
	s.timber = { damp: 1, care: { loosened: 0 } };
	const off = structuredClone(s);
	off.now += 15;
	expect(loosenHall(off)).toBe(false);
	const dry = structuredClone(s);
	if (dry.timber) dry.timber.damp = 0.5;
	expect(loosenHall(dry)).toBe(false);
	const open = structuredClone(s);
	open.hallSafe = true;
	expect(loosenHall(open)).toBe(false);
	const noCare = structuredClone(s);
	noCare.timber = { damp: 1 };
	expect(loosenHall(noCare)).toBe(false);
	expect(noCare.hall).toBe(5);
	expect(loosenHall(s)).toBe(true);
	expect(s.hall).toBe(4);
	expect(s.timber?.care?.loosened).toBe(1);
	const lucky = morning(save(), false);
	lucky.hall = 5;
	lucky.timber = { damp: 1, care: { loosened: 0 } };
	expect(loosenHall(lucky)).toBe(false);
});

it("a resident who sees the loosened hall may adopt one goal, which the twelfth repair settles", () => {
	const s = save();
	s.now = 1440 + 600;
	s.hall = 10;
	const ada = atHall(s, "ada");
	expect(noticeLooseHall(s, ada)).toBe(false); // nothing has loosened yet
	if (s.timber?.care) s.timber.care.loosened = 1;
	expect(noticeLooseHall(s, ada)).toBe(true);
	expect(noticeLooseHall(s, ada)).toBe(false); // one active goal at most
	const [goal] = hallGoals(ada);
	expect(goal?.serves).toEqual(["meaning", "belonging"]);
	expect(goal?.deadline).toBe(s.now + 2 * 1440);
	const away = s.people.find((p) => p.person.id === "musa");
	if (!away) throw Error("musa");
	away.place = "homes";
	delete away.job;
	expect(noticeLooseHall(s, away)).toBe(false);
	s.hall = 12;
	settleHallGoals(s);
	expect(hallGoals(ada)).toHaveLength(0);
	const legacy = structuredClone(s);
	legacy.hall = 10;
	if (legacy.timber) delete legacy.timber.care;
	expect(noticeLooseHall(legacy, atHall(legacy, "lea"))).toBe(false);
});

it("evening attend offers name who is already going only in towns with the together marker, and restore keeps them", () => {
	const r = new Runtime(save());
	let goer: string | undefined;
	let attend: Affordance | undefined;
	for (let i = 0; i < 96 * 12 && !attend; i++) {
		for (const id of r.prepareRound()) {
			const offer: Affordance | undefined = attend
				? undefined
				: buildOffers(r.s, id).find((o) => o.id.startsWith("attend:"));
			if (offer) {
				goer = id;
				attend = offer;
			}
			r.apply(
				id,
				offer ? offer.id : (r.actor(id).job?.offer.id ?? r.choose(id)),
			);
		}
	}
	if (!attend || !goer) throw Error("no attend offer in twelve days");
	expect(Array.isArray(attend.alongside)).toBe(true);
	// The goer took the offer; restore accepts the names recorded on it.
	expect(() => restoreRuntime(r.export())).not.toThrow();
	const tampered = r.export() as Save;
	const job = tampered.people.find((p) => p.person.id === goer)?.job;
	if (!job) throw Error("goer has no job");
	job.offer.alongside = [goer];
	expect(() => restoreRuntime(tampered)).toThrow();
	// Someone else on the way to the same evening is named to the next person offered it.
	const s = r.export() as Save;
	const going = s.people.find((p) => p.person.id === goer);
	const other = s.people.find((p) => p.person.id !== goer);
	const evening = allEvenings(s).find((e) => `attend:${e.id}` === attend?.id);
	const reply = evening && goer ? evening.replies[goer] : undefined;
	if (!other || !going?.job || !evening || !reply) throw Error("arrangement");
	// Free them and give them the goer's accepted reply and starting place, so the same evening is open to them.
	delete other.job;
	evening.replies[other.person.id] = {
		...structuredClone(reply),
		attempted: false,
	};
	other.place = going.job.from ?? going.place;
	const named = buildOffers(s, other.person.id).find((o) => o.id === attend.id);
	expect(named?.alongside).toContain(goer);
	const legacy = structuredClone(s);
	delete legacy.together;
	for (const p of legacy.people)
		for (const o of buildOffers(legacy, p.person.id))
			expect(o.alongside).toBeUndefined();
});
