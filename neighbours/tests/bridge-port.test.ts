/** The transport answers a refusal that changed nothing as `rejected`, so the engine can stay usable. */
import { expect, it } from "vitest";
import { RuntimePort } from "../src/bridge-port.ts";
import { workRefusal } from "../src/core/player.ts";
import type { Save } from "../src/core/state.ts";

it("a refused own-work hour is answered as rejected and leaves the town byte-identical", () => {
	const port = new RuntimePort(42, 8);
	while ((port.runtime.export() as Save).now % 1440 < 1080) port.runtime.step();
	const save = port.runtime.export() as Save;
	expect(workRefusal(save, "carry-meals")).toMatch(/Work hours/);
	const reply = JSON.parse(
		port.call(
			JSON.stringify({
				op: "intervene",
				intervention: { kind: "player-work", work: "carry-meals" },
			}),
		),
	);
	expect(reply).toEqual({
		rejected: "Work hours are 08:00–18:00, including the walk there",
	});
	expect(port.runtime.export()).toEqual(save);
	expect(
		JSON.parse(port.call(JSON.stringify({ op: "prepare" }))),
	).toBeInstanceOf(Array);
});
