export type FirstStep = "select" | "route" | "request" | "answer" | null;

/** Presentation only: a reply belongs to this guide only when it is newly recorded. */
export function firstStep(input: {
	enabled: boolean;
	selected: string;
	conversation: boolean;
	requestIds: readonly number[];
	knownIds: readonly number[];
}): FirstStep {
	if (!input.enabled) return null;
	if (!input.selected) return "select";
	if (!input.conversation) return "route";
	if (input.requestIds.some((id) => !input.knownIds.includes(id)))
		return "answer";
	return "request";
}

/** A same-tab reload may retain the guide's baseline only for a compatible town. */
export function restoredBaseline(
	raw: string | null,
	seed: number,
	now: number,
	current: readonly number[],
): number[] | null {
	try {
		const value: unknown = JSON.parse(raw ?? "null");
		if (!value || typeof value !== "object") return null;
		const saved = value as { seed?: unknown; at?: unknown; ids?: unknown };
		if (
			saved.seed !== seed ||
			typeof saved.at !== "number" ||
			saved.at > now ||
			!Array.isArray(saved.ids) ||
			!saved.ids.every((id) => Number.isSafeInteger(id)) ||
			(saved.ids.length > 0 &&
				!saved.ids.some((id) => current.includes(id)) &&
				!(
					current.length > 0 &&
					current.every((id) => id > Math.max(...(saved.ids as number[])))
				))
		)
			return null;
		return saved.ids as number[];
	} catch {
		return null;
	}
}

/** Summarize only the request's public recorded status, not a predicted outcome. */
export function requestOutcome(status: string): string {
	const text: Record<string, string> = {
		held: "⏳ The request is waiting. No later work is recorded.",
		refused: "✋ The neighbour refused the request.",
		decided: "💬 A decision is recorded. Work is not confirmed.",
		started: "🔨 The work started. It is not finished.",
		"counter-started": "🔨 The alternative started. It is not finished.",
		completed: "✓ The chosen work finished.",
		failed: "⚠ The chosen work failed.",
		interrupted: "⚠ The chosen work was interrupted.",
		continued: "↪ The activity continued.",
		replaced: "↪ A later request replaced this one.",
		dropped: "✋ The request ended without being taken up.",
	};
	return text[status] ?? "💬 See the recorded answer.";
}
