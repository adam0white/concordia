import { expect, it } from "vitest";
import { TownRunOwner } from "../src/core/hf4-owner.ts";
import { createTownRun, townTime } from "../src/core/hf4-run.ts";

it("retains only an actually attended hall lesson through the public method inputs", () => {
	const owner = new TownRunOwner(createTownRun(42, 6));
	owner.lesson("elin", "ada", "actual-test-lesson");
	expect(owner.actor("elin").methods.rules).toHaveLength(0);
	owner.advance(townTime(480) + 1);
	owner.advance(townTime(480) + 2);
	expect(
		owner
			.actor("elin")
			.methods.rules.some(
				(r) =>
					r.id === "hall-section-inspection" &&
					r.evidence.some((e) => e.sourceId === "ada"),
			),
	).toBe(true);
	expect(owner.actor("ravi").methods.rules).toHaveLength(0);
});

it("does not retain or indefinitely queue an unreceived explanation for an authored sleeping learner", async () => {
	const { createRun, createPerson } = await import(
		"@adam0white/human-framework"
	);
	const { authorResidents, townSpec, need } = await import(
		"../src/core/hf4-run.ts"
	);
	const run = need(createRun(townSpec(42)));
	const opening = structuredClone(authorResidents(42, 6));
	for (const person of opening) {
		if (person.id === "elin") person.state.body.asleep = true;
		need(createPerson(run, person));
	}
	const owner = new TownRunOwner(run);
	owner.lesson("elin", "ada", "unreceived-sleeping-test");
	owner.advance(townTime(480) + 1);
	owner.advance(townTime(480) + 2);
	expect(owner.actor("elin").methods.rules).toHaveLength(0);
	expect(owner.export().lessons).toHaveLength(0);
	expect(owner.export().queued).toHaveLength(0);
	const { minutePercept } = await import("../src/core/hf4-owner.ts");
	expect(
		owner.observe(
			"elin",
			minutePercept("lesson:unreceived-sleeping-test:elin", 480, {
				channel: "heard",
				kind: "inspection-lesson",
				salience: 0.85,
				summary: "A sleeping learner did not attend this explanation.",
			}),
		),
	).toBe(false);
});
