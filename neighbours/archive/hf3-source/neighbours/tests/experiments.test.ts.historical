import { createPerson, decide, snapshot } from "@adam0white/human-framework";
import { describe, expect, it } from "vitest";
import {
	demonstrateHallInspection,
	hallInspectionOffers,
	observeHallInspection,
	teachHallInspection,
} from "../src/experiments/inspection.ts";
import {
	runInspectionExperiment,
	scoreInspection,
} from "../src/experiments/runner.ts";

describe("received conditional inspection learning", () => {
	it("changes held-out decisions through acquired methods, not scalar skill", () => {
		const report = runInspectionExperiment(19);
		const intact = report.arms.find((a) => a.policy === "hf-intact");
		const withheld = report.arms.find((a) => a.policy === "hf-withheld");
		const removed = report.arms.find((a) => a.policy === "hf-removed");
		if (!intact || !withheld || !removed)
			throw new Error("Missing experiment arm");
		expect(intact.cases.map((c) => c.action)).toEqual([
			"open-section",
			"keep-closed",
			"ask-inspector",
			"ask-inspector",
		]);
		expect(intact.completed).toBe(2);
		expect(intact.unsafe).toBe(0);
		expect(
			withheld.cases.slice(0, 2).every((c) => c.action === "ask-inspector"),
		).toBe(true);
		expect(removed.cases.map((c) => c.action)).toEqual(
			withheld.cases.map((c) => c.action),
		);
		expect(intact.acquiredRules).toBe(2);
		expect(withheld.acquiredRules).toBe(0);
		expect(removed.acquiredRules).toBe(0);
	});
	it("scores physical safety independently from HF and labels the authored fallback", () => {
		expect(
			scoreInspection({ moisture: "wet", support: "sound" }, "open-section"),
		).toEqual({ safe: false, completed: false, outcome: "unsafe-opening" });
		expect(
			scoreInspection({ moisture: "dry", support: "loose" }, "ask-inspector"),
		).toEqual({ safe: true, completed: false, outcome: "awaiting-inspection" });
		expect(runInspectionExperiment().limits.join(" ")).toContain("authored");
		expect(runInspectionExperiment().arms.map((a) => a.policy)).toEqual([
			"hf-intact",
			"hf-withheld",
			"hf-removed",
			"conditional-table",
			"random",
		]);
	});
	it("uses identical received cues, legal actions and world truth in all arms", () => {
		const report = runInspectionExperiment(81);
		for (const arm of report.arms) {
			expect(arm.cases.map((c) => c.observation)).toEqual(
				report.arms[0]?.cases.map((c) => c.observation),
			);
			expect(
				arm.cases.every((c) =>
					["open-section", "keep-closed", "ask-inspector"].includes(c.action),
				),
			).toBe(true);
		}
		expect(runInspectionExperiment(81)).toEqual(report);
	});
	it("lesson duplicate IDs do not fabricate additional method evidence", () => {
		const p = createPerson({
			id: "p",
			name: "P",
			sex: "female",
			seed: 1,
			now: 720,
			bornAt: -30 * 365 * 1440,
		});
		teachHallInspection(p, "lea", "actual-lesson-1");
		expect(snapshot(p).methods?.rules).toHaveLength(2);
		const before = JSON.stringify(snapshot(p).methods?.rules);
		teachHallInspection(p, "lea", "actual-lesson-1");
		expect(JSON.stringify(snapshot(p).methods?.rules)).toBe(before);
	});
	it("unsupported received cues request help", () => {
		const p = createPerson({
			id: "p",
			name: "P",
			sex: "female",
			seed: 1,
			now: 720,
			bornAt: -30 * 365 * 1440,
		});
		observeHallInspection(p, {
			contextId: "new-section",
			sectionId: "east",
			moisture: "unknown",
			support: "sound",
		});
		expect(
			decide(p, hallInspectionOffers("new-section", "east")).chosenAction,
		).toBe("ask-inspector");
	});
	it("cannot acquire a method from an unreceived demonstration", () => {
		const p = createPerson({
			id: "p",
			name: "P",
			sex: "female",
			seed: 1,
			now: 720,
			bornAt: -30 * 365 * 1440,
		});
		expect(
			demonstrateHallInspection(p, {
				contextId: "not-received",
				sourceId: "lea",
				demonstrationId: "missing-lesson",
				moisture: "dry",
				support: "sound",
				action: "open-section",
				outcome: "success",
			}),
		).toBe(false);
		expect(p.methods?.rules ?? []).toHaveLength(0);
	});
});
