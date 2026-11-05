import {
	exportRun,
	type Input,
	type Offer,
	step,
} from "@adam0white/human-framework";
import { expect, it } from "vitest";
import {
	type PhysicalBoundary,
	resolveActionBatch,
} from "../src/core/hf4-actions.ts";
import { createTownRun, need, townTime } from "../src/core/hf4-run.ts";

it("resolves the actual chosen alternative and conserves the last physical slot across receipt ID999→1000", () => {
	const run = createTownRun(42, 6);
	const at = townTime(480);
	const offers: Offer[] = ["ada", "elin"].map((person) => ({
		id: "work",
		actionId: "work",
		person,
		label: "Work the actual shift",
		durationMs: 60000,
		place: "workshop",
		participants: [],
		alongside: [],
		demands: { effort: 0.15, focus: 0, mode: "awake", requires: {} },
		tags: [],
		norms: [],
		expected: { needs: { competence: 0.3 }, followedBy: [], provenance: [] },
		fulfills: [],
		advances: [],
		diminishes: [],
	}));
	const inputs: Input[] = offers.flatMap((o, i): Input[] => [
		{
			id: `o${i}`,
			at,
			kind: "offers.received",
			source: { type: "host", id: "neighbours" },
			payload: { person: o.person, revision: 1, offers: [o] },
		},
		{
			id: `d${i}`,
			at,
			kind: "decision.requested",
			source: { type: "host", id: "neighbours" },
			payload: {
				person: o.person,
				reason: "actual opportunity",
				treatment: "ordinary",
				offerRevision: 1,
			},
		},
	]);
	const result = need(step(run, { until: at + 60000, inputs }));
	if (result.boundary.type !== "world-required")
		throw Error("No action boundary");
	const state: PhysicalBoundary = {
		revision: 0,
		at,
		places: { workshop: { capacity: 1, reserved: 0, stock: 0 } },
		residents: {
			ada: { place: "workshop", wealth: 3 },
			elin: { place: "workshop", wealth: 3 },
		},
		tools: 3,
		marketStock: 80,
		consumed: 0,
		produced: 0,
		nextInput: 999,
		applied: [],
		jobs: {},
	};
	const resolved = resolveActionBatch(state, result.boundary.requests, offers);
	expect(
		resolved.inputs.map(
			(x) => x.kind === "action.resolved" && x.payload.disposition,
		),
	).toEqual(["accepted", "rejected"]);
	expect(resolved.state.places.workshop?.reserved).toBe(1);
	expect(Object.keys(resolved.state.jobs)).toHaveLength(1);
	const continued = need(
		step(run, { until: at + 60000, inputs: resolved.inputs }),
	);
	expect(continued.boundary.type).toBe("world-required");
	const a = exportRun(run);
	expect(a.current.world.revision).toBe(1);
	expect(state.places.workshop?.reserved).toBe(0);
});
