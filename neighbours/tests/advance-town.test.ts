import { describe, expect, it, vi } from "vitest";
import { AdvanceCancellation, advanceTown } from "../src/advance-town.ts";
import { RuntimePort } from "../src/bridge-port.ts";
import type {
	AdvanceProgress,
	AdvanceRequest,
	TownView,
} from "../src/contracts.ts";

const request = (changes: Partial<AdvanceRequest> = {}): AdvanceRequest => ({
	type: "advance",
	requestId: 1,
	until: "story",
	maxRounds: 20,
	...changes,
});
function engine(change: (view: TownView, round: number) => void = () => {}) {
	const port = new RuntimePort(42, 8);
	let round = 0;
	let failAt = 0;
	const globals = new Map<string, unknown>();
	const actualView = port.runtime.view.bind(port.runtime);
	vi.spyOn(port.runtime, "view").mockImplementation(() => {
		const view = actualView();
		view.stories = [];
		change(view, round);
		return view;
	});
	const py = {
		globals: { set: (key: string, value: unknown) => globals.set(key, value) },
		runPythonAsync: vi.fn(async (code: string): Promise<unknown> => {
			if (code === "json.dumps(town_engine.save())")
				return JSON.stringify({ world: port.runtime.export(), round });
			if (code.startsWith("town_engine.advance(")) {
				port.runtime.step();
				round++;
				if (round === failAt) throw Error("broken engine");
			} else if (code.startsWith("candidate_engine =")) {
				const packet = JSON.parse(String(globals.get("import_packet")));
				port.dispatch({ op: "restore", save: packet.world });
				round = packet.round;
			}
			return undefined;
		}),
	};
	return {
		port,
		py,
		rounds: () => round,
		fail: (at: number) => {
			failAt = at;
		},
	};
}
function story(view: TownView, id: string, actorId?: string) {
	view.stories.push({
		id,
		actorId,
		title: "A dated outcome",
		summary: "Actual event",
		kind: "test",
		eventIds: [1],
		at: view.now,
	});
}

