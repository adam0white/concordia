import { decide } from "@adam0white/human-framework";
import { expect, it } from "vitest";
import {
	assistanceOffers,
	observeAssistance,
	parseInspectionProposal,
} from "../src/core/assistance.ts";
import { HF_SOURCE } from "../src/core/hf-version.ts";
import { Runtime } from "../src/core/runtime.ts";
import type { Save } from "../src/core/state.ts";
import {
	createRuntime,
	restoreRuntime,
	stateHash,
} from "./historical-runtime.ts";

const proposal = {
	schema: "neighbours-gm-proposal@1",
	kind: "inspection-request",
	target: "hall-annex",
	cue: "dry-sound",
	windowMinutes: 240,
} as const;
function setup(cue: string = "dry-sound", actorId = "lea") {
	const r = new Runtime(createRuntime(42, 8).export() as Save);
	r.s.hall = 12;
	r.s.hallSafe = true;
	r.intervene({
		kind: "request-inspection",
		actorId,
		proposal: { ...proposal, cue },
	});
	return r;
}
function visit(r: Runtime) {
	for (let n = 0; n < 12; n++) {
		const ids = r.prepareRound();
		if (r.s.assistance?.visit) return;
		for (const id of ids) r.apply(id, r.actor(id).job?.offer.id ?? "rest");
	}
}
function round(r: Runtime, selected?: string) {
	for (const id of r.s.pending.length ? [...r.s.pending] : r.prepareRound())
		r.apply(
			id,
			id === "lea" &&
				selected &&
				r.getChoices(id).some((o) => o.id === selected)
				? selected
				: (r.actor(id).job?.offer.id ?? "rest"),
		);
}
it("strictly validates bounded GM proposals before changing the world", () => {
	expect(parseInspectionProposal(proposal)).toEqual(proposal);
	for (const invalid of [
		{ ...proposal, extra: true },
		{ ...proposal, windowMinutes: 10 },
		{ ...proposal, cue: "magic" },
		{ ...proposal, target: "school" },
	])
		expect(() => parseInspectionProposal(invalid)).toThrow();
	const r = new Runtime(createRuntime(42, 8).export() as Save);
	const before = stateHash(r.export());
	expect(() =>
		r.intervene({ kind: "request-inspection", actorId: "lea", proposal }),
	).toThrow();
	expect(stateHash(r.export())).toBe(before);
});
it("a relayed request changes neither methods nor physical capacity and allows no second request", () => {
	const r = setup();
	expect(r.s.places.find((p) => p.id === "hall")?.capacity).toBe(10);
	expect(r.view().assistance?.received).toBe(true);
	expect(r.s.assistance?.result).toBeUndefined();
	expect(() =>
		r.intervene({ kind: "request-inspection", actorId: "ada", proposal }),
	).toThrow();
	const b = restoreRuntime(r.export());
	expect(b.export()).toEqual(r.export());
});
it("requires received request, actual travel and an inspection before opening four extra places", () => {
	const r = setup();
	expect(assistanceOffers(r.s, r.actor("ada"))).toEqual([]);
	expect(assistanceOffers(r.s, r.actor("lea")).map((o) => o.id)).toEqual([
		"annex-visit",
	]);
	round(r, "annex-visit");
	expect(r.s.places.find((p) => p.id === "hall")?.capacity).toBe(10);
	visit(r);
	expect(r.s.assistance?.visit).toBeDefined();
	observeAssistance(r.s, r.actor("lea"));
	const offers = assistanceOffers(r.s, r.actor("lea"));
	const record = decide(structuredClone(r.actor("lea").person), offers);
	expect(record.chosenAffordanceId).toBe("annex-open-section");
	const ablated = structuredClone(r.actor("lea").person);
	if (ablated.methods) ablated.methods.rules = [];
	expect(decide(ablated, offers).chosenAffordanceId).toBe(
		"annex-ask-inspector",
	);
	round(r, "annex-open-section");
	for (let n = 0; n < 12 && !r.s.assistance?.result; n++) round(r);
	expect(r.s.assistance?.opened).toBe(true);
	expect(r.s.places.find((p) => p.id === "hall")?.capacity).toBe(14);
	const restored = restoreRuntime(r.export());
	restored.step();
	r.step();
	expect(restored.export()).toEqual(r.export());
	const forged = r.export() as Save;
	if (forged.assistance) forged.assistance.proposal.cue = "wet-sound";
	expect(() => restoreRuntime(forged)).toThrow();
});
it.each(["wet-sound", "unsupported"])(
	"%s provides no automatic opening",
	(cue) => {
		const r = setup(cue);
		round(r, "annex-visit");
		visit(r);
		observeAssistance(r.s, r.actor("lea"));
		const chosen = decide(
			structuredClone(r.actor("lea").person),
			assistanceOffers(r.s, r.actor("lea")),
		).chosenAffordanceId;
		expect(chosen).toBe(
			cue === "wet-sound" ? "annex-keep-closed" : "annex-ask-inspector",
		);
		if (chosen) round(r, chosen);
		for (let n = 0; n < 12 && !r.s.assistance?.result; n++) round(r);
		expect(r.s.assistance?.result).toBeDefined();
		expect(r.s.assistance?.opened).toBe(false);
		expect(r.s.hallSafe).toBe(true);
		expect(r.s.places.find((p) => p.id === "hall")?.capacity).toBe(10);
		expect(restoreRuntime(r.export()).export()).toEqual(r.export());
	},
);
it("does not give an unheard or expired request legal assistance offers", () => {
	const r = new Runtime(createRuntime(42, 8).export() as Save);
	r.s.hall = 12;
	r.s.hallSafe = true;
	const lea = r.actor("lea");
	lea.person.body.asleep = true;
	const before = stateHash(r.export());
	expect(() =>
		r.intervene({ kind: "request-inspection", actorId: "lea", proposal }),
	).toThrow();
	expect(stateHash(r.export())).toBe(before);
	expect(
		r.view().people.find((p) => p.id === "lea")?.canReceiveInspectionRequest,
	).toBe(false);
	expect(assistanceOffers(r.s, lea)).toEqual([]);
	const live = setup();
	if (live.s.assistance) live.s.assistance.expiresAt = live.s.now;
	expect(assistanceOffers(live.s, live.actor("lea"))).toEqual([]);
});
it("wet timber cannot open annex even when the host explicitly chooses opening", () => {
	const r = setup("wet-sound");
	round(r, "annex-visit");
	visit(r);
	round(r, "annex-open-section");
	for (let n = 0; n < 12 && !r.s.assistance?.result; n++) round(r);
	expect(r.s.assistance?.action).toBe("open-section");
	expect(r.s.assistance?.opened).toBe(false);
	expect(r.s.hallSafe).toBe(true);
	expect(r.s.places.find((p) => p.id === "hall")?.capacity).toBe(10);
	expect(restoreRuntime(r.export()).export()).toEqual(r.export());
});
it("a request teaches no methods and travelling inspection restores mid-journey exactly", () => {
	const r = new Runtime(createRuntime(42, 8).export() as Save);
	r.s.hall = 12;
	r.s.hallSafe = true;
	const methods = structuredClone(r.actor("lea").person.methods);
	r.intervene({ kind: "request-inspection", actorId: "lea", proposal });
	expect(r.actor("lea").person.methods).toEqual(methods);
	round(r, "annex-visit");
	const copy = restoreRuntime(r.export()) as Runtime;
	for (let n = 0; n < 8; n++) {
		round(r);
		round(copy);
	}
	expect(copy.export()).toEqual(r.export());
});
it("without relaying a request even a trained person gets no annex options", () => {
	const r = new Runtime(createRuntime(42, 8).export() as Save);
	r.s.hall = 12;
	r.s.hallSafe = true;
	expect(r.actor("lea").person.methods?.rules.length).toBeGreaterThan(0);
	expect(assistanceOffers(r.s, r.actor("lea"))).toEqual([]);
});
it("rejects a forged extra-capacity outcome and invalid result provenance", () => {
	const r = setup();
	const forged = r.export() as Save;
	if (forged.assistance) forged.assistance.opened = true;
	const hall = forged.places.find((p) => p.id === "hall");
	if (hall) hall.capacity = 14;
	expect(() => restoreRuntime(forged)).toThrow();
	round(r, "annex-visit");
	visit(r);
	round(r, "annex-open-section");
	for (let n = 0; n < 12 && !r.s.assistance?.result; n++) round(r);
	const missingCause = r.export() as Save;
	if (missingCause.assistance?.result)
		missingCause.assistance.result.causes = [];
	expect(() => restoreRuntime(missingCause)).toThrow();
});
it("rejects incomplete or contradictory evidence for an active annex inspection job", () => {
	const r = setup();
	round(r, "annex-visit");
	visit(r);
	round(r, "annex-open-section");
	expect(r.actor("lea").job?.offer.id).toBe("annex-open-section");
	for (const mutate of [
		(s: Save) => {
			if (s.assistance) delete s.assistance.visit;
		},
		(s: Save) => {
			if (s.assistance) s.assistance.received = false;
		},
		(s: Save) => {
			if (s.assistance) {
				s.assistance.result = structuredClone(s.assistance.request);
				s.assistance.action = "open-section";
			}
		},
	]) {
		const malformed = r.export() as Save;
		mutate(malformed);
		expect(() => restoreRuntime(malformed)).toThrow();
	}
	expect(restoreRuntime(r.export()).export()).toEqual(r.export());
});
it("retains annex observations and outcomes without claiming a lesson or main-hall opening", () => {
	const r = setup();
	round(r, "annex-visit");
	visit(r);
	expect(r.s.assistance?.visit?.kind).toBe("annex-observed");
	const observed = r
		.view()
		.stories.find((story) =>
			story.eventIds.includes(r.s.assistance?.visit?.id ?? -1),
		);
	expect(observed?.title).toBe("Someone checked the annex timber");
	expect(observed?.summary).toBe(
		"Lea checked the annex timber. The timber was dry. The supports were sound. They still need to decide whether to open it.",
	);
	expect(observed?.summary).not.toContain("inspected");
	round(r, "annex-open-section");
	for (let n = 0; n < 12 && !r.s.assistance?.result; n++) round(r);
	expect(r.s.assistance?.result?.kind).toBe("annex-inspected");
	const outcome = r
		.view()
		.stories.find((story) =>
			story.eventIds.includes(r.s.assistance?.result?.id ?? -1),
		);
	expect(outcome?.title).toBe(
		"Four extra places in the hall opened after the annex inspection",
	);
	expect(restoreRuntime(r.export()).export()).toEqual(r.export());
});

