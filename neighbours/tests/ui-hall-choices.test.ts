import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { TownView } from "../src/contracts";
import { createRuntime } from "../src/core/index";
import HallChoices from "../src/ui/HallChoices";

function town(): TownView {
	const view = createRuntime(42, 8).view();
	view.evenings = [
		{
			id: "weekly-0-class",
			kind: "class",
			organiserId: "lea",
			title: "Lea’s class",
			startsAt: 18000,
			endsAt: 18060,
			stage: "candidate",
			recurring: true,
			canOpenSlot: true,
			canAdvertise: false,
			heard: 0,
			accepted: 0,
			attended: 0,
			participantIds: [],
		},
		{
			id: "weekly-0-meal",
			kind: "meal",
			organiserId: "sam",
			title: "Sam’s supper",
			startsAt: 18000,
			endsAt: 18060,
			stage: "proposed",
			recurring: true,
			canOpenSlot: false,
			canAdvertise: true,
			heard: 5,
			accepted: 2,
			attended: 0,
			participantIds: [],
		},
	];
	return view;
}
const html = (view: TownView, disabled = false) =>
	renderToStaticMarkup(
		createElement(HallChoices, { town: view, disabled, onAction: () => {} }),
	);

it("hides future choices until a genuine recurring opportunity exists", () => {
	expect(html(createRuntime(42, 8).view())).toBe("");
});
it("exposes scarce alternative-slot and notice choices without implying acceptance", () => {
	const content = html(town());
	expect(content).toContain("Hall choices");
	expect(content).toContain("Fund another slot for Lea");
	expect(content).toContain("Advertise Sam’s invitation");
	expect(content).toContain("1 town credit");
	expect(content).toContain("does not make anyone attend");
	expect(content).not.toContain("<details open");
});
it("retains the opportunity but disables spending when budget or session prevents it", () => {
	const view = town();
	view.controlsRemaining = 0;
	expect(html(view).match(/disabled=""/g)).toHaveLength(2);
	expect(html(town(), true).match(/disabled=""/g)).toHaveLength(2);
});

it("offers the weekly choice even after the original allowance is exhausted", () => {
	const view = town();
	view.controlsRemaining = 0;
	for (const evening of view.evenings ?? []) evening.supportRemaining = 1;
	const content = html(view);
	expect(content).not.toContain('disabled=""');
	expect(content).toContain("1 weekly choice");
	expect(content).toContain("1 weekly choice available");
});
