import { expect, it } from "vitest";
import { minutePercept, TownRunOwner } from "../src/core/hf4-owner.ts";
import { createTownRun, townTime } from "../src/core/hf4-run.ts";

it("uses the actual Run attendance result before claiming a received observation", () => {
	const owner = new TownRunOwner(createTownRun(42, 6));
	const percept = minutePercept("notice:1", 480, {
		channel: "saw",
		kind: "hall-question",
		salience: 1,
		summary: "A visible note asks for help beside the hall.",
	});
	expect(owner.observe("ada", percept)).toBe(false);
	const result = owner.advance(townTime(480) + 1);
	const attended = result.events.some(
		(e) =>
			e.person === "ada" &&
			e.data.kind === "observation-attended" &&
			e.data.perceptId === "notice:1",
	);
	expect(attended).toBe(true);
	expect(owner.observe("ada", percept)).toBe(attended);
	expect(owner.actor("ada").id).toBe("ada");
	const archive = owner.export();
	expect(
		TownRunOwner.restore(JSON.parse(JSON.stringify(archive))).export(),
	).toEqual(archive);
});
