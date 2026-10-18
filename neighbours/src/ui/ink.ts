/**
 * Deterministic hand-drawn ink geometry for the Field Notebook map.
 *
 * Every wobble derives from a string key (usually an element id plus a part
 * name), so the same element draws the same way on every render, reload and
 * device. Nothing here uses Math.random. The jitter is decoration only: callers
 * never move a marker, hit target or actual place position with it.
 */
type Point = readonly [number, number];

/** FNV-1a 32-bit hash of a string key. */
export function hash(key: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < key.length; i++) {
		h ^= key.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return h >>> 0;
}

/** Small seeded generator (mulberry32) returning values in [0, 1). */
export function seeded(key: string): () => number {
	let state = hash(key);
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** One deterministic value in [-1, 1] for a key and salt. */
export function jitter(key: string, salt: number | string = 0): number {
	return (hash(`${key}#${salt}`) / 4294967295) * 2 - 1;
}

const r1 = (value: number) => Math.round(value * 10) / 10;
const mid = (a: Point, b: Point): Point => [
	(a[0] + b[0]) / 2,
	(a[1] + b[1]) / 2,
];

/** Split each segment into roughly `step`-long pieces and nudge the inner points. */
function wobble(
	key: string,
	points: readonly Point[],
	amp: number,
	step: number,
	closed: boolean,
): Point[] {
	const next = seeded(key);
	const out: Point[] = [];
	const count = closed ? points.length : points.length - 1;
	for (let i = 0; i < count; i++) {
		const a = points[i];
		const b = points[(i + 1) % points.length];
		if (!a || !b) continue;
		const dx = b[0] - a[0];
		const dy = b[1] - a[1];
		const length = Math.hypot(dx, dy);
		const pieces = Math.max(1, Math.round(length / step));
		const nx = length ? -dy / length : 0;
		const ny = length ? dx / length : 0;
		for (let j = 0; j < pieces; j++) {
			const t = j / pieces;
			const offset =
				j === 0 ? (next() * 2 - 1) * amp * 0.4 : (next() * 2 - 1) * amp;
			out.push([a[0] + dx * t + nx * offset, a[1] + dy * t + ny * offset]);
		}
	}
	if (!closed) {
		const last = points[points.length - 1];
		if (last) out.push([last[0] + (next() * 2 - 1) * amp * 0.4, last[1]]);
	}
	return out;
}

/** Smooth path through wobbled points using midpoint quadratic curves. */
function smooth(points: readonly Point[], closed: boolean): string {
	const first = points[0];
	if (!first) return "";
	if (points.length < 3) {
		return points
			.map((p, i) => `${i ? "L" : "M"}${r1(p[0])} ${r1(p[1])}`)
			.join("");
	}
	if (closed) {
		const last = points[points.length - 1] ?? first;
		const start = mid(last, first);
		let d = `M${r1(start[0])} ${r1(start[1])}`;
		for (let i = 0; i < points.length; i++) {
			const p = points[i] ?? first;
			const q = mid(p, points[(i + 1) % points.length] ?? first);
			d += `Q${r1(p[0])} ${r1(p[1])} ${r1(q[0])} ${r1(q[1])}`;
		}
		return `${d}Z`;
	}
	let d = `M${r1(first[0])} ${r1(first[1])}`;
	for (let i = 1; i < points.length - 1; i++) {
		const p = points[i] ?? first;
		const q = mid(p, points[i + 1] ?? p);
		d += `Q${r1(p[0])} ${r1(p[1])} ${r1(q[0])} ${r1(q[1])}`;
	}
	const last = points[points.length - 1] ?? first;
	return `${d}L${r1(last[0])} ${r1(last[1])}`;
}

/** An open hand-drawn line through `points`. */
export function inkLine(
	key: string,
	points: readonly Point[],
	amp = 1.2,
	step = 16,
): string {
	return smooth(wobble(key, points, amp, step, false), false);
}

/** A closed hand-drawn shape through `points` (fillable). */
export function inkShape(
	key: string,
	points: readonly Point[],
	amp = 1.2,
	step = 16,
): string {
	return smooth(wobble(key, points, amp, step, true), true);
}

/**
 * A box drawn as four strokes that slightly overshoot their corners, plus a
 * closed wobbly outline for the flat paper fill underneath.
 */
export function inkBox(
	key: string,
	x: number,
	y: number,
	w: number,
	h: number,
	amp = 1.1,
): { fill: string; stroke: string } {
	const corners: Point[] = [
		[x, y],
		[x + w, y],
		[x + w, y + h],
		[x, y + h],
	];
	const over = Math.min(4, Math.min(w, h) * 0.12);
	const stroke = corners
		.map((a, i) => {
			const b = corners[(i + 1) % 4] ?? a;
			const dx = Math.sign(b[0] - a[0]) * over;
			const dy = Math.sign(b[1] - a[1]) * over;
			const s = (jitter(key, `o${i}`) + 1) / 2;
			return inkLine(
				`${key}:${i}`,
				[
					[a[0] - dx * s, a[1] - dy * s],
					[b[0] + dx * (1 - s), b[1] + dy * (1 - s)],
				],
				amp,
			);
		})
		.join("");
	return { fill: inkShape(`${key}:fill`, corners, amp * 0.6, 40), stroke };
}

/** A hand-drawn circle whose radius never exceeds `r * (1 + amp)`. */
export function inkCircle(
	key: string,
	cx: number,
	cy: number,
	r: number,
	amp = 0.06,
): string {
	const next = seeded(key);
	const count = Math.max(8, Math.min(18, Math.round(r / 1.6)));
	const turn = next() * Math.PI * 2;
	const points: Point[] = Array.from({ length: count }, (_, i) => {
		const angle = turn + (i / count) * Math.PI * 2;
		const radius = r * (1 + (next() * 2 - 1) * amp);
		return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
	});
	return smooth(points, true);
}
