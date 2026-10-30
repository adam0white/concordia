import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import TownMap from "../src/ui/TownMap";
import { NeighbourStrip } from "../src/ui/TownOverview";
import { createRuntime } from "./current-town.ts";

it("makes buildings selectable with a visible selected outline", () => {
	const town = createRuntime(42, 8).view();
	const html = renderToStaticMarkup(
		createElement(TownMap, {
			town,
			selected: "",
			select: () => {},
			selectedPlace: "hall",
			selectPlace: () => {},
		}),
	);
	expect(html).toMatch(/data-map-place="hall"[^>]*role="button"/);
	expect(html).toContain('aria-label="Inspect Flooded hall"');
	expect(html).toContain('class="place-selection-outline"');
	expect(html).toContain('aria-pressed="true"');
});

it("makes the known Hall lower-strip cue a place selection button", () => {
	const town = createRuntime(42, 8).view();
	const html = renderToStaticMarkup(
		createElement(NeighbourStrip, {
			town,
			selected: "",
			select: () => {},
			selectedPlace: "hall",
			selectPlace: () => {},
		}),
	);
	expect(html).toMatch(/<button[^>]*class="known-place-need"/);
	expect(html).toContain('aria-pressed="true"');
	expect(html).toContain("Needs help");
});

it("shows the host walk estimate, known hall need and actual company", async () => {
	const { default: PlacePanel } = await import("../src/ui/PlacePanel");
	const town = createRuntime(42, 8).view();
	const place = town.places.find((p) => p.id === "hall");
	if (!place || !town.player) throw new Error("Missing player or hall");
	const estimate = town.player.destinations.find(
		(p) => p.id === "hall",
	)?.minutes;
	const html = renderToStaticMarkup(
		createElement(PlacePanel, {
			town,
			place,
			move: () => {},
			select: () => {},
			close: () => {},
		}),
	);
	expect(html).toContain(`Walk to Flooded hall · ~${estimate} min`);
	expect(html).toContain("The hall needs repairs.");
	expect(html).toContain("Who is around");
	expect(html).toContain("No familiar neighbours are here now.");
});

it("acknowledges an actual journey and explains why another walk is unavailable", async () => {
	const { default: PlacePanel } = await import("../src/ui/PlacePanel");
	const runtime = createRuntime(42, 8);
	runtime.intervene({ kind: "player-move", placeId: "hall" });
	const town = runtime.view();
	const place = town.places.find((p) => p.id === "hall");
	if (!place) throw new Error("Missing hall");
	const html = renderToStaticMarkup(
		createElement(PlacePanel, {
			town,
			place,
			move: () => {},
			select: () => {},
			close: () => {},
		}),
	);
	expect(html).toContain("You are walking to Flooded hall");
	expect(html).toContain(
		"Your walk must end before you can walk somewhere else.",
	);
	expect(html).toContain("disabled");
});

it("offers Talk only for host-present company and Meet otherwise", async () => {
	const { default: PlacePanel } = await import("../src/ui/PlacePanel");
	const town = createRuntime(42, 8).view();
	const place = town.places.find((p) => p.id === "workshop");
	if (!place || !town.player) throw new Error("Missing workshop/player");
	const props = {
		town,
		place,
		move: () => {},
		select: () => {},
		close: () => {},
	};
	expect(renderToStaticMarkup(createElement(PlacePanel, props))).toContain(
		"Meet Nora",
	);
	town.player.present = [
		{ id: "ada", name: "Nora", known: true, activity: "Free to choose" },
	];
	expect(renderToStaticMarkup(createElement(PlacePanel, props))).toContain(
		"Talk to Nora",
	);
});