it("rejects forged annex decision jobs starting outside the observed annex", () => {
	const r = setup();
	round(r, "annex-visit");
	visit(r);
	round(r, "annex-open-section");
	const forged = r.export() as Save;
	const lea = forged.people.find((p) => p.person.id === "lea");
	if (lea?.job) {
		lea.place = "market";
		lea.job.from = "market";
	}
	expect(() => restoreRuntime(forged)).toThrow();
});
it("does not consume the request slot while the recipient is travelling to sleep", () => {
	const r = new Runtime(createRuntime(42, 8).export() as Save);
	r.s.hall = 12;
	r.s.hallSafe = true;
	r.actor("lea").place = "homes";
	for (const id of r.prepareRound())
		r.apply(id, id === "lea" ? "sleep" : "rest");
	r.actor("lea").person.body.asleep = false;
	const before = stateHash(r.export());
	expect(
		r.view().people.find((p) => p.id === "lea")?.canReceiveInspectionRequest,
	).toBe(false);
	expect(() =>
		r.intervene({ kind: "request-inspection", actorId: "lea", proposal }),
	).toThrow();
	expect(stateHash(r.export())).toBe(before);
});
it("retains bounded origin metadata and rejects malformed origin before mutation", () => {
	const r = new Runtime(createRuntime(42, 8).export() as Save);
	r.s.hall = 12;
	r.s.hallSafe = true;
	for (const proposalOrigin of [
		{ kind: "authored", extra: true },
		{
			kind: "recorded-gm",
			recordedAt: "invalid",
			sourceFingerprint: "abc",
			modelIds: ["model"],
		},
		{
			kind: "recorded-gm",
			recordedAt: "2026-10-16T14:00:00Z",
			sourceFingerprint: "",
			modelIds: [],
		},
	]) {
		const before = stateHash(r.export());
		expect(() =>
			r.intervene({
				kind: "request-inspection",
				actorId: "lea",
				proposal,
				proposalOrigin: proposalOrigin as never,
			}),
		).toThrow();
		expect(stateHash(r.export())).toBe(before);
	}
	const origin = {
		kind: "recorded-gm",
		recordedAt: "2026-10-16T14:00:00Z",
		sourceFingerprint: "a".repeat(64),
		modelIds: ["test-recorded-model"],
	} as const;
	r.intervene({
		kind: "request-inspection",
		actorId: "lea",
		proposal,
		proposalOrigin: { ...origin, modelIds: [...origin.modelIds] },
	});
	expect(r.view().assistance?.origin).toEqual(origin);
	expect(restoreRuntime(r.export()).export()).toEqual(r.export());
	const forged = r.export() as Save;
	if (forged.assistance)
		Object.assign(forged.assistance.origin, { extra: true });
	expect(() => restoreRuntime(forged)).toThrow();
});
it("distinguishes forced host inspection from an actual HF decision in retained method evidence", () => {
	const forced = setup();
	round(forced, "annex-visit");
	visit(forced);
	round(forced, "annex-open-section");
	for (let n = 0; n < 12 && !forced.s.assistance?.result; n++) round(forced);
	expect(forced.view().assistance?.decisionSource).toBe("Host control");
	expect(forced.view().assistance?.methodTerms).toEqual([]);
	const hf = setup();
	round(hf, "annex-visit");
	visit(hf);
	const choice = hf.choose("lea");
	expect(choice).toBe("annex-open-section");
	for (const id of [...hf.s.pending])
		hf.apply(
			id,
			id === "lea" ? choice : (hf.actor(id).job?.offer.id ?? "rest"),
		);
	for (let n = 0; n < 12 && !hf.s.assistance?.result; n++) round(hf);
	expect(hf.view().assistance?.decisionSource).toBe(HF_SOURCE);
	expect(
		hf
			.view()
			.assistance?.methodTerms?.some(
				(t) => t.source.startsWith("method:") && t.value > 0,
			),
	).toBe(true);
	expect(restoreRuntime(hf.export()).export()).toEqual(hf.export());
});
it("rejects forged or missing durable decision evidence", () => {
	const r = setup();
	expect(r.view().assistance?.origin).toEqual({ kind: "authored" });
	round(r, "annex-visit");
	visit(r);
	round(r, "annex-open-section");
	const missing = r.export() as Save;
	const actor = missing.people.find((p) => p.person.id === "lea");
	if (actor?.job) delete actor.job.assistanceDecision;
	expect(() => restoreRuntime(missing)).toThrow();
	for (let n = 0; n < 12 && !r.s.assistance?.result; n++) round(r);
	for (const mutate of [
		(s: Save) => {
			if (s.assistance) delete s.assistance.decisionSource;
		},
		(s: Save) => {
			if (s.assistance)
				s.assistance.methodTerms = [{ source: "method:forged", value: 1 }];
		},
		(s: Save) => {
			if (s.assistance) s.assistance.decisionSource = "HF 2.3.0";
		},
	]) {
		const bad = r.export() as Save;
		mutate(bad);
		expect(() => restoreRuntime(bad)).toThrow();
	}
});
