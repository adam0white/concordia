/**
 * Flood-soaked hall timber: how damp it is, how it dries, and what that does to repairs and inspection.
 *
 * Scope: host physics only. This module owns the optional `Save.timber` slice (`{ damp }`, 0 = dry, 1 = as the
 * flood left it). New towns start at `FLOOD_DAMP`. Each 15-minute round the timber dries a little on a Clear day
 * and takes up a little water on a Rain day (rates per day, applied in proportion to the round's minutes). A
 * completed hall repair holds with probability `MIN_HOLD + (1 - MIN_HOLD) * (1 - damp)`, drawn from the seed and the repair
 * job's event id, never a person id; a repair that does not hold adds nothing to the hall. Inspection cues read
 * "dry" once damp falls below `DRY_BELOW` instead of today's weather. `airTimber` is the hook for propping and
 * airing the timber by hand (the visitor's work); it removes a fixed amount per hour of work.
 *
 * Phase C host physics are marked by the field's presence. When `Save.timber` is absent (saves and checkpoints
 * made before it existed), every function here reproduces the legacy behaviour exactly: inspection moisture is
 * today's weather, every repair holds, nothing dries and airing does nothing. The same marker gates the
 * drink-where-you-are offer in offers.ts, so a legacy town's choice sets stay as they were.
 *
 * Not covered: HF decisions (who repairs, inspects or opens is still HF's choice over legal offers), the
 * supports' soundness (still "sound" exactly when the twelve repairs are done), rot, separate timber sections,
 * or any guaranteed reopening day. The rates are engineering assumptions chosen so that, without the visitor,
 * the hall can reopen but usually later than the second day; they are not measured from real timber.
 */
import { validateHallCare } from "./hall-care.ts";
import { keyed } from "./hash.ts";
import type { Save } from "./state.ts";

/** `care` (Phase D, hall-care.ts): present in new towns; counts sections the wet timber has worked loose. */
export type Timber = { damp: number; care?: { loosened: number } };
/** Damp of the hall timber when a new town begins, the morning after the flood. */
export const FLOOD_DAMP = 1;
/** Inspection reads the timber as dry below this damp. */
export const DRY_BELOW = 0.45;
/** Damp lost over one Clear day. */
export const CLEAR_DRYING_PER_DAY = 0.25;
/** Damp gained over one Rain day. */
export const RAIN_WETTING_PER_DAY = 0.05;
/** Damp removed by one hour of propping and airing the timber by hand. */
export const AIRING_PER_HOUR = 0.1;
/** Chance that a repair holds on timber as wet as the flood left it (damp 1). */
export const MIN_HOLD = 0.7;

const tidy = (x: number) => Math.min(1, Math.max(0, Math.round(x * 1e6) / 1e6));

/** The town's new-game timber after the flood, with hall care (hall-care.ts). */
export function floodTimber(): Timber {
	return { damp: FLOOD_DAMP, care: { loosened: 0 } };
}

/** The moisture cue a person sees at the hall: damp-based when timber physics exist, else the legacy weather. */
export function timberMoisture(
	s: Pick<Save, "timber">,
	weather: string,
): "dry" | "wet" {
	if (!s.timber) return weather === "Clear" ? "dry" : "wet";
	return s.timber.damp < DRY_BELOW ? "dry" : "wet";
}

/** Weathers the timber over `minutes` of the given weather. No-op without timber physics. */
export function weatherTimber(
	s: Pick<Save, "timber">,
	weather: string,
	minutes: number,
): void {
	if (!s.timber) return;
	const perDay =
		weather === "Clear" ? -CLEAR_DRYING_PER_DAY : RAIN_WETTING_PER_DAY;
	s.timber.damp = tidy(s.timber.damp + (perDay * minutes) / 1440);
}

/** Chance that a repair finished now holds: `MIN_HOLD` at damp 1 rising linearly with (1 - damp) to 1 on dry timber. */
export function holdChance(s: Pick<Save, "timber">): number {
	if (!s.timber) return 1;
	return MIN_HOLD + (1 - MIN_HOLD) * (1 - s.timber.damp);
}

/** Whether the repair job started as event `eventId` holds; keyed by seed and job event, never by person. */
export function repairHolds(
	s: Pick<Save, "timber" | "seed">,
	eventId: number,
): boolean {
	const chance = holdChance(s);
	return chance >= 1 || keyed(s.seed, eventId, "repair-hold") < chance;
}

/**
 * Props and airs the hall timber for `minutes` of work; returns the damp actually removed.
 * Returns 0 and changes nothing when the town has no timber physics (a legacy save).
 */
export function airTimber(s: Pick<Save, "timber">, minutes: number): number {
	if (!s.timber || !(minutes > 0)) return 0;
	const before = s.timber.damp;
	s.timber.damp = tidy(before - (AIRING_PER_HOUR * minutes) / 60);
	return tidy(before - s.timber.damp);
}

export function validateTimber(s: Save): void {
	if (s.timber === undefined) return;
	const t = s.timber as unknown;
	if (
		!t ||
		typeof t !== "object" ||
		Array.isArray(t) ||
		!["damp", "care,damp"].includes(Object.keys(t).sort().join()) ||
		typeof (t as Timber).damp !== "number" ||
		!Number.isFinite((t as Timber).damp) ||
		(t as Timber).damp < 0 ||
		(t as Timber).damp > 1
	)
		throw Error("Invalid hall timber");
	if ((t as Timber).care !== undefined) validateHallCare((t as Timber).care);
}
