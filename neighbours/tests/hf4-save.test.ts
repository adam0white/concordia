import {
	exportRun,
	replay,
	restoreRun,
	step,
} from "@adam0white/human-framework";
import { expect, it } from "vitest";
import { createTownRun, need, townTime } from "../src/core/hf4-run.ts";

it("cold restores the entire six-actor focused native Run and continues exactly", () => {
	const run = createTownRun(42, 6);
	need(step(run, { until: townTime(495), inputs: [] }));
	const archive = JSON.parse(JSON.stringify(exportRun(run)));
	const restored = need(restoreRun(archive));
	expect(Object.keys(exportRun(restored).current.people)).toHaveLength(6);
	expect(exportRun(restored)).toEqual(exportRun(run));
	need(step(run, { until: townTime(510), inputs: [] }));
	need(step(restored, { until: townTime(510), inputs: [] }));
	expect(exportRun(restored)).toEqual(exportRun(run));
	expect(replay(JSON.parse(JSON.stringify(exportRun(restored)))).ok).toBe(true);
});
