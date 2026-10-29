import { expect, it } from "vitest";
import type { TownComparison } from "../src/contracts";
import { comparisonOutcomes } from "../src/ui/comparison-outcomes";

it("shows changed interval outcomes before shared history without mutating the report", () => {
	const old = { title: "Old hall repair", summary: "Doors repaired", at: 100 };
	const shared = { title: "Same class", summary: "Ada learned", at: 550 };
	const report = {
		startAt: 480,
		endAt: 960,
		baseline: {
			stories: [
				old,
				shared,
				{ title: "Supper", summary: "No supper", at: 900 },
			],
		},
		treatment: {
			stories: [
				old,
				shared,
				{ title: "Supper", summary: "Four neighbours ate", at: 900 },
			],
		},
	} as unknown as TownComparison;
	const original = JSON.stringify(report);
	const result = comparisonOutcomes(report);
	expect(result.baseline.map((s) => s.summary)).toEqual(["No supper"]);
	expect(result.treatment.map((s) => s.summary)).toEqual([
		"Four neighbours ate",
	]);
	expect(result.shared.map((s) => s.summary)).toEqual(["Ada learned"]);
	expect(result.undated.baseline).toEqual([]);
	expect(JSON.stringify(report)).toBe(original);
});
it("keeps differing undated legacy evidence separate without claiming interval membership", () => {
	const report = {
		startAt: 480,
		endAt: 960,
		baseline: {
			stories: [
				{ title: "Shared past", summary: "Same" },
				{ title: "Unknown date", summary: "Observed" },
			],
		},
		treatment: { stories: [{ title: "Shared past", summary: "Same" }] },
	} as unknown as TownComparison;
	const result = comparisonOutcomes(report);
	expect(result.baseline).toEqual([]);
	expect(result.undated.baseline.map((s) => s.summary)).toEqual(["Observed"]);
	expect(result.undated.shared.map((s) => s.summary)).toEqual(["Same"]);
});
it("preserves distinct dates with identical wording and excludes post-interval evidence", () => {
	const report = {
		startAt: 480,
		endAt: 960,
		baseline: { stories: [] },
		treatment: {
			stories: [
				{ title: "Class", summary: "Ada learned", at: 550 },
				{ title: "Class", summary: "Ada learned", at: 700 },
				{ title: "Class", summary: "Ada learned", at: 1200 },
			],
		},
	} as unknown as TownComparison;
	expect(comparisonOutcomes(report).treatment.map((s) => s.at)).toEqual([
		700, 550,
	]);
});

it("matches shared evidence by time and content even when branch IDs differ, preserving extra occurrences", () => {
	const one = {
		id: "base",
		title: "Class",
		summary: "Recorded lesson",
		at: 600,
	};
	const report = {
		startAt: 480,
		endAt: 960,
		baseline: { stories: [one] },
		treatment: {
			stories: [
				{ ...one, id: "other" },
				{ ...one, id: "extra" },
			],
		},
	} as unknown as TownComparison;
	const result = comparisonOutcomes(report);
	expect(result.shared).toHaveLength(1);
	expect(result.treatment).toHaveLength(1);
	expect(result.treatment[0]?.id).toBe("extra");
});
