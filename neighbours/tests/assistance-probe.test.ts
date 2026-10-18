import { expect, it } from "vitest";
import { probeAssistance } from "../scripts/probe-assistance.ts";
import { createRuntime } from "../src/core/index.ts";
import type { Runtime } from "../src/core/runtime.ts";
import { teachHallInspection } from "../src/experiments/inspection.ts";

it("screens every taught known neighbour and keeps all matched outcomes without mutating its checkpoint", () => {
	const runtime = createRuntime(42, 8) as Runtime;
	runtime.s.hall = 12;
	runtime.s.hallSafe = true;
	teachHallInspection(
		runtime.actor("ada").person,
		"lea",
		"synthetic-probe-fixture",
	);
	const checkpoint = runtime.export();
	const before = structuredClone(checkpoint);
	const report = probeAssistance(checkpoint);
	expect(checkpoint).toEqual(before);
	expect(report.screening.map((r) => r.id)).toHaveLength(7);
	expect(report.candidates.map((r) => r.id)).toEqual(["ada"]);
	const arms = report.candidates[0]?.arms;
	expect(arms?.map((arm) => arm.arm)).toEqual([
		"received-learned",
		"received-method-ablated",
		"request-withheld",
	]);
	expect(
		arms?.every(
			(arm) => arm.continuation.exact && arm.continuation.rounds === 16,
		),
	).toBe(true);
	expect(
		arms?.find((arm) => arm.arm === "received-method-ablated")
			?.removedInspectionRules,
	).toBe(2);
	expect(JSON.stringify(report)).not.toContain('"people"');
	expect(JSON.stringify(report)).not.toContain('"person"');
	const candidate = report.candidates[0];
	const learned = arms?.find((arm) => arm.arm === "received-learned");
	const ablated = arms?.find((arm) => arm.arm === "received-method-ablated");
	if (
		candidate &&
		"observations" in candidate &&
		candidate.observations.openingDiffersUnderMethodAblation &&
		learned?.opened &&
		!ablated?.opened
	) {
		expect(learned.decisionSource).toBe("HF 2.3.0");
		expect(
			learned.methodTerms.some(
				(term) =>
					term.source.includes("hall-section-inspection") && term.value > 0,
			),
		).toBe(true);
	}
	expect(report.summary.eligible).toBe(1);
});
it("records asleep taught neighbours as unavailable rather than waking them", () => {
	const runtime = createRuntime(42, 8) as Runtime;
	runtime.s.hall = 12;
	runtime.s.hallSafe = true;
	teachHallInspection(
		runtime.actor("ada").person,
		"lea",
		"synthetic-sleep-fixture",
	);
	runtime.actor("ada").person.body.asleep = true;
	const checkpoint = runtime.export();
	const before = structuredClone(checkpoint);
	const report = probeAssistance(checkpoint);
	expect(report.candidates[0]?.eligible).toBe(false);
	expect(report.candidates[0]?.arms).toEqual([]);
	expect(checkpoint).toEqual(before);
});
