import { readFileSync } from "node:fs";
import { ENGINE_VERSION, FRAMEWORK_VERSION } from "@adam0white/human-framework";
import { expect, it } from "vitest";
import { Runtime } from "../src/core/runtime.ts";
import type { Resident, Save } from "../src/core/state.ts";
import { createRuntime, restoreRuntime } from "./historical-runtime.ts";

// Captured from the numbered-name scenario before introducing synthetic names.
const legacy = JSON.parse(
	readFileSync(
		new URL("./fixtures/numbered-neighbour.json", import.meta.url),
		"utf8",
	),
) as { initialBackground: Resident; checkpoint: Save };

function background(seed: number) {
	return createRuntime(seed, 300).view().people.slice(8);
}

it("gives all 292 background residents unique readable full names with stable IDs", () => {
	const people = background(42);
	expect(new Set(people.map((p) => p.name)).size).toBe(292);
	for (const [index, person] of people.entries()) {
		expect(person.name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
		expect(person.id).toBe(`resident-${index + 1}`);
	}
});

it("repeats names for the same seed and varies them across town seeds", () => {
	const names = (seed: number) => background(seed).map((p) => p.name);
	expect(names(42)).toEqual(names(42));
	expect(names(73)).not.toEqual(names(42));
	expect(createRuntime(42, 9).view().people[8]?.name).toBe(names(42)[0]);
});

it("preserves background behavioral defaults and the familiar eight", () => {
	const town = createRuntime(42, 9).export() as Save;
	const person = structuredClone(town.people[8]);
	if (!person) throw Error("Missing background resident");
	person.person.name = legacy.initialBackground.person.name;
	const expected = structuredClone(legacy.initialBackground);
	expected.person.engine = ENGINE_VERSION;
	// New towns enable HF 2.8.0 fullness for every person (scenario.ts); nothing else in the defaults moved.
	expected.person.body.fullness = true;
	// Only the host description changed in the plain-English source rewrite.
	expected.description =
		"This neighbour needs food, rest and time with other people.";
	expect(person).toEqual(expected);
	expect(town.people.slice(0, 8)).toEqual(
		(createRuntime(42, 8).export() as Save).people,
	);
});

it("preserves actual numbered names and history through restore and continued replay", () => {
	expect(legacy.checkpoint.people[8]?.person.name).toBe("Resident 1");
	expect(
		legacy.checkpoint.events.some((e) => e.text.includes("Resident 1")),
	).toBe(true);
	// Only the explicit dependency/engine migration stamps change. Keep the
	// actual historical fixture and every behavioral field unmodified.
	const expected = structuredClone(legacy.checkpoint);
	expected.hf = FRAMEWORK_VERSION;
	for (const resident of expected.people)
		resident.person.engine = ENGINE_VERSION;
	const original = new Runtime(structuredClone(expected));
	const restored = restoreRuntime(legacy.checkpoint);
	expect(restored.export()).toEqual(expected);
	for (let i = 0; i < 8; i++) {
		original.step();
		restored.step();
	}
	expect(restored.export()).toEqual(original.export());
	expect((restored.export() as Save).people[8]?.person.name).toBe("Resident 1");
});

it("accepts HF 2.3.0 saves and continues them exactly, normalizing only the stamps", () => {
	const current = new Runtime(createRuntime(42, 12).export() as Save);
	for (let i = 0; i < 24; i++) current.step();
	const legacy230 = structuredClone(current.export()) as Save;
	legacy230.hf = "2.3.0";
	for (const resident of legacy230.people) resident.person.engine = "2.3.0";
	const restored = restoreRuntime(legacy230);
	expect(restored.export()).toEqual(current.export());
	for (let i = 0; i < 8; i++) {
		current.step();
		restored.step();
	}
	expect(restored.export()).toEqual(current.export());
});