describe("actual town advance", () => {
	it("does not stop for an old result, another person's result or a pending deadline passing", async () => {
		const e = engine((view, round) => {
			const musa = view.people.find((p) => p.id === "musa"),
				ada = view.people.find((p) => p.id === "ada");
			if (!musa || !ada) throw Error("Missing resident");
			musa.commitments = [
				{ label: "Old promise", at: 480, status: "kept" },
				{ label: "Pending promise", at: 490, status: "pending" },
			];
			ada.commitments = [
				{
					label: "Other promise",
					at: 490,
					status: round >= 2 ? "broken" : "pending",
				},
			];
			if (round >= 1) story(view, "other-person", "ada");
		});
		expect(
			await advanceTown(
				e.py,
				e.port,
				request({ until: "person-story", actorId: "musa", maxRounds: 16 }),
			),
		).toEqual({ requestId: 1, reason: "horizon", rounds: 16 });
	});
	it("stops when something the player set in motion is recorded, in every mode", async () => {
		for (const until of ["story", "hall-choice", "person-story"] as const) {
			const e = engine((view, round) => {
				if (!view.player) throw Error("Missing player view");
				view.player.notices = round >= 3 ? 1 : 0;
			});
			expect(
				await advanceTown(
					e.py,
					e.port,
					request({ until, actorId: "musa", maxRounds: 16 }),
				),
			).toEqual({ requestId: 1, reason: "player", rounds: 3 });
		}
	});
	it("stops at the actual invitation missed status, not its earlier accepted status", async () => {
		const e = engine((view, round) => {
			const musa = view.people.find((p) => p.id === "musa");
			if (!musa) throw Error("Missing Musa");
			musa.invitations = [
				{
					eventId: "class-1",
					title: "Class",
					startsAt: 500,
					status: round >= 4 ? "missed" : "accepted",
				},
			];
		});
		expect(
			await advanceTown(
				e.py,
				e.port,
				request({ until: "person-story", actorId: "musa" }),
			),
		).toEqual({ requestId: 1, reason: "person-story", rounds: 4 });
	});
	it("stops for the followed person's actual promise result before an unrelated story", async () => {
		const e = engine((view, round) => {
			const musa = view.people.find((p) => p.id === "musa");
			if (!musa) throw Error("Missing Musa");
			musa.commitments = [
				{
					label: "Harvest food for Sam",
					at: 1200,
					status: round >= 3 ? "kept" : "pending",
				},
			];
			if (round >= 1) story(view, "other", "ada");
		});
		expect(
			await advanceTown(
				e.py,
				e.port,
				request({ until: "person-story", actorId: "musa" }),
			),
		).toEqual({ requestId: 1, reason: "person-story", rounds: 3 });
	});
	it("stops at the first new story, before the next yield chunk", async () => {
		const e = engine((view, round) => {
			story(view, "old");
			if (round >= 3) story(view, "new");
		});
		const progress = vi.fn();
		expect(await advanceTown(e.py, e.port, request(), progress)).toEqual({
			requestId: 1,
			reason: "story",
			rounds: 3,
		});
		expect(e.rounds()).toBe(3);
		expect(progress).not.toHaveBeenCalled();
	});
	it("uses actual actor IDs rather than story text or another person's story", async () => {
		const e = engine((view, round) => {
			if (round >= 1) story(view, "other", "jo");
			if (round >= 5) story(view, "selected", "ada");
		});
		expect(
			(
				await advanceTown(
					e.py,
					e.port,
					request({ until: "person-story", actorId: "ada" }),
				)
			).rounds,
		).toBe(5);
	});
	it("stops immediately at an already available real hall choice", async () => {
		const e = engine((view) => {
			view.evenings = [
				{
					id: "evening",
					kind: "class",
					organiserId: "ada",
					title: "Class",
					startsAt: 1000,
					endsAt: 1100,
					stage: "planned",
					heard: 0,
					accepted: 0,
					attended: 0,
					participantIds: [],
					canOpenSlot: true,
				},
			];
		});
		expect(
			await advanceTown(e.py, e.port, request({ until: "hall-choice" })),
		).toEqual({ requestId: 1, reason: "hall-choice", rounds: 0 });
		expect(e.py.runPythonAsync).not.toHaveBeenCalled();
	});
	it("stops when an advertisement choice actually becomes available", async () => {
		const e = engine((view, round) => {
			view.evenings = [
				{
					id: "evening",
					kind: "class",
					organiserId: "ada",
					title: "Class",
					startsAt: 1000,
					endsAt: 1100,
					stage: "planned",
					heard: 0,
					accepted: 0,
					attended: 0,
					participantIds: [],
					canAdvertise: round >= 2,
				},
			];
		});
		expect(
			(await advanceTown(e.py, e.port, request({ until: "hall-choice" })))
				.rounds,
		).toBe(2);
	});
	it("stops at the explicit horizon without inventing a story, with actual progress", async () => {
		const e = engine();
		const progress: AdvanceProgress[] = [];
		expect(
			await advanceTown(e.py, e.port, request({ maxRounds: 17 }), (value) =>
				progress.push(value),
			),
		).toEqual({ requestId: 1, reason: "horizon", rounds: 17 });
		expect(progress.map((value) => value.rounds)).toEqual([8, 16]);
		expect(progress[1]).toMatchObject({
			day: 1,
			now: 720,
			requestId: 1,
			maxRounds: 17,
		});
	});
	it("keeps completed actual rounds on cooperative cancellation", async () => {
		const e = engine();
		let cancelled = false;
		const before = e.port.runtime.export();
		expect(
			await advanceTown(
				e.py,
				e.port,
				request(),
				() => {
					cancelled = true;
				},
				() => cancelled,
			),
		).toEqual({ requestId: 1, reason: "cancelled", rounds: 8 });
		expect(e.rounds()).toBe(8);
		expect(e.port.runtime.export()).not.toEqual(before);
	});
	it("retains a cancellation received while queued, without saving or advancing", async () => {
		const e = engine();
		const cancellation = new AdvanceCancellation();
		const cancelled = cancellation.begin(request());
		cancellation.cancel(1);
		expect(
			await advanceTown(e.py, e.port, request(), undefined, cancelled),
		).toEqual({ requestId: 1, reason: "cancelled", rounds: 0 });
		expect(e.py.runPythonAsync).not.toHaveBeenCalled();
	});
	it("ignores stale and unknown cancels and does not allow ID reuse", () => {
		const cancellation = new AdvanceCancellation();
		cancellation.cancel(2);
		const first = cancellation.begin(request());
		expect(() => cancellation.begin(request({ requestId: 2 }))).toThrow(
			"already in progress",
		);
		cancellation.cancel(9);
		expect(first()).toBe(false);
		cancellation.finish(1);
		expect(() => cancellation.begin(request())).toThrow("new request ID");
		const second = cancellation.begin(request({ requestId: 2 }));
		cancellation.cancel(1);
		expect(second()).toBe(false);
		cancellation.cancel(2);
		expect(second()).toBe(true);
	});
	it.each([0, -1, 673, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
		"rejects invalid horizon %s before world access",
		async (maxRounds) => {
			const e = engine();
			const view = vi.spyOn(e.port.runtime, "view");
			await expect(
				advanceTown(e.py, e.port, request({ maxRounds })),
			).rejects.toThrow("1 and 672");
			expect(view).not.toHaveBeenCalled();
			expect(e.py.runPythonAsync).not.toHaveBeenCalled();
		},
	);
	it.each([0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
		"rejects invalid request ID %s before world access",
		async (requestId) => {
			const e = engine();
			const view = vi.spyOn(e.port.runtime, "view");
			await expect(
				advanceTown(e.py, e.port, request({ requestId })),
			).rejects.toThrow("positive safe request ID");
			expect(view).not.toHaveBeenCalled();
			expect(e.py.runPythonAsync).not.toHaveBeenCalled();
		},
	);
	it("rejects an unknown selected person before Python or world mutation", async () => {
		const e = engine();
		const before = e.port.runtime.export();
		await expect(
			advanceTown(
				e.py,
				e.port,
				request({ until: "person-story", actorId: "invented" }),
			),
		).rejects.toThrow("existing person");
		expect(e.py.runPythonAsync).not.toHaveBeenCalled();
		expect(e.port.runtime.export()).toEqual(before);
	});
	it("restores the complete starting checkpoint after an engine failure", async () => {
		const e = engine();
		const before = e.port.runtime.export();
		e.fail(3);
		await expect(advanceTown(e.py, e.port, request())).rejects.toThrow(
			"Town advance failed. The starting checkpoint was restored: broken engine",
		);
		expect(e.rounds()).toBe(0);
		expect(e.port.runtime.export()).toEqual(before);
	});
});
