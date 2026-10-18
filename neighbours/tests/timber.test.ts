/**
 * Phase C host physics: damp hall timber (timber.ts) and drinking where people are (offers.ts).
 * A save without `timber` keeps the legacy physics exactly; new towns start with flood-soaked timber.
 */
import { expect, it } from "vitest";
import { inspectionKey } from "../src/core/encounters.ts";
import { createRuntime, restoreRuntime, stateHash } from "../src/core/index.ts";
import { buildOffers } from "../src/core/offers.ts";
import { speechOffers } from "../src/core/player.ts";
import { Runtime } from "../src/core/runtime.ts";
import type { Save } from "../src/core/state.ts";
import {
	AIRING_PER_HOUR,
	airTimber,
	CLEAR_DRYING_PER_DAY,
	DRY_BELOW,
	FLOOD_DAMP,
	holdChance,
	MIN_HOLD,
	RAIN_WETTING_PER_DAY,
	repairHolds,
	timberMoisture,
	weatherTimber,
} from "../src/core/timber.ts";

const T = 120_000;
const town = (seed = 42, population = 8) =>
	new Runtime(createRuntime(seed, population).export() as Save);
const legacyTown = (seed = 42, population = 8) => {
	const s = createRuntime(seed, population).export() as Save;
	delete s.timber;
	return new Runtime(s);
};
/** One round in which `requested` residents take that offer and everyone else rests at home. */
function round(r: Runtime, requested: Record<string, string> = {}) {
	for (const id of r.prepareRound()) {
		const busy = r.actor(id).job?.offer.id;
		r.apply(id, busy ?? requested[id] ?? "rest");
	}
}

it("new towns start with flood-soaked timber; legacy saves restore without it", () => {
	expect(town().s.timber).toEqual({ damp: FLOOD_DAMP });
	const legacy = legacyTown();
	const restored = restoreRuntime(legacy.export()) as Runtime;
	expect("timber" in restored.export()).toBe(false);
});

it(
	"a legacy save continues with legacy physics: weather moisture, every repair holds, home drinking",
	() => {
		const r = legacyTown();
		for (let i = 0; i < 96; i++) r.step();
		const s = r.export() as Save;
		expect("timber" in s).toBe(false);
		expect(s.events.some((e) => e.kind === "repair-slipped")).toBe(false);
		expect(r.moisture()).toBe(r.weather() === "Clear" ? "dry" : "wet");
		expect(inspectionKey(r.s)).toBe(
			`${Math.floor(r.s.now / 1440)}:${r.s.hall}`,
		);
		for (let id = 1; id < 200; id++) expect(repairHolds(r.s, id)).toBe(true);
		expect(airTimber(r.s, 60)).toBe(0);
		weatherTimber(r.s, "Clear", 1440);
		expect("timber" in r.s).toBe(false);
		const fresh = legacyTown();
		fresh.actor("sam").place = "market";
		const drink = buildOffers(fresh.s, "sam").filter(
			(o) => o.action === "drink",
		);
		expect(drink).toHaveLength(1);
		expect(drink[0]).toMatchObject({
			id: "drink",
			label: "Drink water at home",
			placeId: "homes",
			effort: 0,
		});
		expect(drink[0]?.duration).toBeGreaterThan(15);
		// Legacy continuation is exact across a restore.
		const copy = restoreRuntime(r.export()) as Runtime;
		for (let i = 0; i < 8; i++) {
			r.step();
			copy.step();
		}
		expect(stateHash(copy.export())).toBe(stateHash(r.export()));
	},
	T,
);

it("damp dries on Clear days, rises a little on Rain days and stays within 0..1", () => {
	const s = { timber: { damp: 0.6 } };
	weatherTimber(s, "Clear", 1440);
	expect(s.timber.damp).toBeCloseTo(0.6 - CLEAR_DRYING_PER_DAY, 6);
	weatherTimber(s, "Rain", 1440);
	expect(s.timber.damp).toBeCloseTo(
		0.6 - CLEAR_DRYING_PER_DAY + RAIN_WETTING_PER_DAY,
		6,
	);
	weatherTimber(s, "Rain", 1440 * 40);
	expect(s.timber.damp).toBe(1);
	weatherTimber(s, "Clear", 1440 * 40);
	expect(s.timber.damp).toBe(0);
	// The town weathers its timber once per 15-minute round.
	const r = town();
	const before = r.s.timber?.damp ?? Number.NaN;
	if (r.s.timber) r.s.timber.damp = 0.5;
	r.prepareRound();
	const rate =
		r.weather() === "Clear" ? -CLEAR_DRYING_PER_DAY : RAIN_WETTING_PER_DAY;
	expect(r.s.timber?.damp).toBeCloseTo(0.5 + (rate * 15) / 1440, 6);
	expect(before).toBe(FLOOD_DAMP);
});

