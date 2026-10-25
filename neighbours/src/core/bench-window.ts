/** A discussion premise only. Actual access still requires Ada's received agreement. */
export type BenchSlot = "soon" | "tomorrow" | "brief";
export function validateBenchProposal(value: unknown): BenchSlot {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw Error("Invalid bench proposal");
	const p = value as Record<string, unknown>;
	if (
		Object.keys(p).length !== 3 ||
		p.schema !== "neighbours-bench-proposal@1" ||
		p.kind !== "bench-window" ||
		typeof p.slot !== "string" ||
		!["soon", "tomorrow", "brief"].includes(p.slot)
	)
		throw Error("Invalid bench proposal");
	return p.slot as BenchSlot;
}
export function benchWindow(
	now: number,
	slot: BenchSlot,
): { from: number; until: number } {
	if (!Number.isSafeInteger(now) || now < 0)
		throw Error("Invalid bench proposal clock");
	const day = Math.floor(now / 1440);
	const duration = slot === "brief" ? 30 : 240;
	// The next decision is one round later; asking and Ada’s reply each take a round.
	let from =
		slot === "tomorrow"
			? (day + 1) * 1440 + 480
			: Math.max(day * 1440 + 480, now + 45);
	if (from + duration > day * 1440 + 1080 && slot !== "tomorrow")
		from = (day + 1) * 1440 + 480;
	return { from, until: from + duration };
}
