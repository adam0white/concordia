/** The public HF inspection owns membership across the complete event journal. */
import { exportRun, inspect, step } from "@adam0white/human-framework";
import { expect, it } from "vitest";
import { minutePercept, TownRunOwner } from "../src/core/hf4-owner.ts";
import {
	createTownRun,
	HOST_SOURCE,
	need,
	townTime,
} from "../src/core/hf4-run.ts";

it("cold restores attendance older than the 64-event archive window through complete public inspection", () => {
	const run = createTownRun(42, 6);
	const owner = new TownRunOwner(run);
	for (let index = 0; index < 80; index++) {
		const until = townTime(480) + index + 1;
		// Exercise the same public inputs and native steps without exporting the
		// growing archive after every setup frame. The cold owner is the subject.
		need(
			step(run, {
				until,
				inputs: [
					{
						id: owner.allocate("input"),
						at: until,
						source: HOST_SOURCE,
						kind: "observation.received",
						payload: {
							person: "ada",
							evidenceId: `observation:ada:window:${index}`,
							percepts: [
								minutePercept(`window:${index}`, 480, {
									channel: "saw",
									kind: "hall-question",
									salience: 1,
									summary: "A visible note asks for help beside the hall.",
								}),
							],
						},
					},
				],
			}),
		);
	}
	const archive = exportRun(run);
	expect(archive.current.events).toHaveLength(64);
	const projected = need(
		inspect(run, {
			perspective: { kind: "host" },
			people: ["ada"],
			select: ["events"],
		}),
	);
	const person = projected.people[0];
	if (person?.kind !== "host") throw Error("Missing privileged reading");
	const events = person.parts.find((part) => part.select === "events");
	if (events?.select !== "events") throw Error("Missing events");
	expect(
		events.value.filter((event) => event.data.kind === "observation-attended"),
	).toHaveLength(80);
	const cold = TownRunOwner.restore(owner.export());
	expect(cold.export()).toEqual(owner.export());
	for (let index = 0; index < 80; index++) {
		expect(cold.attention("ada", `window:${index}`)).toBe(1);
		expect(cold.attentionTime("ada", `window:${index}`)).toBe(
			townTime(480) + index + 1,
		);
	}
});
