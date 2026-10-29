import { exportRun, type Input, step } from "@adam0white/human-framework";
import { describe, expect, it } from "vitest";
import { createTownRun, townTime } from "../src/core/hf4-run.ts";

describe("HF4 town authoring", () => {
	// Two complete independent Runs, full hashes and 206-person stepping: correctness, not startup/day performance.
	it("authors all 206 real actors in one deterministic Run and reaches fifteen minutes", () => {
		const run = createTownRun(42, 206);
		const before = exportRun(run);
		expect(Object.keys(before.current.people)).toHaveLength(206);
		expect(Object.keys(before.current.people).slice(0, 6)).toEqual([
			"ada",
			"elin",
			"sam",
			"jo",
			"ravi",
			"noor",
		]);
		expect(exportRun(createTownRun(42, 206)).hashes.full).toBe(
			before.hashes.full,
		);
		const result = step(run, { until: townTime(495), inputs: [] });
		expect(result.ok).toBe(true);
		if (!result.ok) throw Error(result.error.message);
		expect(result.value.at).toBe(townTime(495));
	}, 15000);
	it("refuses invalid host time and unsupported population", () => {
		expect(() => townTime(Number.NaN)).toThrow();
		expect(() => createTownRun(42, 5)).toThrow();
		expect(() => createTownRun(42, 301)).toThrow();
	});
});

it("lets all 206 actual residents choose real offered rest/drink alternatives at the first public boundary", () => {
	const run = createTownRun(42, 206);
	const at = townTime(480);
	const started = performance.now();
	const inputs: Input[] = Object.keys(exportRun(run).current.people).flatMap(
		(person, i): Input[] => [
			{
				id: `offers:${i}`,
				at,
				source: { type: "host", id: "neighbours" },
				kind: "offers.received",
				payload: {
					person,
					revision: 1,
					offers: [
						{
							id: "rest",
							actionId: "rest",
							label: "Rest at home",
							person,
							durationMs: 45 * 60000,
							place: "homes",
							participants: [],
							alongside: [],
							demands: { effort: 0, focus: 0, mode: "awake", requires: {} },
							tags: [],
							norms: [],
							expected: {
								needs: { leisure: 0.3 },
								followedBy: [],
								provenance: [],
							},
							fulfills: [],
							advances: [],
							diminishes: [],
						},
						{
							id: "drink",
							actionId: "drink",
							label: "Drink water here",
							person,
							durationMs: 15 * 60000,
							place: "homes",
							participants: [],
							alongside: [],
							demands: { effort: 0, focus: 0, mode: "awake", requires: {} },
							tags: [],
							norms: [],
							expected: {
								needs: { water: 0.7 },
								followedBy: [],
								provenance: [],
							},
							fulfills: [],
							advances: [],
							diminishes: [],
						},
					],
				},
			},
			{
				id: `decision:${i}`,
				at,
				source: { type: "host", id: "neighbours" },
				kind: "decision.requested",
				payload: {
					person,
					reason: "ordinary town opportunity",
					treatment: "ordinary",
					offerRevision: 1,
				},
			},
		],
	);
	const result = step(run, { until: townTime(495), inputs });
	expect(result.ok).toBe(true);
	if (!result.ok) throw Error(result.error.message);
	expect(result.value.boundary.type).toBe("world-required");
	if (result.value.boundary.type !== "world-required")
		throw Error("Missing boundary");
	expect(result.value.boundary.requests).toHaveLength(206);
	expect(
		new Set(
			result.value.boundary.requests.map((r) =>
				r.kind === "action" ? r.person : "communication",
			),
		).size,
	).toBe(206);
	console.log(
		JSON.stringify({
			kind: "actual-public-Run-206-first-boundary",
			elapsedMs: performance.now() - started,
			at: result.value.at,
			target: townTime(495),
			reachedUntil: result.value.reachedUntil,
			requests: result.value.boundary.requests.length,
			events: result.value.events.length,
			inputCount: inputs.length,
			exportBytes: Buffer.byteLength(JSON.stringify(exportRun(run))),
			rssBytes: process.memoryUsage().rss,
		}),
	);
});
