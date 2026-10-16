import { expect, it } from "vitest";
import { layoutKnownMarkers, type MarkerPoint } from "../src/ui/map-markers";

const group = Array.from(
	{ length: 8 },
	(_, i): MarkerPoint => ({
		id: `person-${i}`,
		placeId: "homes",
		x: 226,
		y: 575,
		travelling: false,
	}),
);
for (const width of [900, 366]) {
	it(`separates eight resting residents with 44px targets at ${width}px map width`, () => {
		const scale = 1080 / width;
		const markers = [...layoutKnownMarkers(group, scale).values()];
		for (const marker of markers) {
			expect(marker.x - 22 * scale).toBeGreaterThanOrEqual(0);
			expect(marker.x + 22 * scale).toBeLessThanOrEqual(1080);
			expect(marker.y - 22 * scale).toBeGreaterThanOrEqual(0);
			expect(marker.y + 22 * scale).toBeLessThanOrEqual(700);
			for (const other of markers.filter((other) => other.id !== marker.id))
				expect(
					Math.abs(marker.x - other.x) >= 44 * scale ||
						Math.abs(marker.y - other.y) >= 44 * scale,
				).toBe(true);
		}
		expect(layoutKnownMarkers([...group].reverse(), scale)).toEqual(
			layoutKnownMarkers(group, scale),
		);
	});
}
it("preserves actual journey projection and solitary place coordinates", () => {
	const travelling = {
		...group[0],
		id: "traveller",
		travelling: true,
		x: 300,
		y: 200,
	} as MarkerPoint;
	const alone = {
		...group[0],
		id: "alone",
		placeId: "school",
		x: 600,
		y: 100,
	} as MarkerPoint;
	const markers = layoutKnownMarkers([...group, travelling, alone], 3);
	expect(markers.get(travelling.id)).toEqual(travelling);
	expect(markers.get(alone.id)).toEqual(alone);
});
it("also avoids collisions between neighbouring resting-place clusters", () => {
	const nearby = group.map((point) => ({
		...point,
		id: `other-${point.id}`,
		placeId: "market",
		x: 280,
		y: 550,
	}));
	const scale = 3;
	const markers = [
		...layoutKnownMarkers([...group, ...nearby], scale).values(),
	];
	for (let i = 0; i < markers.length; i++)
		for (const other of markers.slice(i + 1)) {
			const marker = markers[i];
			expect(
				marker &&
					(Math.abs(marker.x - other.x) >= 44 * scale ||
						Math.abs(marker.y - other.y) >= 44 * scale),
			).toBe(true);
		}
});

it("keeps a narrow-map crowd together at its actual place and excludes journeys", async () => {
	const { knownPlaceClusters } = await import("../src/ui/map-markers");
	const traveller = {
		...group[0],
		id: "traveller",
		travelling: true,
	} as MarkerPoint;
	const clusters = knownPlaceClusters([...group, traveller], true);
	expect(clusters).toHaveLength(1);
	expect(clusters[0]).toMatchObject({ placeId: "homes", x: 226, y: 575 });
	expect(clusters[0]?.people).toHaveLength(8);
	expect(clusters[0]?.people.some((person) => person.travelling)).toBe(false);
	expect(knownPlaceClusters(group.slice(0, 2), true)).toEqual([]);
	expect(knownPlaceClusters(group, false)).toEqual([]);
});
