import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { knownOpenNeeds } from "../src/ui/known-needs";
import TownMap from "../src/ui/TownMap";
import { NeighbourStrip } from "../src/ui/TownOverview";
import { createRuntime } from "./historical-runtime.ts";

const town = () => createRuntime(42, 8).view();

describe("known open needs", () => {
	it("marks the shared hall repair and then inspection need, clearing it after opening", () => {
		const view = town();
		expect(knownOpenNeeds(view).places.hall).toBe("The hall needs repairs.");
		view.stats.hallRepairs = 12;
		expect(knownOpenNeeds(view).places.hall).toBe(
			"The hall needs an inspection before it can open.",
		);
		const hall = view.places.find((place) => place.id === "hall");
		if (!hall) throw new Error("Missing hall");
		hall.open = true;
		expect(knownOpenNeeds(view).places.hall).toBeUndefined();
	});

	it("leaves private physiology and absent hall state unknown", () => {
		const view = town();
		for (const person of view.people) person.needs = { food: 1, water: 1 };
		view.places = view.places.filter((place) => place.id !== "hall");
		expect(knownOpenNeeds(view)).toEqual({ people: {}, places: {} });
		view.places = town().places;
		delete view.stats.hallRepairs;
		expect(knownOpenNeeds(view).places.hall).toBeUndefined();
	});

	it("uses the same visible text for the map and compact place list", () => {
		const view = town();
		const props = { town: view, selected: "", select: () => {} };
		const map = renderToStaticMarkup(createElement(TownMap, props));
		const strip = renderToStaticMarkup(createElement(NeighbourStrip, props));
		expect(map).toContain('class="known-need-map"');
		expect(map).toContain("Needs help");
		expect(strip).toContain('class="known-place-need"');
		expect(strip).toContain("Needs help");
		const hall = view.places.find((place) => place.id === "hall");
		if (!hall) throw new Error("Missing hall");
		hall.open = true;
		expect(
			renderToStaticMarkup(createElement(NeighbourStrip, props)),
		).not.toContain("Needs help");
	});
});
