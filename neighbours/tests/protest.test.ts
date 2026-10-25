import { describe, expect, it } from "vitest";
import { botchedUnderProtest } from "../src/core/protest.ts";
import type { Runtime } from "../src/core/runtime.ts";
import { createRuntime, restoreRuntime } from "./historical-runtime.ts";

const WORK = new Set(["grow", "supply", "work", "repair"]);
const PLACES = ["garden", "quay", "hall", "market", "workshop"];

describe("work under protest (Phase C host physics)", () => {
	it("urged work can be botched: no effect, a failed finish in HF, and trust lost through HF's own outcome path", () => {
		const r = createRuntime(42, 208) as Runtime;
		for (let i = 0; i < 4; i++) r.step();
		let seen: { id: string; event: number; action: string } | undefined;
		let trustBefore = 0;
		for (let i = 0; i < 800 && !seen; i++) {
			if (!r.s.player?.job && i % 40 === 0)
				try {
					r.intervene({
						kind: "player-move",
						placeId: PLACES[(i / 40) % PLACES.length] as string,
					});
				} catch {}
			r.step();
			if (!r.s.player?.job)
				for (const who of r.view().player?.present ?? []) {
					const pick = r
						.predictAnswers(who.id)
						.offers.find(
							(o) =>
								WORK.has(o.affordanceId) &&
								o.ask.verdict !== "assented" &&
								o.urge.verdict === "complied",
						);
					if (!pick) continue;
					r.intervene({
						kind: "player-speak",
						actorId: who.id,
						affordanceId: pick.affordanceId,
						mode: "urge",
					});
					break;
				}
			for (const res of r.s.people)
				if (
					res.job &&
					res.job.end <= r.s.now + 15 &&
					botchedUnderProtest(r.s, res, res.job)
				) {
					seen = {
						id: res.person.id,
						event: res.job.event,
						action: res.job.offer.action,
					};
					trustBefore =
						res.person.will.voices.find((v) => v.voiceId === "player")?.trust ??
						0;
					break;
				}
		}
		if (!seen) throw Error("No botched protest job in the window");
		// The twin is the same town with the protest lifted from this one job, so the job is done properly.
		const twin = restoreRuntime(r.export()) as Runtime;
		const act = twin.actor(seen.id).person.activity;
		if (act) act.protest = false;
		r.step();
		twin.step();
		const line = r.s.events.find(
			(e) =>
				e.causes.includes(seen?.event ?? -1) && e.kind === "attempt-failed",
		);
		expect(line?.text).toMatch(
			/The work was done under protest and went wrong/,
		);
		const voice = r
			.actor(seen.id)
			.person.will.voices.find((v) => v.voiceId === "player");
		const lost = voice?.history.findLast((h) => h.reason === "went-badly");
		expect(voice?.trust ?? 1).toBeLessThan(trustBefore);
		expect(lost?.delta ?? 0).toBeLessThan(0);
		// No world effect: the twin's proper job produced, paid or repaired; the botched one did not.
		const gain =
			twin.s.produced -
			r.s.produced +
			(twin.actor(seen.id).wealth - r.actor(seen.id).wealth) +
			(twin.s.hall - r.s.hall);
		expect(gain).toBeGreaterThan(0);
	}, 120_000);
});
