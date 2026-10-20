import { createElement, isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PersonView, PlaceView, TownView } from "../src/contracts";
import { labelBox, youMarkerPlacement } from "../src/ui/map-markers";
import TownMap from "../src/ui/TownMap";
import { NeighbourStrip } from "../src/ui/TownOverview";

// The town's place layout (src/core/state.ts placeSpecs), copied so this UI test
// does not depend on core.
const places = (
	[
		["homes", "Riverside homes", 12, 65, "home"],
		["market", "Market kitchen", 42, 60, "food"],
		["clinic", "Clinic", 68, 62, "care"],
		["workshop", "Workshop", 74, 35, "work"],
		["quay", "Quay", 14, 35, "supply"],
		["garden", "Community garden", 30, 18, "grow"],
		["school", "School", 58, 18, "learn"],
		["hall", "Flooded hall", 47, 39, "community"],
	] as const
).map(
	([id, name, x, y, kind]): PlaceView => ({
		id,
		name,
		kind,
		x,
		y,
		open: id !== "hall",
		stock: 0,
		capacity: 10,
		occupants: 0,
		description: name,
	}),
);

const sheets = {
	portrait: {
		width: 720,
		height: 1000,
		left: 112,
		right: 110,
		top: 235,
		bottom: 150,
	},
	landscape: {
		width: 1080,
		height: 700,
		left: 200,
		right: 120,
		top: 130,
		bottom: 150,
	},
};
type SheetBox = (typeof sheets)[keyof typeof sheets];
/** TownMap's projection of a place onto a sheet. */
const project = (sheet: SheetBox, id: string) => {
	const place = places.find((p) => p.id === id);
	if (!place) throw new Error(id);
	return {
		x:
			sheet.left +
			((place.x - 12) / (74 - 12)) * (sheet.width - sheet.left - sheet.right),
		y:
			sheet.top +
			((place.y - 18) / (65 - 18)) * (sheet.height - sheet.top - sheet.bottom),
	};
};
/** The drawn marker's box in sheet units: the diamond (±7) and the "you" label. */
const youBox = (at: { x: number; y: number }, scale: number) => {
	const label = labelBox(0, -10, "you", 15);
	return {
		left: at.x + Math.min(-7, label.x) * scale,
		right: at.x + Math.max(7, label.x + label.width) * scale,
		top: at.y + Math.min(-7, label.y) * scale,
		bottom: at.y + 7 * scale,
	};
};

describe("the player's own marker", () => {
	// Phone map boxes: a full-height portrait map, and the short strip of map
	// left above an open drawer (which falls back to the landscape sheet).
	const boxes = [320, 360, 390].flatMap((width) => [
		{ sheet: sheets.portrait, width, height: width * 1.7 },
		{ sheet: sheets.landscape, width, height: width * 0.6 },
	]);
	boxes.push({ sheet: sheets.landscape, width: 1080, height: 700 });
	for (const { sheet, width, height } of boxes)
		for (const placeId of ["homes", "quay", "garden", "workshop"])
			it(`stays whole at ${placeId} on a ${sheet.width}-wide sheet in a ${width}×${Math.round(height)} map`, () => {
				const scale = Math.max(1, sheet.width / width, sheet.height / height);
				const place = project(sheet, placeId);
				const at = youMarkerPlacement(place, false, scale, sheet);
				const box = youBox(at, scale);
				expect(box.left).toBeGreaterThanOrEqual(0);
				expect(box.right).toBeLessThanOrEqual(sheet.width);
				expect(box.top).toBeGreaterThanOrEqual(0);
				expect(box.bottom).toBeLessThanOrEqual(sheet.height);
				// Still beside its own place: no further away than the resting offset.
				expect(Math.hypot(at.x - place.x, at.y - place.y)).toBeLessThanOrEqual(
					Math.hypot(50, 40) * scale + 1e-9,
				);
			});
	it("was cut off at the homes before clamping on a 360px phone", () => {
		const scale = 720 / 360;
		const homes = project(sheets.portrait, "homes");
		const unclamped = { x: homes.x - 50 * scale, y: homes.y - 40 * scale };
		expect(youBox(unclamped, scale).left).toBeLessThan(0);
	});
	it("keeps a walking player at the exact projected point", () => {
		const a = project(sheets.portrait, "homes");
		const b = project(sheets.portrait, "workshop");
		const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
		const at = youMarkerPlacement(mid, true, 2.25, sheets.portrait);
		expect({ x: at.x, y: at.y }).toEqual(mid);
	});
});

const person = (
	id: string,
	placeId: string,
	lifeState?: PersonView["lifeState"],
) =>
	({
		id,
		name: id[0]?.toUpperCase() + id.slice(1),
		known: true,
		placeId,
		lifeState,
		activity: "Working",
	}) as PersonView;
const town = (people: PersonView[]) =>
	({
		now: 600,
		day: 1,
		seed: 1,
		places,
		people,
		stats: { hallRepairs: 3 },
		player: { active: true, placeId: "workshop" },
		handcart: { progress: 1, total: 3, returned: false, requests: 0 },
	}) as unknown as TownView;
const renderMap = (people: PersonView[]) =>
	renderToStaticMarkup(
		createElement(TownMap, {
			town: town(people),
			selected: "",
			select: () => {},
		}),
	);

describe("map glyphs", () => {
	it("draws the workshop with a hammer, not crossed strokes", () => {
		const html = renderMap([person("ravi", "workshop")]);
		const workshop =
			html.split('data-map-place="workshop"')[1]?.split("data-map-place=")[0] ??
			"";
		expect(workshop).toContain("tool-mark");
		expect(html).not.toContain("tools2");
	});
	it("keeps × for death only, and the legend names every marker", () => {
		const alive = renderMap([
			person("ravi", "workshop"),
			person("ada", "homes"),
		]);
		const withoutLegend = (html: string) =>
			html.replace(/<desc[\s\S]*?<\/desc>/, "");
		expect(withoutLegend(alive)).not.toContain("×");
		expect(alive).not.toContain("M-5 -5 5 5");
		expect(alive).toContain('class="you-mark"');
		expect(alive).toMatch(
			/<desc[^>]*>[^<]*× for death[^<]*small diamond labelled you/,
		);
		const dead = withoutLegend(renderMap([person("ravi", "workshop", "dead")]));
		expect(dead.match(/×/g)).toHaveLength(1);
		expect(dead).toMatch(/class="life-note"[^>]*>×</);
	});
});

describe("neighbour chips", () => {
	it("never close the open panel, even for the selected neighbour", () => {
		const selected: string[] = [];
		let closed = 0;
		const strip = NeighbourStrip({
			town: town([person("noor", "homes"), person("sam", "market")]),
			selected: "noor",
			select: (id) => selected.push(id),
			close: () => closed++,
		}) as ReactElement<{ children: unknown }>;
		const chips = (strip.props.children as unknown[])
			.flat()
			.filter(
				(child) =>
					isValidElement<{ "data-person-id"?: string }>(child) &&
					child.type === "button" &&
					!!child.props["data-person-id"],
			) as ReactElement<{
			onClick: () => void;
			"aria-current"?: string;
			"data-person-id": string;
		}>[];
		for (const chip of chips) chip.props.onClick();
		expect(closed).toBe(0);
		expect(selected).toEqual(["noor", "sam"]);
		expect(chips.map((chip) => chip.props["aria-current"])).toEqual([
			"true",
			undefined,
		]);
	});
});
