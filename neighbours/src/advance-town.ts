import type { RuntimePort } from "./bridge-port.ts";
import type {
	AdvanceProgress,
	AdvanceRequest,
	AdvanceResult,
	TownView,
} from "./contracts.ts";
import { hasHallChoice } from "./hall-choice.ts";
import { type PythonSession, restoreCheckpoint } from "./python-session.ts";

export function validateAdvanceRequest(request: AdvanceRequest): void {
	if (!Number.isSafeInteger(request.requestId) || request.requestId < 1)
		throw Error("Advance requires a positive safe request ID");
	if (
		!Number.isSafeInteger(request.maxRounds) ||
		request.maxRounds < 1 ||
		request.maxRounds > 672
	)
		throw Error("Advance must cover between 1 and 672 rounds");
	if (!["story", "person-story", "hall-choice"].includes(request.until))
		throw Error("Unknown advance stopping condition");
	if (request.until === "person-story" && typeof request.actorId !== "string")
		throw Error("Choose an existing person before advancing to their story");
}

/** One pending request, including its queued phase. Old cancels are never stored. */
export class AdvanceCancellation {
	private pending?: { requestId: number; cancelled: boolean };
	private lastRequestId = 0;
	begin(request: AdvanceRequest): () => boolean {
		validateAdvanceRequest(request);
		if (this.pending) throw Error("A town advance is already in progress");
		if (request.requestId <= this.lastRequestId)
			throw Error("Advance requires a new request ID");
		const pending = { requestId: request.requestId, cancelled: false };
		this.lastRequestId = request.requestId;
		this.pending = pending;
		return () => pending.cancelled;
	}
	cancel(requestId: number): void {
		if (this.pending?.requestId === requestId) this.pending.cancelled = true;
	}
	finish(requestId: number): void {
		if (this.pending?.requestId === requestId) this.pending = undefined;
	}
}

/** Advance the actual engine. Cancellation retains completed rounds; errors roll back. */
export async function advanceTown(
	py: PythonSession,
	port: RuntimePort,
	request: AdvanceRequest,
	progress: (value: AdvanceProgress) => void = () => {},
	cancelled: () => boolean = () => false,
): Promise<AdvanceResult> {
	validateAdvanceRequest(request);
	const start = port.runtime.view();
	if (
		request.until === "person-story" &&
		!start.people.some((person) => person.id === request.actorId)
	)
		throw Error("Choose an existing person before advancing to their story");
	if (start.people.some((person) => person.policy === "llm"))
		throw Error(
			"Browser advance requires local controllers; no live model fallback is available",
		);
	const result = (reason: AdvanceResult["reason"], rounds: number) => ({
		requestId: request.requestId,
		reason,
		rounds,
	});
	if (cancelled()) return result("cancelled", 0);
	const startingStories = new Set(start.stories.map((story) => story.id));
	const reached = (view: TownView): boolean =>
		request.until === "hall-choice"
			? hasHallChoice(view)
			: view.stories.some(
					(story) =>
						!startingStories.has(story.id) &&
						(request.until === "story" || story.actorId === request.actorId),
				);
	if (reached(start)) return result(request.until, 0);
	const checkpoint: unknown = JSON.parse(
		String(await py.runPythonAsync("json.dumps(town_engine.save())")),
	);
	let rounds = 0;
	try {
		while (rounds < request.maxRounds) {
			if (cancelled()) return result("cancelled", rounds);
			await py.runPythonAsync("town_engine.advance(1)\nNone");
			rounds++;
			const view = port.runtime.view();
			if (reached(view)) return result(request.until, rounds);
			if (rounds % 8 === 0) {
				progress({
					requestId: request.requestId,
					rounds,
					maxRounds: request.maxRounds,
					day: view.day,
					now: view.now,
				});
				await new Promise((resolve) => setTimeout(resolve, 0));
			}
		}
		return result(cancelled() ? "cancelled" : "horizon", rounds);
	} catch (error) {
		try {
			await restoreCheckpoint(py, port, checkpoint);
		} catch (restoreError) {
			throw Error(
				`Town advance failed and its starting checkpoint could not be restored: ${String(restoreError)}`,
			);
		}
		throw Error(
			`Town advance failed. The starting checkpoint was restored: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}
