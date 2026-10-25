import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { Runtime } from "../src/core/runtime.ts";
import type { Save } from "../src/core/state.ts";
import InspectionSituation, {
	recordedProposal,
} from "../src/ui/InspectionSituation";
import { createRuntime } from "./historical-runtime.ts";

afterEach(() => vi.unstubAllGlobals());
const good = {
	schema: "native-concordia-gm@1",
	proposal: {
		schema: "neighbours-gm-proposal@1",
		kind: "inspection-request",
		target: "hall-annex",
		cue: "dry-sound",
		windowMinutes: 240,
	},
	modelIds: ["actual-model"],
	modelCalls: 1,
	sourceFingerprint: "a".repeat(64),
	rejection: null,
	replayExact: true,
	recordedAt: "2026-10-16T00:00:00Z",
};
it("accepts labelled genuine model evidence and rejects rejected, replay-only or missing provenance", () => {
	expect(recordedProposal(good).modelIds).toEqual(["actual-model"]);
	for (const invalid of [
		{ ...good, rejection: "invalid" },
		{ ...good, modelCalls: 0 },
		{ ...good, replayExact: false },
		{ ...good, modelIds: [] },
		null,
	])
		expect(() => recordedProposal(invalid)).toThrow();
});
it("keeps new situations absent before the hall opens, with no invented receipt", () => {
	const town = createRuntime(42, 8).view();
	const render = () =>
		renderToStaticMarkup(
			createElement(InspectionSituation, {
				town,
				disabled: false,
				onAction: () => {},
				onCompare: () => {},
			}),
		);
	expect(render()).toBe("");
	const hall = town.places.find((p) => p.id === "hall");
	if (!hall) throw Error("Missing test hall");
	hall.open = true;
	const html = render();
	expect(html).toContain("Choose a neighbour");
	expect(html).not.toContain("Concordia game-master proposal");
	expect(html).not.toContain("Authored case");
	vi.stubGlobal("location", { search: "?lab=1" });
	expect(render()).toContain("Concordia game-master proposal");
	expect(render()).toContain("Authored case");
	expect(html).not.toContain("Request received");
	expect(html).not.toContain('open=""');
});
it("reports an unheard request without inventing assistance or teaching", () => {
	const r = new Runtime(createRuntime(42, 8).export() as Save);
	r.s.hall = 12;
	r.s.hallSafe = true;
	r.intervene({
		kind: "request-inspection",
		actorId: "lea",
		proposal: good.proposal,
	});
	const town = r.view();
	if (town.assistance) town.assistance.received = false;
	const html = renderToStaticMarkup(
		createElement(InspectionSituation, {
			town,
			disabled: false,
			onAction: () => {},
			onCompare: () => {},
		}),
	);
	expect(html).toContain("Lea did not receive the request");
	expect(html).not.toContain("Four extra hall places are now available");
});
