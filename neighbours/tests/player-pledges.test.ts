import { describe, expect, it } from "vitest";
import { speechRead } from "../src/core/impression.ts";
import { createRuntime, restoreRuntime, stateHash } from "../src/core/index.ts";
import { advanceGoals, pledgeDeadlines } from "../src/core/player.ts";
import type { Runtime } from "../src/core/runtime.ts";
import type { Save } from "../src/core/state.ts";
import { offeredWork } from "../src/ui/SpeakPanel.tsx";

const T = 60_000;
const town = () => createRuntime(42, 208) as Runtime;
const hash = (r: Runtime) => stateHash(r.export());
const trust = (r: Runtime, id: string) =>
	r.actor(id).person.will.voices.find((v) => v.voiceId === "player")?.trust;
/** Walk the player to the flooded hall; at 585 Ada and Noor are there. */
function atHall(): Runtime {
	const r = town();
	for (let i = 0; i < 4; i++) r.step();
	r.intervene({ kind: "player-move", placeId: "hall" });
	while (r.view().player?.job) r.step();
	return r;
}

describe("player pledges (Phase C)", () => {
	it(
		"a promise they do not take up binds nothing and is released, with the hour free again",
		() => {
			const r = atHall();
			const verdict = r
				.predictAnswers("noor")
				.offers.find((o) => o.affordanceId === "repair")?.promise.verdict;
			expect(["deferred", "modified"]).toContain(verdict);
			r.intervene({
				kind: "player-speak",
				actorId: "noor",
				affordanceId: "repair",
				mode: "promise",
				pledge: { work: "carry-meals" },
			});
			const pledge = () => r.view().player?.pledges[0];
			expect(pledge()?.status).toBe("offered");
			expect(pledge()?.canStart).toBeUndefined();
			expect(() =>
				r.intervene({ kind: "player-work", pledgeId: pledge()?.id }),
			).toThrow(/not open/);
			for (let i = 0; i < 200 && pledge()?.status === "offered"; i++) r.step();
			const request = r.s.player?.requests.find((q) => q.pledgeId);
			const followed =
				request?.decision?.chosenAffordanceId === request?.affordanceId;
			expect(pledge()?.status).toBe(followed ? "open" : "released");
			if (!followed) {
				expect(r.s.player?.pledges[0]?.hfReported).toBeUndefined();
				expect(
					r.s.player?.log.some((e) => e.kind === "player-pledge-released"),
				).toBe(true);
			}
			// Exact restore with the new statuses.
			expect(hash(restoreRuntime(r.export()) as Runtime)).toBe(hash(r));
		},
		T,
	);

	it(
		"asking something else releases an offered promise",
		() => {
			const r = atHall();
			r.intervene({
				kind: "player-speak",
				actorId: "noor",
				affordanceId: "repair",
				mode: "promise",
				pledge: { work: "carry-meals" },
			});
			expect(r.view().player?.pledges[0]?.status).toBe("offered");
			r.intervene({
				kind: "player-speak",
				actorId: "noor",
				affordanceId: "talk",
				mode: "ask",
			});
			expect(r.view().player?.pledges[0]?.status).toBe("released");
			expect(r.view().player?.journal.at(-1)?.text).toBeDefined();
		},
		T,
	);

	it(
		"the player chooses the hour's deadline from the offered slots",
		() => {
			const r = atHall();
			const slots = r.view().player?.pledgeDeadlines ?? [];
			expect(slots).toEqual(pledgeDeadlines(r.s.now));
			expect(slots.every((t) => t >= r.s.now + 60)).toBe(true);
			const by = slots[0] as number;
			expect(() =>
				r.intervene({
					kind: "player-speak",
					actorId: "ada",
					affordanceId: "open-section",
					mode: "promise",
					pledge: { work: "help-repair", by: by + 30 },
				}),
			).toThrow(/Choose a time/);
			r.intervene({
				kind: "player-speak",
				actorId: "ada",
				affordanceId: "open-section",
				mode: "promise",
				pledge: { work: "help-repair", by },
			});
			const pledge = r.view().player?.pledges[0];
			expect(pledge?.status).toBe("open");
			expect(pledge?.dueBy).toBe(by);
			expect(pledge?.work).toBe("help-repair");
			expect(hash(restoreRuntime(r.export()) as Runtime)).toBe(hash(r));
		},
		T,
	);

	it(
		"a broken promise visibly lowers trust",
		() => {
			const r = atHall();
			r.intervene({
				kind: "player-speak",
				actorId: "ada",
				affordanceId: "open-section",
				mode: "promise",
				pledge: { work: "carry-meals" },
			});
			while ((r.view().player?.pledges[0]?.status ?? "open") === "open")
				r.step();
			const voice = r
				.actor("ada")
				.person.will.voices.find((v) => v.voiceId === "player");
			const broken = voice?.history.findLast(
				(h) => h.reason === "pledge-broken",
			);
			expect(broken?.delta ?? 0).toBeLessThan(0);
			const line =
				r.s.player?.log.findLast((e) => e.kind === "player-pledge-lapsed")
					?.text ?? "";
			expect(line).toMatch(/Ada will trust your word less/);
			// The read before speaking says so too.
			expect(speechRead(r.s, r.actor("ada"), [], [])).toContain(
				"Still sore about a promise you broke",
			);
		},
		T,
	);

	it(
		"keep your word completes for a promise made before the objection goal",
		() => {
			const r = atHall();
			r.intervene({
				kind: "player-speak",
				actorId: "ada",
				affordanceId: "open-section",
				mode: "promise",
				pledge: { work: "carry-meals" },
			});
			r.step();
			r.intervene({
				kind: "player-work",
				pledgeId: r.view().player?.pledges[0]?.id,
			});
			while (r.view().player?.job) r.step();
			const save = r.export() as Save;
			const p = save.player;
			if (!p) throw Error("Player missing");
			const pledge = p.pledges[0];
			if (!pledge?.resolvedEvent) throw Error("Pledge not kept");
			const keptAt = p.log.find((e) => e.id === pledge.resolvedEvent)?.at ?? 0;
			// The objection goal was reached after the promise was made but before it was kept: the reviewer's case.
			p.goals = [
				{ id: "arrive", doneAt: pledge.madeAt - 15, eventIds: [1] },
				{ id: "answer", doneAt: pledge.madeAt, eventIds: [1] },
				{ id: "objection", doneAt: pledge.madeAt + 1, eventIds: [1] },
			];
			expect(keptAt).toBeGreaterThan(pledge.madeAt + 1);
			advanceGoals(save);
			expect(p.goals.map((g) => g.id)).toContain("pledge");
		},
		T,
	);

	it(
		"an urge is an insisted ask: it can be given in to under protest, and it costs trust",
		() => {
			const r = town();
			for (let i = 0; i < 4; i++) r.step();
			const lea = 0.8;
			let urged = 0;
			let complied = 0;
			let last = -999;
			for (let i = 0; i < 400 && urged < 5; i++) {
				const job = r.actor("lea").job;
				const where = job?.offer.placeId ?? r.actor("lea").place;
				// Follow Lea: only people at the same place can hear you.
				if (!r.s.player?.job && (r.s.player?.place ?? "homes") !== where)
					try {
						r.intervene({ kind: "player-move", placeId: where });
					} catch {}
				r.step();
				if (r.s.now - last < 60) continue;
				if (!r.view().player?.present.some((p) => p.id === "lea")) continue;
				const pick = r
					.predictAnswers("lea")
					.offers.find((o) => o.ask.verdict !== "assented");
				if (!pick) continue;
				r.intervene({
					kind: "player-speak",
					actorId: "lea",
					affordanceId: pick.affordanceId,
					mode: "urge",
				});
				last = r.s.now;
				urged++;
				if (r.s.player?.requests.at(-1)?.answer.verdict === "complied")
					complied++;
			}
			for (let k = 0; k < 40; k++) r.step();
			expect(urged).toBeGreaterThan(2);
			expect(complied).toBeGreaterThan(0);
			expect(trust(r, "lea") ?? 1).toBeLessThan(lea);
			const pushed = r
				.actor("lea")
				.person.will.voices.find((v) => v.voiceId === "player")
				?.history.filter((h) => h.delta < 0);
			// Through HF's own will paths ('pushed', 'worn', or a bad outcome under protest), not a host counter.
			expect(pushed?.length ?? 0).toBeGreaterThan(0);
		},
		T,
	);

	it(
		"an hour propping and airing the hall timber dries it beyond the weather alone",
		() => {
			const worked = town();
			for (let i = 0; i < 4; i++) worked.step();
			const twin = restoreRuntime(worked.export()) as Runtime;
			worked.intervene({ kind: "player-work", work: "dry-timber" });
			while (worked.view().player?.job) {
				worked.step();
				twin.step();
			}
			const damp = (r: Runtime) => r.s.timber?.damp ?? Number.NaN;
			expect(damp(worked)).toBeLessThan(damp(twin) - 0.09);
			expect(worked.view().player?.journal.at(-1)?.text).toMatch(
				/propped and aired the hall timber/,
			);
			// The drawer offers airing only while there is damp timber left; once the hall reopens it is gone.
			expect(worked.view().player?.canAirTimber).toBe(true);
			const ids = (canAirTimber: boolean) =>
				offeredWork({ canAirTimber }).map((w) => w.id);
			expect(ids(true)).toContain("dry-timber");
			expect(ids(false)).not.toContain("dry-timber");
			expect(ids(false)).toContain("help-repair");
			const reopened = restoreRuntime(worked.export()) as Runtime;
			reopened.s.hallSafe = true;
			expect(reopened.view().player?.canAirTimber).toBe(false);
			expect(() =>
				reopened.intervene({ kind: "player-work", work: "dry-timber" }),
			).toThrow(/no damp hall timber/);
			// A legacy town without timber physics has nothing to air.
			const legacy = town().export() as Save;
			delete legacy.timber;
			const old = restoreRuntime(legacy) as Runtime;
			for (let i = 0; i < 4; i++) old.step();
			expect(() =>
				old.intervene({ kind: "player-work", work: "dry-timber" }),
			).toThrow(/no damp hall timber/);
			expect(old.view().player?.canAirTimber).toBe(false);
		},
		T,
	);
});
