import { expect, it } from "vitest";
import { playerRound } from "../src/core/player.ts";
import type { Runtime } from "../src/core/runtime.ts";
import { createRuntime, restoreRuntime } from "./historical-runtime.ts";

it("direct help starts existing paid work and records HF receipt only after completion", () => {
	const r = createRuntime(42, 208) as Runtime;
	const offer = r.view().player?.helpOffers?.find((o) => !o.blocked);
	expect(offer).toBeDefined();
	if (!offer) throw Error("No help offer");
	r.intervene({ kind: "player-help", actorId: offer.toId });
	expect(r.s.player?.requests).toHaveLength(0);
	expect(r.s.player?.pledges[0]?.hfReported).toBeUndefined();
	const restored = restoreRuntime(r.export()) as Runtime;
	while (r.view().player?.job) {
		r.step();
		restored.step();
	}
	expect(restored.export()).toEqual(r.export());
	expect(r.s.player?.pledges[0]).toMatchObject({
		direct: true,
		status: "kept",
		hfReported: true,
	});
	expect(r.view().player?.pledges[0]?.remembered).toBe(true);
}, 60000);

it("offers Ada direct work at the hall without an inspection request", () => {
	const r = createRuntime(42, 208) as Runtime;
	r.intervene({ kind: "player-move", placeId: "hall" });
	for (let i = 0; i < 4; i++) r.step();
	const offer = r.view().player?.helpOffers?.find((o) => o.toId === "ada");
	expect(offer).toBeDefined();
	r.intervene({ kind: "player-help", actorId: "ada" });
	expect(r.s.player?.job).toMatchObject({
		work: "cover-shift",
		forId: "ada",
		endsAt: offer?.endsAt,
	});
	expect(r.s.player?.requests).toHaveLength(0);
}, 60000);

it("rejects malformed, unavailable and remote help before mutation", () => {
	const r = createRuntime(42, 208) as Runtime;
	for (const input of [
		{ kind: "player-help", actorId: "ada" },
		{ kind: "player-help", actorId: "lea", work: "cover-shift" },
		{ kind: "player-help" },
	] as const) {
		const before = r.export();
		expect(() => r.intervene(input)).toThrow();
		expect(r.export()).toEqual(before);
	}
	const offer = r.view().player?.helpOffers?.find((o) => !o.blocked);
	if (!offer) throw Error("No offer");
	r.intervene({ kind: "player-help", actorId: offer.toId });
	const before = r.export();
	expect(() =>
		r.intervene({ kind: "player-help", actorId: offer.toId }),
	).toThrow();
	expect(r.export()).toEqual(before);
}, 60000);

it("rejects malformed restored direct markers", () => {
	const r = createRuntime(42, 208) as Runtime;
	const offer = r.view().player?.helpOffers?.find((o) => !o.blocked);
	if (!offer) throw Error("No offer");
	r.intervene({ kind: "player-help", actorId: offer.toId });
	for (const patch of [
		{ direct: false },
		{ work: "carry-meals" },
		{ status: "offered" },
		{ requestId: 999999 },
	]) {
		const save = structuredClone(r.export());
		const pledge = save.player?.pledges[0];
		if (!pledge) throw Error("Missing pledge");
		Object.assign(pledge, patch);
		expect(() => restoreRuntime(save)).toThrow();
	}
});

it("pays exactly two coins for exactly one hour, and respects shift capacity", () => {
	const r = createRuntime(42, 208) as Runtime;
	const offer = r.view().player?.helpOffers?.find((o) => !o.blocked);
	if (!offer) throw Error("No offer");
	const target = r.actor(offer.toId);
	const wageBefore = target.wealth;
	const startsBefore = target.paidWork?.day === 0 ? target.paidWork.starts : 0;
	r.intervene({ kind: "player-help", actorId: offer.toId });
	const job = r.s.player?.job;
	if (!job) throw Error("No job");
	expect(job.endsAt - job.arriveAt).toBe(60);
	expect(target.wealth).toBe(wageBefore);
	expect(target.paidWork?.starts).toBe(startsBefore + 1);
	const minutesBefore = target.paidWork?.minutes ?? 0;
	r.s.now = job.endsAt;
	playerRound(r);
	expect(target.wealth).toBe(wageBefore + 2);
	expect(target.paidWork?.minutes).toBe(minutesBefore + 60);
	expect(r.s.player?.work.starts).toBe(1);
	const capacity = createRuntime(42, 208) as Runtime;
	capacity.actor(offer.toId).paidWork = {
		day: 0,
		starts: 2,
		minutes: 120,
		totalMinutes: 120,
	};
	expect(
		capacity.view().player?.helpOffers?.some((o) => o.toId === offer.toId),
	).toBe(false);
	const before = capacity.export();
	expect(() =>
		capacity.intervene({ kind: "player-help", actorId: offer.toId }),
	).toThrow(/no paid shift/);
	expect(capacity.export()).toEqual(before);
});
