import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { TownComparison } from "../src/contracts";
import DayComparison from "../src/ui/DayComparison";

it("offers seven days and names contextual reports without adding targetless hall controls", () => {
	const report: TownComparison = {
		schema: "town-comparison@1",
		seed: 42,
		startAt: 480,
		endAt: 10560,
		rounds: 672,
		startHash: "abc",
		intervention: { kind: "open-evening-slot", eventId: "week-one" },
		baseline: { stats: {}, known: [], stories: [] },
		treatment: { stats: {}, known: [], stories: [] },
		limits: [],
	};
	const html = renderToStaticMarkup(
		createElement(DayComparison, {
			report,
			busy: false,
			progress: "",
			error: "",
			selected: "",
			onRun: () => {},
		}),
	);
	expect(html).toContain("Seven days · 672 rounds");
	expect(html).toContain("Open a second hall evening");
	expect(html).not.toContain('<option value="open-evening-slot"');
	expect(html).not.toContain('<option value="advertise-evening"');
});
