import {
	type Affordance,
	type DecisionRecord,
	perceive,
} from "@adam0white/human-framework";
import type { ProposalOrigin, TownEvent } from "../contracts.ts";
import {
	hallInspectionOffers,
	observeHallInspection,
} from "../experiments/inspection.ts";
import { presentAt } from "./encounters.ts";
import type { EveningHost } from "./evenings.ts";
import { isHfSource } from "./hf-version.ts";
import { placeOf } from "./invariants.ts";
import { placeSpecs, type Resident, type Save } from "./state.ts";
import { validateEvent } from "./validation.ts";
export type InspectionProposal = {
	schema: "neighbours-gm-proposal@1";
	kind: "inspection-request";
	target: "hall-annex";
	cue: "dry-sound" | "wet-sound" | "unsupported";
	windowMinutes: number;
};
export type Assistance = {
	version: 1;
	origin: ProposalOrigin;
	decisionSource?: string;
	decisionId?: string;
	methodTerms?: { source: string; value: number }[];
	proposal: InspectionProposal;
	actorId: string;
	expiresAt: number;
	request: TownEvent;
	received: boolean;
	visit?: TownEvent;
	result?: TownEvent;
	action?: string;
	opened: boolean;
};
export function parseInspectionProposal(input: unknown): InspectionProposal {
	if (!input || typeof input !== "object" || Array.isArray(input))
		throw Error("Invalid inspection proposal");
	const p = input as InspectionProposal;
	if (
		Object.keys(p).sort().join() !== "cue,kind,schema,target,windowMinutes" ||
		p.schema !== "neighbours-gm-proposal@1" ||
		p.kind !== "inspection-request" ||
		p.target !== "hall-annex" ||
		!["dry-sound", "wet-sound", "unsupported"].includes(p.cue) ||
		!Number.isInteger(p.windowMinutes) ||
		p.windowMinutes < 60 ||
		p.windowMinutes > 1440
	)
		throw Error("Invalid inspection proposal");
	return structuredClone(p);
}
export function parseProposalOrigin(input: unknown): ProposalOrigin {
	if (!input || typeof input !== "object" || Array.isArray(input))
		throw Error("Invalid proposal origin");
	const origin = input as ProposalOrigin;
	if (origin.kind === "authored" && Object.keys(origin).join() === "kind")
		return { kind: "authored" };
	if (
		origin.kind !== "recorded-gm" ||
		Object.keys(origin).sort().join() !==
			"kind,modelIds,recordedAt,sourceFingerprint" ||
		typeof origin.recordedAt !== "string" ||
		origin.recordedAt.length > 80 ||
		!Number.isFinite(Date.parse(origin.recordedAt)) ||
		typeof origin.sourceFingerprint !== "string" ||
		!/^[a-f0-9]{64}$/i.test(origin.sourceFingerprint) ||
		!Array.isArray(origin.modelIds) ||
		origin.modelIds.length < 1 ||
		origin.modelIds.length > 16 ||
		origin.modelIds.some(
			(id) => typeof id !== "string" || id.length < 1 || id.length > 160,
		) ||
		new Set(origin.modelIds).size !== origin.modelIds.length
	)
		throw Error("Invalid proposal origin");
	return structuredClone(origin);
}
export function canReceiveInspectionRequest(r: Resident): boolean {
	return (
		r.person.body.alive &&
		!r.person.body.asleep &&
		r.job?.offer.mode !== "sleep"
	);
}
export function assistanceDecision(
	r: Resident,
	record: DecisionRecord,
): NonNullable<Resident["job"]>["assistanceDecision"] {
	const source =
		r.decision?.chosen === record.chosenAffordanceId &&
		r.decision.decidedAt === record.at &&
		!record.id.startsWith("host-")
			? r.decision.source
			: "Host control";
	return {
		id: record.id,
		source,
		methodTerms: isHfSource(source)
			? (record.considered
					.find((c) => c.affordanceId === record.chosenAffordanceId)
					?.terms.filter((t) => t.source.startsWith("method:"))
					.map((t) => ({ source: t.source, value: t.value })) ?? [])
			: [],
	};
}
function validateDecisionEvidence(
	id: unknown,
	source: unknown,
	terms: unknown,
): void {
	if (
		typeof id !== "string" ||
		!id.length ||
		id.length > 300 ||
		typeof source !== "string" ||
		!source.length ||
		source.length > 300 ||
		!Array.isArray(terms) ||
		terms.length > 32 ||
		terms.some(
			(t) =>
				!t ||
				typeof t !== "object" ||
				Object.keys(t).sort().join() !== "source,value" ||
				typeof t.source !== "string" ||
				!t.source.startsWith("method:") ||
				t.source.length > 300 ||
				!Number.isFinite(t.value) ||
				Math.abs(t.value) > 1e6,
		) ||
		(!isHfSource(source) && terms.length > 0) ||
		(isHfSource(source) && id.startsWith("host-"))
	)
		throw Error("Invalid assistance decision provenance");
}
function validateMatchingTrace(
	r: Resident,
	id: string,
	action: string,
	source: string,
	terms: { source: string; value: number }[],
): void {
	const trace = r.person.trace.find((t) => t.id === id);
	if (!isHfSource(source) || !trace) return;
	const chosen = trace.considered.find(
		(c) => c.affordanceId === `annex-${action}`,
	);
	if (
		trace.chosenAffordanceId !== `annex-${action}` ||
		JSON.stringify(terms) !==
			JSON.stringify(
				chosen?.terms
					.filter((t) => t.source.startsWith("method:"))
					.map((t) => ({ source: t.source, value: t.value })) ?? [],
			)
	)
		throw Error("Assistance decision contradicts retained HF trace");
}
function retain(host: EveningHost, id: number) {
	const event = host.s.events.find((e) => e.id === id);
	if (!event) throw Error("Missing assistance event");
	return structuredClone(event);
}
export function requestInspection(
	host: EveningHost,
	actorId: unknown,
	input: unknown,
	proposalOrigin: unknown = { kind: "authored" },
): void {
	const origin = parseProposalOrigin(proposalOrigin);
	const proposal = parseInspectionProposal(input),
		s = host.s;
	const resident = s.people.find((r) => r.person.id === actorId);
	if (
		s.assistance ||
		!s.hallSafe ||
		!resident ||
		!canReceiveInspectionRequest(resident)
	)
		throw Error("Inspection assistance is not available");
	const id = host.event(
		"intervention",
		`A visitor asks ${resident.person.name} to inspect the hall annex within ${proposal.windowMinutes} minutes. The request does not explain how to inspect the timber and does not promise help.`,
		undefined,
		"hall",
	);
	const event = s.events.find((e) => e.id === id);
	if (!event) throw Error("Missing request");
	event.targetId = resident.person.id;
	event.source = "town-bulletin";
	const attended =
		resident.person.body.asleep || resident.job?.offer.mode === "sleep"
			? []
			: perceive(resident.person, [
					{
						at: s.now,
						channel: "told",
						kind: "inspection-request",
						actorId: "town-bulletin",
						placeId: "hall",
						salience: 0.8,
						advice: [{ action: "inspect", strength: 0.5 }],
						summary: event.text,
					},
				]);
	if (attended.length)
		resident.received = [
			...(resident.received ?? []),
			structuredClone(event),
		].slice(-12);
	s.assistance = {
		version: 1,
		origin,
		proposal,
		actorId: resident.person.id,
		expiresAt: s.now + proposal.windowMinutes,
		request: structuredClone(event),
		received: attended.length > 0,
		opened: false,
	};
}
function cues(a: Assistance) {
	return {
		moisture:
			a.proposal.cue === "unsupported"
				? ("unknown" as const)
				: a.proposal.cue === "dry-sound"
					? ("dry" as const)
					: ("wet" as const),
		support:
			a.proposal.cue === "unsupported"
				? ("unknown" as const)
				: ("sound" as const),
	};
}
export function observeAssistance(s: Save, r: Resident): void {
	const a = s.assistance;
	if (
		a?.received &&
		a.visit &&
		!a.result &&
		a.actorId === r.person.id &&
		presentAt(r, "hall", s.now)
	)
		observeHallInspection(r.person, {
			...cues(a),
			contextId: `annex-${a.request.id}`,
			sectionId: "hall-annex",
		});
}
export function assistanceOffers(
	s: Save,
	r: Resident,
	historical?: Affordance,
): Affordance[] {
	const a = s.assistance;
	if (
		!a ||
		a.actorId !== r.person.id ||
		(!historical &&
			(!a.received ||
				a.result ||
				s.now >= a.expiresAt ||
				r.job ||
				!r.person.body.alive))
	)
		return [];
	const dest = placeOf(s, "hall"),
		from = placeOf(s, r.place);
	const travel =
		r.place === "hall"
			? 0
			: Math.ceil(
					Math.hypot(dest.x - from.x, dest.y - from.y) / (s.bus ? 35 : 20),
				) * 15;
	const visit: Affordance = {
		id: "annex-visit",
		action: "inspect",
		label: "Visit the hall annex to inspect its timber",
		targetId: "hall-annex",
		placeId: "hall",
		duration: 15 + travel,
		effort: 0.1,
		advertises: { competence: 0.2 },
		tags: ["floor"],
	};
	const inspection = hallInspectionOffers(
		`annex-${a.request.id}`,
		"hall-annex",
	).map((o) => ({
		...o,
		id: `annex-${o.id}`,
		placeId: "hall",
		duration: o.action === "ask-inspector" ? 120 : 15,
		tags: ["floor"],
	}));
	if (historical) {
		if (
			!a.received ||
			a.result ||
			(historical.id === "annex-visit"
				? !!a.visit
				: !a.visit || r.place !== "hall")
		)
			return [];
		return [visit, ...inspection].filter((o) => o.id === historical.id);
	}
	if (!a.visit) return s.now + visit.duration <= a.expiresAt ? [visit] : [];
	if (!presentAt(r, "hall", s.now)) return [];
	return inspection.filter((o) => s.now + o.duration <= a.expiresAt);
}
export function finishAssistance(host: EveningHost, r: Resident): boolean {
	const a = host.s.assistance,
		j = r.job;
	if (!a || !j || j.offer.targetId !== "hall-annex") return false;
	if (
		a.actorId !== r.person.id ||
		!a.received ||
		j.end > a.expiresAt ||
		a.result
	)
		return true;
	if (j.offer.id === "annex-visit") {
		a.visit = retain(
			host,
			host.event(
				"annex-observed",
				`${r.person.name} checked the annex timber. The timber was ${cues(a).moisture}. The supports were ${cues(a).support}. They still need to decide whether to open it.`,
				r.person.id,
				"hall",
				[a.request.id, j.event],
			),
		);
		return true;
	}
	if (!a.visit) throw Error("Annex inspection requires a visit");
	a.action = j.offer.action;
	if (!j.assistanceDecision) throw Error("Missing annex decision provenance");
	a.decisionSource = j.assistanceDecision.source;
	a.decisionId = j.assistanceDecision.id;
	a.methodTerms = structuredClone(j.assistanceDecision.methodTerms);
	a.opened = a.action === "open-section" && a.proposal.cue === "dry-sound";
	if (a.opened)
		placeOf(host.s, "hall").capacity =
			(placeSpecs.find((p) => p[0] === "hall")?.[4] ?? 10) + 4;
	a.result = retain(
		host,
		host.event(
			"annex-inspected",
			a.opened
				? `${r.person.name} checked the annex and found dry timber with sound supports. Four extra places in the hall are now open.`
				: a.action === "ask-inspector"
					? `${r.person.name} asked for an experienced annex inspector. The annex stays closed.`
					: `${r.person.name} ${a.action === "keep-closed" ? "kept" : "could not open"} the annex after checking ${cues(a).moisture} timber and ${cues(a).support} supports. No extra places opened.`,
			r.person.id,
			"hall",
			[a.request.id, a.visit.id, j.event],
		),
	);
	return true;
}
export function validateAssistance(s: Save, ids: Set<string>): void {
	const a = s.assistance;
	if (!a) return;
	if (
		Object.keys(a).some(
			(k) =>
				![
					"version",
					"origin",
					"decisionSource",
					"decisionId",
					"methodTerms",
					"proposal",
					"actorId",
					"expiresAt",
					"request",
					"received",
					"visit",
					"result",
					"action",
					"opened",
				].includes(k),
		)
	)
		throw Error("Unexpected assistance fields");
	parseInspectionProposal(a.proposal);
	parseProposalOrigin(a.origin);
	if (
		a.version !== 1 ||
		!ids.has(a.actorId) ||
		typeof a.received !== "boolean" ||
		typeof a.opened !== "boolean" ||
		!Number.isSafeInteger(a.expiresAt) ||
		a.expiresAt !== a.request.at + a.proposal.windowMinutes
	)
		throw Error("Invalid assistance record");
	validateEvent(a.request, s, ids);
	if (
		a.request.kind !== "intervention" ||
		a.request.targetId !== a.actorId ||
		a.request.placeId !== "hall" ||
		a.request.source !== "town-bulletin"
	)
		throw Error("Invalid assistance request");
	for (const e of [a.visit, a.result])
		if (e) {
			validateEvent(e, s, ids);
			if (
				e.actorId !== a.actorId ||
				e.placeId !== "hall" ||
				e.at < a.request.at ||
				e.at > a.expiresAt ||
				!e.causes.includes(a.request.id)
			)
				throw Error("Invalid assistance evidence");
		}
	if (a.visit && (a.visit.kind !== "annex-observed" || !a.received))
		throw Error("Invalid assistance visit");
	if (
		a.result &&
		(!a.visit ||
			a.result.at < a.visit.at + 15 ||
			!a.result.causes.includes(a.visit.id) ||
			!["open-section", "keep-closed", "ask-inspector"].includes(
				a.action ?? "",
			))
	)
		throw Error("Invalid assistance result");
	for (const resident of s.people) {
		const job = resident.job;
		if (job?.offer.targetId !== "hall-annex") continue;
		const startedAt = resident.person.activity?.startedAt;
		const isVisit = job.offer.id === "annex-visit";
		if (
			resident.person.id !== a.actorId ||
			!a.received ||
			a.result ||
			startedAt === undefined ||
			startedAt < a.request.at ||
			job.end > a.expiresAt ||
			(isVisit
				? !!a.visit
				: !a.visit ||
					a.visit.at > startedAt ||
					resident.place !== "hall" ||
					job.from !== "hall") ||
			![
				"annex-visit",
				"annex-open-section",
				"annex-keep-closed",
				"annex-ask-inspector",
			].includes(job.offer.id)
		)
			throw Error("Active annex job lacks valid assistance evidence");
		if (isVisit) {
			if (job.assistanceDecision !== undefined)
				throw Error("Visit cannot claim an opening decision");
		} else {
			const evidence = job.assistanceDecision;
			if (
				!evidence ||
				Object.keys(evidence).sort().join() !== "id,methodTerms,source" ||
				evidence.id !== resident.person.activity?.decisionId
			)
				throw Error("Missing active annex decision provenance");
			validateDecisionEvidence(
				evidence.id,
				evidence.source,
				evidence.methodTerms,
			);
			validateMatchingTrace(
				resident,
				evidence.id,
				job.offer.action,
				evidence.source,
				evidence.methodTerms,
			);
		}
	}
	if (a.result) {
		validateDecisionEvidence(a.decisionId, a.decisionSource, a.methodTerms);
		const actor = s.people.find((r) => r.person.id === a.actorId);
		if (actor)
			validateMatchingTrace(
				actor,
				a.decisionId as string,
				a.action as string,
				a.decisionSource as string,
				a.methodTerms ?? [],
			);
	} else if (
		a.decisionSource !== undefined ||
		a.decisionId !== undefined ||
		a.methodTerms !== undefined
	)
		throw Error("Decision provenance requires a completed annex outcome");
	if (!a.result && (a.opened || a.action !== undefined))
		throw Error("Missing assistance result");
	if (
		a.result &&
		(a.opened !==
			(a.action === "open-section" && a.proposal.cue === "dry-sound") ||
			a.result.kind !== "annex-inspected")
	)
		throw Error("Invalid assistance opening");
}
