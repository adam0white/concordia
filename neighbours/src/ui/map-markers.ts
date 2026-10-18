export interface MarkerPoint {
	id: string;
	placeId: string;
	x: number;
	y: number;
	travelling: boolean;
}

/** A screen box a resting marker must not cover, such as a place name. */
export interface MarkerAvoid {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** The text box of an SVG label drawn with `text-anchor: middle` at (x, baseline). */
export function labelBox(
	x: number,
	baseline: number,
	text: string,
	fontSize: number,
): MarkerAvoid {
	// Literata semibold averages about 0.6em per character; the paper halo adds a few units.
	const width = text.length * fontSize * 0.6 + 8;
	const height = fontSize * 1.3;
	return {
		x: x - width / 2,
		y: baseline - fontSize * 0.95,
		width,
		height,
	};
}

/**
 * Spread shared-place markers in screen-sized steps, and nudge any resting marker off a place label.
 * Journey coordinates stay exact. The nudge is deterministic: the nearest free grid step wins, ties by
 * position, residents in id order.
 */
export function layoutKnownMarkers(
	points: MarkerPoint[],
	scale: number,
	bounds: { width: number; height: number } = { width: 1080, height: 700 },
	avoid: readonly MarkerAvoid[] = [],
) {
	const groups = new Map<string, number>();
	for (const point of points)
		if (!point.travelling)
			groups.set(point.placeId, (groups.get(point.placeId) ?? 0) + 1);
	const radius = 22 * scale;
	const step = 48 * scale;
	const coversLabel = (p: { x: number; y: number }) =>
		avoid.some((box) => {
			const nx = Math.max(box.x, Math.min(box.x + box.width, p.x));
			const ny = Math.max(box.y, Math.min(box.y + box.height, p.y));
			return (p.x - nx) ** 2 + (p.y - ny) ** 2 < radius ** 2;
		});
	const clustered = (point: MarkerPoint) =>
		!point.travelling && (groups.get(point.placeId) ?? 0) > 1;
	const moves = (point: MarkerPoint) =>
		clustered(point) || (!point.travelling && coversLabel(point));
	const placed = points.filter((point) => !moves(point));
	const result = new Map(placed.map((point) => [point.id, point]));
	const clamp = (value: number, max: number) =>
		Math.max(radius, Math.min(max - radius, value));
	for (const point of points.toSorted((a, b) => a.id.localeCompare(b.id))) {
		if (!moves(point)) continue;
		const drop = clustered(point) ? 32 * scale : 0;
		const candidates: { x: number; y: number }[] = [];
		for (let row = -8; row <= 8; row++)
			for (let col = -8; col <= 8; col++)
				candidates.push({
					x: clamp(point.x + col * step, bounds.width),
					y: clamp(point.y + drop + row * step, bounds.height),
				});
		const distance = (p: { x: number; y: number }) =>
			(p.x - point.x) ** 2 + (p.y - point.y - drop) ** 2;
		candidates.sort(
			(a, b) => distance(a) - distance(b) || a.y - b.y || a.x - b.x,
		);
		const free = (candidate: { x: number; y: number }) =>
			placed.every(
				(other) =>
					Math.abs(other.x - candidate.x) >= 44 * scale ||
					Math.abs(other.y - candidate.y) >= 44 * scale,
			);
		const position =
			candidates.find(
				(candidate) => free(candidate) && !coversLabel(candidate),
			) ?? candidates.find(free);
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

/** The "you" label, in marker units: a 15px hand label whose baseline sits 10 units above the glyph. */
const YOU_LABEL = labelBox(0, -10, "you", 15);
/** Half-size of the player's diamond glyph plus its stroke, in marker units. */
const YOU_GLYPH = 7;

/**
 * Where the player's own marker group is drawn. A resting player sits up and to the left
 * of their place, so a place at the sheet's left edge would push the glyph and its "you"
 * label off the paper on a narrow map. The group is clamped so the whole marker stays on
 * the sheet; the shift is at most the marker's own width, so it stays beside its place.
 * Travel points lie between places, inside the margins, so the clamp leaves a walking
 * player at the exact projected position at supported map sizes.
 */
export function youMarkerPlacement(
	point: { x: number; y: number },
	moving: boolean,
	scale: number,
	bounds: { width: number; height: number },
) {
	const left = Math.max(YOU_GLYPH, -YOU_LABEL.x) * scale;
	const right = Math.max(YOU_GLYPH, YOU_LABEL.x + YOU_LABEL.width) * scale;
	const top = Math.max(YOU_GLYPH, -YOU_LABEL.y) * scale;
	const bottom = YOU_GLYPH * scale;
	const x = moving ? point.x : point.x - 50 * scale;
	const y = moving ? point.y : point.y - 40 * scale;
	return {
		x: Math.max(left, Math.min(bounds.width - right, x)),
		y: Math.max(top, Math.min(bounds.height - bottom, y)),
		/** The marker's extent around (x, y), in sheet units, for bounds checks. */
		extent: { left, right, top, bottom },
	};
}
