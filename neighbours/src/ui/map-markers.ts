export interface MarkerPoint {
	id: string;
	placeId: string;
	x: number;
	y: number;
	travelling: boolean;
}

/** Spread shared-place markers in screen-sized steps. Journey coordinates stay exact. */
export function layoutKnownMarkers(points: MarkerPoint[], scale: number) {
	const groups = new Map<string, number>();
	for (const point of points)
		if (!point.travelling)
			groups.set(point.placeId, (groups.get(point.placeId) ?? 0) + 1);
	const clustered = (point: MarkerPoint) =>
		!point.travelling && (groups.get(point.placeId) ?? 0) > 1;
	const placed = points.filter((point) => !clustered(point));
	const result = new Map(placed.map((point) => [point.id, point]));
	const radius = 22 * scale;
	const step = 48 * scale;
	const clamp = (value: number, max: number) =>
		Math.max(radius, Math.min(max - radius, value));
	for (const point of points.toSorted((a, b) => a.id.localeCompare(b.id))) {
		if (!clustered(point)) continue;
		const candidates: { x: number; y: number }[] = [];
		for (let row = -8; row <= 8; row++)
			for (let col = -8; col <= 8; col++)
				candidates.push({
					x: clamp(point.x + col * step, 1080),
					y: clamp(point.y + 32 * scale + row * step, 700),
				});
		const distance = (p: { x: number; y: number }) =>
			(p.x - point.x) ** 2 + (p.y - point.y - 32 * scale) ** 2;
		candidates.sort(
			(a, b) => distance(a) - distance(b) || a.y - b.y || a.x - b.x,
		);
		const position = candidates.find((candidate) =>
			placed.every(
				(other) =>
					Math.abs(other.x - candidate.x) >= 44 * scale ||
					Math.abs(other.y - candidate.y) >= 44 * scale,
			),
		);
		// Eight familiar residents fit at supported map widths. Keep a bounded
		// fallback for a host that later supplies a larger named population.
		const marker = { ...point, ...(position ?? candidates[0]) };
		placed.push(marker);
		result.set(point.id, marker);
	}
	return result;
}

/** A narrow map keeps a crowd at its real place instead of spreading it across town. */
export function knownPlaceClusters(points: MarkerPoint[], compact: boolean) {
	if (!compact) return [];
	const groups = new Map<string, MarkerPoint[]>();
	for (const point of points) {
		if (point.travelling) continue;
		const group = groups.get(point.placeId) ?? [];
		group.push(point);
		groups.set(point.placeId, group);
	}
	return [...groups.entries()]
		.filter(([, people]) => people.length >= 3)
		.map(([placeId, people]) => ({
			placeId,
			x: people[0]?.x ?? 0,
			y: people[0]?.y ?? 0,
			people: people.toSorted((a, b) => a.id.localeCompare(b.id)),
		}));
}
