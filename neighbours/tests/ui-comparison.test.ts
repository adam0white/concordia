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

it("leads with differing interval outcomes, folds shared results once and keeps the original download", () => {
	const shared = {
		id: "old",
		at: 200,
		title: "Old result",
		summary: "Precheckpoint history",
	};
	const same = {
		id: "same",
		at: 600,
		title: "Class result",
		summary: "Same lesson received",
	};
	const report: TownComparison = {
		schema: "town-comparison@1",
		seed: 42,
		startAt: 480,
		endAt: 960,
		rounds: 32,
		startHash: "abc",
		intervention: { kind: "lend-tools" },
		limits: ["Bounded evidence"],
		baseline: {
			stats: { tools: 3 },
			known: [],
			stories: [
				shared,
				same,
				{ id: "one", at: 900, title: "Supper", summary: "Nobody attended" },
			],
		},
		treatment: {
			stats: { tools: 6 },
			known: [],
			stories: [
				shared,
				{ ...same, id: "different-branch-id" },
				{ id: "two", at: 900, title: "Supper", summary: "Four neighbours ate" },
			],
		},
	};
	const before = JSON.stringify(report);
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
	expect(html.indexOf("Four neighbours ate")).toBeLessThan(
		html.indexOf("Resources and neighbour state"),
	);
	expect(html).not.toContain("<b>Old result</b>");
	expect(html.match(/Same lesson received/g)).toHaveLength(1);
	expect(html).toContain("Same outcomes in both runs · 1");
	expect(html).toContain("Day 1, 08:00");
	expect(html).toContain("Day 1, 16:00");
	expect(html).toContain("Download full comparison");
	expect(html).toContain(encodeURIComponent(JSON.stringify(report, null, 2)));
	expect(JSON.stringify(report)).toBe(before);
});

it("keeps the ready result preamble short and renders each outcome summary once", () => {
	const report: TownComparison = {
		schema: "town-comparison@1",
		seed: 42,
		startAt: 480,
		endAt: 960,
		rounds: 32,
		startHash: "abc",
		intervention: { kind: "lend-tools" },
		limits: [],
		baseline: { stats: {}, known: [], stories: [] },
		treatment: {
			stats: {},
			known: [],
			stories: [
				{
					id: "one",
					at: 900,
					title: "Lea taught Ada",
					summary: "Lea taught Ada the timber method.",
				},
			],
		},
	};
	const html = renderToStaticMarkup(
		createElement(DayComparison, {
			report,
			request: { label: "Help with the class", rounds: 32 },
			busy: false,
			progress: "",
			error: "",
			selected: "",
			onRun: () => {},
		}),
	);
	const payoff = html.indexOf("Lea taught Ada the timber method.");
	const before = html.slice(0, payoff);
	expect(before).not.toContain("Last request");
	expect(before).not.toContain("Last comparison");
	expect(before).not.toContain("seed 42");
	expect(before).not.toContain("Try another comparison");
	expect(before).not.toContain("Both use the actual simulation");
	expect(html).not.toContain("<b>Lea taught Ada</b>");
	expect(html).toContain('aria-label="Lea taught Ada"');
	expect(html).toContain("Hypothetical · Your town is unchanged");
	expect(html).toContain("Without help");
	expect(html).toContain("With help");
});