it("a repair holds by a draw keyed on the seed and the job event, tied to damp", () => {
	const wet = { seed: 42, timber: { damp: 1 } };
	const dry = { seed: 42, timber: { damp: 0 } };
	expect(holdChance(wet)).toBe(MIN_HOLD);
	expect(holdChance(dry)).toBe(1);
	const holds = Array.from({ length: 2000 }, (_, i) => repairHolds(wet, i + 1));
	expect(holds).toEqual(
		Array.from({ length: 2000 }, (_, i) => repairHolds(wet, i + 1)),
	);
	const share = holds.filter(Boolean).length / holds.length;
	expect(share).toBeGreaterThan(MIN_HOLD - 0.05);
	expect(share).toBeLessThan(MIN_HOLD + 0.05);
	for (let id = 1; id < 200; id++) expect(repairHolds(dry, id)).toBe(true);
	// Another seed draws differently for the same event ids.
	const other = Array.from({ length: 200 }, (_, i) =>
		repairHolds({ seed: 43, timber: { damp: 1 } }, i + 1),
	);
	expect(other).not.toEqual(holds.slice(0, 200));
});

it("a completed repair on wet timber holds or slips exactly as its keyed draw says", () => {
	let slipped = 0;
	let held = 0;
	for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
		const r = town(seed);
		round(r, { ada: "repair" });
		const job = r.actor("ada").job;
		expect(job?.offer.action).toBe("repair");
		if (!job) continue;
		while (r.actor("ada").job?.event === job.event) round(r);
		const expected = repairHolds(r.s, job.event);
		const slip = r.s.events.find((e) => e.kind === "repair-slipped");
		if (expected) {
			held++;
			expect(r.s.hall).toBe(1);
			expect(slip).toBeUndefined();
		} else {
			slipped++;
			expect(r.s.hall).toBe(0);
			expect(slip).toMatchObject({
				actorId: "ada",
				placeId: "hall",
				causes: [job.event],
				text: "Ada’s repair on the damp timber did not hold.",
			});
		}
		expect(restoreRuntime(r.export()).export()).toEqual(r.export());
	}
	expect(slipped).toBeGreaterThan(0);
	expect(held).toBeGreaterThan(0);
});

it("inspection reads the timber's damp, not today's weather", () => {
	const inspect = (seed: number, damp: number) => {
		const r = town(seed);
		if (r.s.timber) r.s.timber.damp = damp;
		r.s.hall = 12;
		r.actor("ada").place = "hall";
		round(r, { ada: "open-section" });
		expect(r.actor("ada").job?.inspectionCues?.moisture).toBe(
			damp < DRY_BELOW ? "dry" : "wet",
		);
		round(r);
		return r;
	};
	// Seed 73 starts Clear and seed 42 starts with Rain.
	const clearWet = inspect(73, 0.9);
	expect(clearWet.weather()).toBe("Clear");
	expect(clearWet.s.hallSafe).toBe(false);
	expect(clearWet.actor("ada").inspection?.observations?.moisture).toBe("wet");
	expect(clearWet.actor("ada").inspection?.event?.text).toContain(
		"found wet timber",
	);
	const rainDry = inspect(42, 0.1);
	expect(rainDry.weather()).toBe("Rain");
	expect(rainDry.s.hallSafe).toBe(true);
	expect(rainDry.actor("ada").inspection?.event?.kind).toBe("hall-open");
	expect(timberMoisture({ timber: { damp: DRY_BELOW } }, "Clear")).toBe("wet");
	expect(timberMoisture({ timber: { damp: DRY_BELOW - 0.01 } }, "Rain")).toBe(
		"dry",
	);
	// A changed reading the same day is worth another look.
	const r = town();
	const wetKey = inspectionKey(r.s);
	if (r.s.timber) r.s.timber.damp = 0;
	expect(inspectionKey(r.s)).not.toBe(wetKey);
});

it("airing the timber removes damp per hour of work and never goes below dry", () => {
	const s = { timber: { damp: 0.8 } };
	expect(airTimber(s, 60)).toBeCloseTo(AIRING_PER_HOUR, 6);
	expect(s.timber.damp).toBeCloseTo(0.8 - AIRING_PER_HOUR, 6);
	expect(airTimber(s, 0)).toBe(0);
	expect(airTimber(s, -30)).toBe(0);
	s.timber.damp = 0.04;
	expect(airTimber(s, 60)).toBeCloseTo(0.04, 6);
	expect(s.timber.damp).toBe(0);
	expect(airTimber(s, 60)).toBe(0);
	expect(airTimber({}, 60)).toBe(0);
});

it("restore rejects malformed timber and accepts valid or absent timber", () => {
	const base = town().export() as Save;
	for (const bad of [
		{ damp: -0.1 },
		{ damp: 1.1 },
		{ damp: Number.NaN },
		{ damp: "0.5" },
		{ damp: 0.5, extra: 1 },
		{},
		null,
		[],
		0.5,
	]) {
		const s = structuredClone(base) as unknown as Record<string, unknown>;
		s.timber = bad;
		expect(() => restoreRuntime(s), JSON.stringify(bad)).toThrow();
	}
	const ok = structuredClone(base);
	ok.timber = { damp: 0.3 };
	expect(restoreRuntime(ok).export()).toEqual(ok);
});

