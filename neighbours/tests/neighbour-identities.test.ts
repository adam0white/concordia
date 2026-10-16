import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { createRuntime, restoreRuntime } from "../src/core/index.ts";
import { Runtime } from "../src/core/runtime.ts";
import type { Resident, Save } from "../src/core/state.ts";

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
	expect(person).toEqual(legacy.initialBackground);
	expect(town.people.slice(0, 8)).toEqual(
		(createRuntime(42, 8).export() as Save).people,
	);
});

it("preserves actual numbered names and history through restore and continued replay", () => {
	expect(legacy.checkpoint.people[8]?.person.name).toBe("Resident 1");
	expect(
		legacy.checkpoint.events.some((e) => e.text.includes("Resident 1")),
	).toBe(true);
	const original = new Runtime(structuredClone(legacy.checkpoint));
	const restored = restoreRuntime(legacy.checkpoint);
	expect(restored.export()).toEqual(legacy.checkpoint);
	for (let i = 0; i < 8; i++) {
		original.step();
		restored.step();
	}
	expect(restored.export()).toEqual(original.export());
	expect((restored.export() as Save).people[8]?.person.name).toBe("Resident 1");
});
