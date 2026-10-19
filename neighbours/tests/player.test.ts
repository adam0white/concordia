import { describe, expect, it } from "vitest";
import { presentAt } from "../src/core/encounters.ts";
import { createRuntime, restoreRuntime, stateHash } from "../src/core/index.ts";
import type { Runtime } from "../src/core/runtime.ts";
import type { Save } from "../src/core/state.ts";

const T = 60_000;
const town = () => createRuntime(42, 208) as Runtime;
const clone = (r: Runtime) => restoreRuntime(r.export()) as Runtime;
const hash = (r: Runtime) => stateHash(r.export());
const voice = (r: Runtime, id: string) =>
	r.actor(id).person.will.voices?.find((v) => v.voiceId === "player");
/** Walk the player to the flooded hall; at 585 Ada and Noor are there. */
function atHall(): Runtime {
	const r = town();
	for (let i = 0; i < 4; i++) r.step();
	r.intervene({ kind: "player-move", placeId: "hall" });
	while (r.view().player?.job) r.step();
	return r;
}
function promiseAda(r: Runtime) {
	r.intervene({
		kind: "player-speak",
		actorId: "ada",
		affordanceId: "open-section",
		mode: "promise",
		pledge: { work: "carry-meals" },
	});
}

describe("player as a neighbour", () => {
	it(
		"old saves without player fields load and continue unchanged",
		() => {
			const r = town();
			for (let i = 0; i < 6; i++) r.step();
			const save = r.export() as Save;
			expect("player" in save).toBe(false);
			const restored = restoreRuntime(save) as Runtime;
			for (let i = 0; i < 6; i++) {
				r.step();
				restored.step();
			}
			expect(hash(restored)).toBe(hash(r));
			expect("player" in (restored.export() as Save)).toBe(false);
			expect(r.view().player?.active).toBe(false);
		},
		T,
	);

	it(
		"speech telegraphs are pure and out-of-earshot speech is rejected",
		() => {
			const fresh = town();
			for (let i = 0; i < 4; i++) fresh.step();
			const freshHash = hash(fresh);
			expect(() => fresh.predictSpeech("ada")).toThrow(/not here/);
			expect(() =>
				fresh.intervene({
					kind: "player-speak",
					actorId: "ada",
					affordanceId: "rest",
					mode: "ask",
				}),
			).toThrow(/not here/);
			expect(hash(fresh)).toBe(freshHash);
			expect("player" in (fresh.export() as Save)).toBe(false);

			const r = atHall();
			const before = hash(r);
			const prediction = r.predictSpeech("ada");
			expect(prediction.offers.length).toBeGreaterThan(0);
			// The player sees offers and a worded read, never a verdict or an answer line.
			expect(prediction.read.length).toBeGreaterThan(0);
			expect(JSON.stringify(prediction)).not.toMatch(
				/"(verdict|says|likelihood|counterOffer|insisted|ask|urge|promise)"/,
			);
			for (const offer of r.predictAnswers("ada").offers)
				for (const mode of ["ask", "urge", "promise"] as const)
					expect(offer[mode].says.length).toBeGreaterThan(0);
			expect(hash(r)).toBe(before);
			const sam = r.view().people.find((p) => p.id === "sam");
			expect(r.view().player?.present.some((p) => p.id === "sam")).toBe(false);
			expect(sam).toBeDefined();
			expect(() =>
				r.intervene({
					kind: "player-speak",
					actorId: "sam",
					affordanceId: "rest",
					mode: "ask",
				}),
			).toThrow(/not here/);
			expect(() =>
				r.intervene({
					kind: "player-speak",
					actorId: "ada",
					affordanceId: "not-an-offer",
					mode: "ask",
				}),
			).toThrow();
			expect(hash(r)).toBe(before);
		},
		T,
	);

	it(
		"an assented request changes the person's next decision and links its events",
		() => {
			const r = atHall();
			const base = clone(r);
			const offer = r
				.predictAnswers("ada")
				.offers.find(
					(o) => o.ask.verdict === "assented" && o.affordanceId !== "rest",
				);
			if (!offer) throw Error("No assented offer at the hall");
			r.intervene({
				kind: "player-speak",
				actorId: "ada",
				affordanceId: offer.affordanceId,
				mode: "ask",
			});
			const noticesBefore = r.view().player?.notices ?? 0;
			r.step();
			base.step();
			expect(r.actor("ada").job?.offer.id).toBe(offer.affordanceId);
			expect(base.actor("ada").job?.offer.id).not.toBe(offer.affordanceId);
			const request = r.view().player?.requests.at(-1);
			expect(request?.status).toBe("started");
			expect(request?.decision?.chosenAffordanceId).toBe(offer.affordanceId);
			expect(r.view().player?.notices ?? 0).toBeGreaterThan(noticesBefore);
			const state = r.s.player;
			const stored = state?.requests.at(-1);
			const ids = new Set(state?.log.map((e) => e.id));
			for (const id of [
				stored?.id,
				stored?.answerEvent,
				stored?.decision?.event,
				stored?.startedEvent,
			])
				expect(ids.has(id as number)).toBe(true);
		},
		T,
	);

	it(
		"a refusal is booked against the player's voice and holds no suggestion",
		() => {
			const r = atHall();
			const state = r.s.player;
			if (!state) throw Error("Player not active");
			const home = state.place;
			// Scan forward until anyone awake would refuse something; the telegraph is pure.
			let found: { placeId: string; actorId: string; affordanceId: string } =
				undefined as never;
			for (let round = 0; round < 160 && !found; round++) {
				r.step();
				for (const place of r.view().places) {
					for (const resident of r.s.people) {
						if (
							resident.policy !== "hf" ||
							!presentAt(resident, place.id, r.s.now)
						)
							continue;
						state.place = place.id;
						const offer = r
							.predictAnswers(resident.person.id)
							.offers.find((o) => o.urge.verdict === "refused");
						state.place = home;
						if (offer) {
							found = {
								placeId: place.id,
								actorId: resident.person.id,
								affordanceId: offer.affordanceId,
							};
							break;
						}
					}
					if (found) break;
				}
			}
			expect(found).toBeDefined();
			// Construct the co-located situation through a validated save.
			const save = r.export() as Save;
			if (!save.player) throw Error("Player missing from save");
			save.player.place = found.placeId;
			const there = restoreRuntime(save) as Runtime;
			const booked = (x: Runtime) =>
				(x.actor(found.actorId).person.chronicleDay?.verdicts ?? [])
					.filter((v) => v.voiceId === "player" && v.verdict === "refused")
					.reduce((n, v) => n + v.count, 0);
			const before = booked(there);
			there.intervene({
				kind: "player-speak",
				actorId: found.actorId,
				affordanceId: found.affordanceId,
				mode: "urge",
			});
			const request = there.view().player?.requests.at(-1);
			expect(request?.verdict).toBe("refused");
			expect(request?.status).toBe("refused");
			expect(request?.pledgeId).toBeUndefined();
			expect(booked(there)).toBe(before + 1);
			// A refusal holds nothing for the next decision.
			const held = there.s.player?.requests.filter((q) => q.status === "held");
			expect(held?.some((q) => q.targetId === found.actorId)).toBe(false);
			expect(
				there.view().player?.journal.at(-1)?.text.endsWith("It was a refusal."),
			).toBe(true);
		},
		T,
	);

	it(
		"a kept pledge does physical work and raises trust through HF",
		() => {
			const r = atHall();
			const produced = r.s.produced;
			promiseAda(r);
			const pledge = r.view().player?.pledges[0];
			expect(pledge?.status).toBe("open");
			r.step();
			r.intervene({ kind: "player-work", pledgeId: pledge?.id });
			expect(() =>
				r.intervene({ kind: "player-move", placeId: "quay" }),
			).toThrow();
			while (r.view().player?.job) r.step();
			const kept = voice(r, "ada")?.history?.at(-1);
			expect(kept?.reason).toBe("promise-kept");
			expect(kept?.action).toBe("pledge:carry-meals");
			expect(kept?.delta ?? 0).toBeGreaterThan(0);
			expect(r.view().player?.pledges[0]?.status).toBe("kept");
			expect(r.s.produced).toBeGreaterThanOrEqual(produced + 5);
			expect(r.view().player?.journal.at(-1)?.text).toMatch(
				/5 meals reached the market/,
			);
			expect(
				r.view().diagnostics.filter((d) => d.severity === "error"),
			).toEqual([]);
			expect(clone(r) && hash(clone(r))).toBe(hash(r));
		},
		T,
	);

	it(
		"a lapsed pledge is reported neutrally and lowers trust through HF",
		() => {
			const r = atHall();
			promiseAda(r);
			const pledge = r.view().player?.pledges[0];
			while ((r.view().player?.pledges[0]?.status ?? "open") === "open")
				r.step();
			expect(r.s.now).toBeGreaterThanOrEqual(pledge?.dueBy ?? 0);
			expect(r.view().player?.pledges[0]?.status).toBe("lapsed");
			const lapsed = voice(r, "ada")?.history?.at(-1);
			expect(lapsed?.reason).toBe("promise-broken");
			expect(lapsed?.delta ?? 0).toBeLessThan(0);
			const line = r.view().player?.journal.at(-1)?.text ?? "";
			expect(line).toMatch(/passed with no hour recorded/);
			expect(line).not.toMatch(/fault|blame|failed you|let .* down/i);
		},
		T,
	);

	it(
		"save, restore and replay are exact with player inputs",
		() => {
			const run = (split: boolean) => {
				let r = town();
				for (let i = 0; i < 4; i++) r.step();
				r.intervene({ kind: "player-move", placeId: "hall" });
				for (let i = 0; i < 3; i++) r.step();
				if (split) r = clone(r);
				promiseAda(r);
				r.step();
				if (split) r = clone(r);
				r.intervene({
					kind: "player-work",
					pledgeId: r.view().player?.pledges[0]?.id,
				});
				for (let i = 0; i < 8; i++) r.step();
				return r;
			};
			const whole = run(false);
			const split = run(true);
			expect(hash(split)).toBe(hash(whole));
			expect(JSON.stringify(split.view().player)).toBe(
				JSON.stringify(whole.view().player),
			);
			expect(hash(run(false))).toBe(hash(whole));
		},
		T,
	);

	it(
		"rejects malformed player state without changing the town",
		() => {
			const r = atHall();
			promiseAda(r);
			const good = r.export() as Save;
			const cases: ((s: Save) => void)[] = [
				(s) => {
					(s.player as unknown as { version: number }).version = 3;
				},
				(s) => {
					(s.player as unknown as { place: string }).place = "moon";
				},
				(s) => {
					const q = s.player?.requests[0];
					if (q) (q as unknown as { status: string }).status = "granted";
				},
				(s) => {
					const p = s.player?.pledges[0];
					if (p) p.dueBy += 60;
				},
				(s) => {
					(s.player as unknown as { extra: number }).extra = 1;
				},
			];
			for (const change of cases) {
				const bad = structuredClone(good);
				change(bad);
				expect(() => restoreRuntime(bad)).toThrow();
			}
			expect(stateHash(r.export())).toBe(stateHash(good));
		},
		T,
	);

	it(
		"keeps a recorded journal and reveals goals one at a time",
		() => {
			const r = atHall();
			const goals = () => r.view().player?.goals ?? [];
			expect(goals().map((g) => [g.id, g.status])).toEqual([
				["arrive", "done"],
				["answer", "current"],
			]);
			promiseAda(r);
			expect(goals().map((g) => [g.id, g.status])).toEqual([
				["arrive", "done"],
				["answer", "done"],
				["objection", "current"],
			]);
			const player = r.view().player;
			const ids = new Set(r.s.player?.log.map((e) => e.id));
			expect(player?.journal[0]?.text).toMatch(/after the flood/);
			for (const entry of player?.journal ?? []) {
				expect(entry.label).toBe("recorded");
				expect(entry.sourceEventIds.length).toBeGreaterThan(0);
				for (const id of entry.sourceEventIds) expect(ids.has(id)).toBe(true);
			}
		},
		T,
	);
	it(
		"a counter-offer can be taken up and resolves the objection goal",
		() => {
			const r = atHall();
			const ask = (actorId: string, affordanceId: string, accept = false) =>
				r.intervene({
					kind: "player-speak",
					actorId,
					affordanceId,
					mode: "ask",
					...(accept ? { acceptCounter: true } : {}),
				});
			// No counter-offer yet: accepting one is rejected without effect.
			const before = hash(r);
			expect(() => ask("noor", "work", true)).toThrow(/no counter-offer/);
			expect(hash(r)).toBe(before);
			ask("noor", "supply");
			const first = r.view().player?.requests.at(-1);
			expect(first?.verdict).toBe("modified");
			const counter = first?.counterOffer?.affordanceId;
			expect(counter).toBe(r.actor("noor").job?.offer.id);
			expect(r.view().player?.journal.at(-1)?.text).toMatch(/They offered to /);
			// Accepting "carry on with what I am doing" is the one way to name the current activity.
			ask("noor", counter as string, true);
			const second = r.view().player?.requests.at(-1);
			expect(["assented", "complied"]).toContain(second?.verdict);
			expect(r.s.player?.requests.at(-1)?.accepts).toBe(first?.id);
			expect(
				r.view().player?.requests.find((q) => q.id === first?.id)?.status,
			).toBe("replaced");
			const goals = r.view().player?.goals ?? [];
			expect(goals.find((g) => g.id === "objection")?.status).toBe("done");
			expect(goals.at(-1)).toMatchObject({ id: "pledge", status: "current" });
			r.step();
			expect(["continued", "decided", "started"]).toContain(
				r.view().player?.requests.at(-1)?.status,
			);
		},
		T,
	);

	it(
		"accepting an \u201cafter I \u2026\u201d counter-offer waits for their own next decision",
		() => {
			const r = atHall();
			r.intervene({
				kind: "player-speak",
				actorId: "ada",
				affordanceId: "rest",
				mode: "ask",
			});
			const first = r.view().player?.requests.at(-1);
			expect(first?.verdict).toBe("deferred");
			expect(first?.counterOffer?.affordanceId).toBe("rest");
			const job = r.actor("ada").job?.event;
			r.intervene({
				kind: "player-speak",
				actorId: "ada",
				affordanceId: "rest",
				mode: "ask",
				acceptCounter: true,
			});
			const stored = r.s.player?.requests.at(-1);
			expect(stored?.waits).toBe(true);
			// Not brought forward: Ada's current activity is not interrupted for it.
			expect(r.actor("ada").job?.event).toBe(job);
			expect(r.actor("ada").person.activity?.interrupt).toBeUndefined();
		},
		T,
	);
});
