import {
	demonstrateMethod,
	receiveMethodCues,
} from "@adam0white/human-framework";
import { expect, it } from "vitest";
import { createRuntime } from "../src/core/index.ts";
import { Runtime } from "../src/core/runtime.ts";
import type { Save } from "../src/core/state.ts";
import {
	demonstrateHallInspection,
	observeHallInspection,
	teachHallInspection,
} from "../src/experiments/inspection.ts";

function town() {
	return new Runtime(createRuntime(42, 8).export() as Save);
}

it("shows no retained inspection lesson before receiving one", () => {
	const r = town();
	expect(r.view().people.find((p) => p.id === "noor")?.lessons).toBeUndefined();
});

it("projects the two received cases without mutating a person or the town", () => {
	const r = town();
	teachHallInspection(r.actor("noor").person, "lea", "actual-class");
	const before = r.export();
	expect(r.view().people.find((p) => p.id === "noor")?.lessons).toEqual([
		{
			id: "hall-section-inspection:open-section",
			label: "Dry timber and sound supports: open this section",
			at: 480,
			sourceIds: ["lea"],
			successes: 2,
			failures: 0,
		},
		{
			id: "hall-section-inspection:keep-closed",
			label: "Wet timber and sound supports: keep this section closed",
			at: 480,
			sourceIds: ["lea"],
			successes: 2,
			failures: 0,
		},
	]);
	expect(r.export()).toEqual(before);
});

it("keeps failed and mixed demonstrations as counts with actual sources and last time", () => {
	const r = town();
	const p = r.actor("noor").person;
	function example(
		sourceId: string,
		outcome: "success" | "failure",
		id: string,
	) {
		const cues = { moisture: "dry", support: "sound" } as const;
		observeHallInspection(p, { ...cues, contextId: id, sectionId: "example" });
		expect(
			demonstrateHallInspection(p, {
				...cues,
				contextId: id,
				sourceId,
				demonstrationId: id,
				action: "open-section",
				outcome,
			}),
		).toBe(true);
	}
	example("lea", "failure", "failed-example");
	expect(
		r.view().people.find((person) => person.id === "noor")?.lessons?.[0],
	).toMatchObject({ successes: 0, failures: 1 });
	r.step();
	example("ada", "success", "successful-example");
	expect(
		r.view().people.find((person) => person.id === "noor")?.lessons,
	).toEqual([
		{
			id: "hall-section-inspection:open-section",
			label: "Dry timber and sound supports: open this section",
			at: 495,
			sourceIds: ["ada", "lea"],
			successes: 1,
			failures: 1,
		},
	]);
});

it("does not invent missing cues, unknown conditions or unrelated lessons", () => {
	const r = town();
	const p = r.actor("noor").person;
	const cases = [
		{
			id: "hall-section-inspection",
			cues: [{ cue: "hall-moisture", value: "dry" }],
		},
		{
			id: "hall-section-inspection",
			cues: [
				{ cue: "hall-moisture", value: "dry" },
				{ cue: "hall-support", value: "unknown" },
			],
		},
		{
			id: "other-inspection",
			cues: [
				{ cue: "hall-moisture", value: "wet" },
				{ cue: "hall-support", value: "sound" },
			],
		},
	];
	for (const [index, input] of cases.entries()) {
		const contextId = `unrelated-${index}`;
		expect(receiveMethodCues(p, { contextId, cues: input.cues })).toBe(true);
		expect(
			demonstrateMethod(p, {
				id: input.id,
				contextId,
				conditions: input.cues,
				demonstrationId: contextId,
				sourceId: "lea",
				action: "open-section",
				outcome: "success",
			}),
		).toBe(true);
	}
	expect(
		r.view().people.find((person) => person.id === "noor")?.lessons,
	).toBeUndefined();
});
