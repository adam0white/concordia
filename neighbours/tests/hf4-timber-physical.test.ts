/** Literal pure physical guards retained from the frozen HF3 suite. These
 * functions remain host physics; no old Person or historical runtime executes. */
import { expect, it } from "vitest";
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
import { createRuntime } from "./current-town.ts";

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

it("weathers a nonempty actual town across its exact native fifteen-minute interval", () => {
	const runtime = createRuntime(42, 6),
		start = runtime.s.now;
	expect(runtime.s.timber?.damp).toBe(FLOOD_DAMP);
	if (!runtime.s.timber) throw Error("Missing actual timber");
	runtime.s.timber.damp = 0.5;
	const rate =
		runtime.weather() === "Clear"
			? -CLEAR_DRYING_PER_DAY
			: RAIN_WETTING_PER_DAY;
	runtime.step();
	expect(runtime.s.now).toBe(495);
	expect(runtime.s.now).toBeGreaterThan(start);
	expect(runtime.s.timber.damp).toBeCloseTo(
		0.5 + (rate * (495 - start)) / 1440,
		6,
	);
	const specimen = { timber: { damp: 0.6 } };
	weatherTimber(specimen, "Clear", 1440);
	expect(specimen.timber.damp).toBeCloseTo(0.6 - CLEAR_DRYING_PER_DAY, 6);
	weatherTimber(specimen, "Rain", 1440);
	expect(specimen.timber.damp).toBeCloseTo(
		0.6 - CLEAR_DRYING_PER_DAY + RAIN_WETTING_PER_DAY,
		6,
	);
	weatherTimber(specimen, "Rain", 1440 * 40);
	expect(specimen.timber.damp).toBe(1);
	weatherTimber(specimen, "Clear", 1440 * 40);
	expect(specimen.timber.damp).toBe(0);
	expect(timberMoisture({ timber: { damp: DRY_BELOW } }, "Clear")).toBe("wet");
	expect(timberMoisture({ timber: { damp: DRY_BELOW - 0.01 } }, "Rain")).toBe(
		"dry",
	);
});