it(
	"residents away from home drink where they are instead of walking home",
	() => {
		const walksHome = (r: Runtime) => {
			let walks = 0;
			let inPlace = 0;
			for (let i = 0; i < 96; i++) {
				r.step();
				for (const p of r.s.people) {
					const j = p.job;
					if (j?.offer.action !== "drink") continue;
					if (j.end - j.offer.duration !== r.s.now) continue;
					if (j.offer.placeId === "homes" && j.from !== "homes") walks++;
					if (j.offer.placeId !== "homes") inPlace++;
				}
			}
			return { walks, inPlace };
		};
		const legacy = walksHome(legacyTown());
		const phaseC = walksHome(town());
		// Measured over one day (8 people): the legacy town walks home to drink; Phase C never needs to.
		expect(legacy.walks).toBeGreaterThan(0);
		expect(legacy.inPlace).toBe(0);
		expect(phaseC.walks).toBe(0);
		expect(phaseC.inPlace).toBeGreaterThan(0);
		// The in-place drink needs no activity slot and costs no travel.
		const r = town();
		r.actor("sam").place = "market";
		const drink = buildOffers(r.s, "sam").filter((o) => o.action === "drink");
		expect(drink).toEqual([
			expect.objectContaining({
				id: "drink",
				label: "Drink water here",
				placeId: "market",
				duration: 15,
				effort: 0,
				tags: ["floor"],
			}),
		]);
	},
	T,
);

it(
	"a resident mid-drink at a workplace restores and continues exactly",
	() => {
		const r = town();
		let found = false;
		for (let i = 0; i < 192 && !found; i++) {
			r.step();
			found = r.s.people.some(
				(p) =>
					p.job?.offer.action === "drink" && p.job.offer.placeId !== "homes",
			);
		}
		expect(found).toBe(true);
		const copy = restoreRuntime(r.export()) as Runtime;
		for (let i = 0; i < 4; i++) {
			r.step();
			copy.step();
		}
		expect(stateHash(copy.export())).toBe(stateHash(r.export()));
	},
	T,
);

it(
	"the inspection instructor can be fetched through ordinary speech: inspect elsewhere, open at the hall",
	() => {
		// Leg 1: the player (at home) finds Lea free at home and asks her to go and inspect.
		const r = town();
		r.actor("lea").place = "homes";
		const lea = r.actor("lea");
		const away = speechOffers(r.s, lea).map((o) => o.id);
		expect(away).toContain("inspect");
		expect(away).not.toContain("open-section");
		expect(() =>
			r.intervene({
				kind: "player-speak",
				actorId: "lea",
				affordanceId: "inspect",
				mode: "ask",
			}),
		).not.toThrow();
		// Leg 2: once Lea is free at the hall and the player is there, opening is hers to choose.
		const h = town();
		h.intervene({ kind: "player-move", placeId: "hall" });
		while (h.view().player?.job) h.step();
		h.interruptJob("lea");
		h.actor("lea").place = "hall";
		const at = speechOffers(h.s, h.actor("lea")).map((o) => o.id);
		expect(at).toContain("open-section");
		expect(at).toContain("keep-closed");
		expect(at).not.toContain("inspect");
		expect(() =>
			h.intervene({
				kind: "player-speak",
				actorId: "lea",
				affordanceId: "open-section",
				mode: "ask",
			}),
		).not.toThrow();
	},
	T,
);

it(
	"without the visitor, a 208-person town reopens later on damp timber but can still reopen",
	() => {
		// Seed 42 is the UI default. Legacy physics opened its hall on day 2 at 19:45 (round 143).
		const legacy = legacyTown(42, 208);
		const phaseC = town(42, 208);
		let slips = 0;
		let seen = 0;
		for (let i = 0; i < 150; i++) {
			legacy.step();
			phaseC.step();
			// The event feed is bounded, so count slips as they happen.
			for (const e of phaseC.s.events)
				if (e.id > seen) {
					seen = e.id;
					if (e.kind === "repair-slipped") slips++;
				}
		}
		expect(legacy.s.hallSafe).toBe(true);
		expect(phaseC.s.hallSafe).toBe(false);
		expect(phaseC.moisture()).toBe("wet");
		expect(slips).toBeGreaterThan(0);
		// Seed 9 has a dry week: its hall reopens on day 4 without the visitor.
		const dry = town(9, 208);
		for (let i = 0; i < 320 && !dry.s.hallSafe; i++) dry.step();
		expect(dry.s.hallSafe).toBe(true);
		expect(dry.s.now).toBeGreaterThan(480 + 2 * 1440);
	},
	T,
);
