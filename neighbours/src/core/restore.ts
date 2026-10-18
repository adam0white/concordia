import { restore } from "@adam0white/human-framework";
import type { TownRuntime } from "../contracts";
import { reviewDue } from "./activity-reviews.ts";
import { validateAssistance } from "./assistance.ts";
import { validateEvenings } from "./evenings.ts";
import { validateHandcart } from "./handcart.ts";
import { HF_VERSION, LEGACY_HF_VERSIONS } from "./hf-version.ts";
import { buildOffers, usesActivitySlot, workMinutesFor } from "./offers.ts";
import { validatePlayer } from "./player.ts";
import { Runtime } from "./runtime.ts";
import { known, placeSpecs, type Save, SCHEMA } from "./state.ts";
import { validateTownChronicle } from "./town-chronicle.ts";
import { validateEvent, validateResidentEvidence } from "./validation.ts";
export function restoreRuntime(input: unknown): TownRuntime {
	if (!input || typeof input !== "object") throw Error("Invalid town save");
	const s = structuredClone(input) as Save;
	const keys = [
		"schema",
		"hf",
		"seed",
		"now",
		"round",
		"controls",
		"bus",
		"tools",
		"hall",
		"hallSafe",
		"firstMealAt",
		"events",
		"nextEvent",
		"people",
		"places",
		"pending",
		"initialFood",
		"produced",
		"consumed",
	];
	if (
		Object.keys(s)
			.filter(
				(key) =>
					key !== "socialEvenings" &&
					key !== "handcart" &&
					key !== "townChronicle" &&
					key !== "assistance" &&
					key !== "player",
			)
			.sort()
			.join() !== keys.sort().join()
	)
		throw Error("Unexpected or missing save fields");
	if (
		s.schema !== SCHEMA ||
		!LEGACY_HF_VERSIONS.includes(s.hf) ||
		!Array.isArray(s.people) ||
		s.people.length < 8 ||
		s.people.length > 300 ||
		!Array.isArray(s.places) ||
		s.places.length !== 8 ||
		!Array.isArray(s.events) ||
		s.events.length > 400 ||
		!Array.isArray(s.pending)
	)
		throw Error("Unsupported or malformed town save");
	for (const field of [
		"seed",
		"now",
		"round",
		"controls",
		"tools",
		"hall",
		"nextEvent",
		"initialFood",
		"produced",
		"consumed",
	] as const)
		if (!Number.isSafeInteger(s[field]) || s[field] < 0)
			throw Error(`Invalid ${field}`);
	if (
		s.seed > 4294967295 ||
		s.now !== 480 + s.round * 15 ||
		s.controls > 3 ||
		typeof s.bus !== "boolean" ||
		typeof s.hallSafe !== "boolean" ||
		(s.hallSafe && s.hall < 12) ||
		s.hall > 12 ||
		s.initialFood !== 80
	)
		throw Error("Invalid clock or controls");
	if (
		s.firstMealAt !== null &&
		(!Number.isSafeInteger(s.firstMealAt) ||
			s.firstMealAt < 480 ||
			s.firstMealAt > s.now)
	)
		throw Error("Invalid first meal marker");
	const ids = new Set<string>();
	for (const [i, r] of s.people.entries()) {
		r.person = restore(r.person);
		const expected = known[i]?.[0] ?? `resident-${i - 7}`;
		if (
			r.person.id !== expected ||
			ids.has(r.person.id) ||
			r.person.now !== s.now ||
			!Number.isSafeInteger(r.wealth) ||
			r.wealth < 0 ||
			r.known !== i < 8 ||
			typeof r.role !== "string" ||
			typeof r.description !== "string" ||
			!s.places.some((p) => p.id === r.place) ||
			!["hf", "table", "random", "llm"].includes(r.policy)
		)
			throw Error("Invalid resident");
		ids.add(r.person.id);
		if (r.job) {
			const j = r.job;
			if (
				j.assistanceDecision &&
				(j.offer.targetId !== "hall-annex" || j.offer.id === "annex-visit")
			)
				throw Error("Decision provenance on unrelated activity");
			const canonical = buildOffers(s, r.person.id, j.offer).find(
				(a) => a.id === j.offer.id,
			);
			const activity = r.person.activity;
			if (
				Object.keys(j).some(
					(key) =>
						![
							"offer",
							"end",
							"arrive",
							"from",
							"event",
							"food",
							"tools",
							"inspectionCues",
							"assistanceDecision",
							"socialContacts",
						].includes(key),
				) ||
				!Number.isSafeInteger(j.event) ||
				j.event < 1 ||
				j.event >= s.nextEvent
			)
				throw Error("Invalid physical job fields");

			if (
				j.socialContacts !== undefined &&
				(!["talk", "gather"].includes(j.offer.action) ||
					!Array.isArray(j.socialContacts) ||
					j.socialContacts.length > s.people.length * 10 ||
					new Set(j.socialContacts.map((c) => `${c.otherId}:${c.event}`))
						.size !== j.socialContacts.length ||
					j.socialContacts.some(
						(c) =>
							!c ||
							typeof c !== "object" ||
							Object.keys(c).sort().join() !== "event,otherId" ||
							c.otherId === r.person.id ||
							!s.people.some((o) => o.person.id === c.otherId) ||
							!Number.isSafeInteger(c.event) ||
							c.event < 1 ||
							c.event >= s.nextEvent ||
							c.event === j.event ||
							!r.person.social.relationships.some(
								(rel) => rel.otherId === c.otherId,
							),
					))
			)
				throw Error("Invalid social contact receipt");
			for (const contact of j.socialContacts ?? []) {
				const event = s.events.find((e) => e.id === contact.event);
				const counterpart = s.people.find(
					(other) => other.job?.event === contact.event,
				);
				const otherJob = counterpart?.job;
				// Completed counterpart jobs may have left the bounded event feed. Reject
				// contradictions in retained evidence without inventing missing history.
				if (
					s.now - j.arrive < 15 ||
					(event &&
						(event.kind !== "started" ||
							event.actorId !== contact.otherId ||
							event.placeId !== j.offer.placeId ||
							event.at > s.now - 15)) ||
					(otherJob &&
						(counterpart.person.id !== contact.otherId ||
							!["talk", "gather"].includes(otherJob.offer.action) ||
							otherJob.offer.placeId !== j.offer.placeId ||
							Math.min(j.end, otherJob.end, s.now) -
								Math.max(j.arrive, otherJob.arrive) <
								15 ||
							!otherJob.socialContacts?.some(
								(receipt) =>
									receipt.otherId === r.person.id && receipt.event === j.event,
							)))
				)
					throw Error("Invalid social contact receipt");
			}
			if (
				j.inspectionCues &&
				(!["open-section", "keep-closed", "ask-inspector"].includes(
					j.offer.action,
				) ||
					!["dry", "wet"].includes(j.inspectionCues.moisture) ||
					!["sound", "loose"].includes(j.inspectionCues.support))
			)
				throw Error("Invalid received inspection cues");
			const workMinutes = workMinutesFor(j.offer);
			if (workMinutes === undefined) throw Error("Unknown activity duration");
			const beforeBus = s.bus
				? buildOffers({ ...s, bus: false }, r.person.id, j.offer).find(
						(a) => a.id === j.offer.id,
					)
				: canonical;
			const omit = new Set(["duration", "fulfills"]);
			const offerFields = Object.keys(j.offer)
				.filter((k) => !omit.has(k))
				.sort();
			const canonicalFields = canonical
				? Object.keys(canonical)
						.filter((k) => !omit.has(k))
						.sort()
				: [];
			const actualFields = j.offer as unknown as Record<string, unknown>;
			const expectedFields = canonical as unknown as
				| Record<string, unknown>
				| undefined;
			if (
				!activity ||
				!canonical ||
				JSON.stringify(activity.affordance) !== JSON.stringify(j.offer) ||
				JSON.stringify(offerFields) !== JSON.stringify(canonicalFields) ||
				offerFields.some(
					(k) =>
						JSON.stringify(actualFields[k]) !==
						JSON.stringify(expectedFields?.[k]),
				) ||
				![canonical.duration, beforeBus?.duration].includes(j.offer.duration) ||
				!Number.isSafeInteger(activity.startedAt) ||
				activity.startedAt < 480 ||
				activity.startedAt > s.now ||
				activity.startedAt % 15 !== 0 ||
				activity.endsAt !== j.end ||
				activity.action !== j.offer.action ||
				activity.affordanceId !== j.offer.id ||
				activity.mode !== (j.offer.mode ?? "awake") ||
				activity.effort !== j.offer.effort ||
				activity.focus !== (j.offer.focus ?? 0) ||
				j.end !== activity.startedAt + j.offer.duration ||
				j.arrive !== activity.startedAt + j.offer.duration - workMinutes
			)
				throw Error("Activity differs from host rules");
			if (j.offer.action === "work") {
				const day = Math.floor(activity.startedAt / 1440),
					ledger = r.paidWork;
				if (
					!ledger ||
					ledger.day !== day ||
					ledger.starts < 1 ||
					ledger.minutes >= ledger.starts * 60 ||
					activity.startedAt < day * 1440 + 480 ||
					j.end > day * 1440 + 1080
				)
					throw Error("Paid shift exceeds its ledger or business hours");
			}
			if (
				j.offer.fulfills !== undefined &&
				(!Array.isArray(j.offer.fulfills) ||
					new Set(j.offer.fulfills).size !== j.offer.fulfills.length ||
					j.offer.fulfills.some(
						(id) =>
							!r.person.agenda.commitments.some(
								(c) => c.id === id && c.actions.includes(j.offer.action),
							),
					))
			)
				throw Error("Activity names an invalid promise");

			if (
				!Number.isSafeInteger(j.end) ||
				j.end <= s.now ||
				!Number.isSafeInteger(j.arrive) ||
				j.arrive > j.end ||
				j.from !== r.place ||
				!s.places.some((p) => p.id === j.offer.placeId) ||
				j.food !==
					(["eat", "gather", "attend-meal"].includes(j.offer.action) ? 1 : 0) ||
				j.tools !== (j.offer.action === "repair" ? 1 : 0) ||
				!r.person.activity ||
				r.person.activity.affordance.id !== j.offer.id
			)
				throw Error("Invalid activity");
		} else if (r.person.activity) throw Error("Untracked HF activity");
	}
	const totalTools =
		s.tools + s.people.reduce((sum, r) => sum + (r.job?.tools ?? 0), 0);
	if (
		totalTools < 3 ||
		totalTools > 3 + 3 * (3 - s.controls) ||
		totalTools % 3 !== 0
	)
		throw Error("Tool conservation violation");
	const placeIds = new Set<string>();
	for (const p of s.places) {
		const spec = placeSpecs.find((spec) => spec[0] === p.id);
		if (
			!spec ||
			placeIds.has(p.id) ||
			p.name !== spec[1] ||
			p.x !== spec[2] ||
			p.y !== spec[3] ||
			p.capacity !==
				spec[4] + (p.id === "hall" && s.assistance?.opened ? 4 : 0) ||
			p.kind !== spec[5] ||
			!Number.isInteger(p.stock) ||
			p.stock < 0 ||
			p.reserved !==
				s.people.filter(
					(r) => r.job?.offer.placeId === p.id && usesActivitySlot(r.job.offer),
				).length ||
			p.reserved > p.capacity
		)
			throw Error("Invalid resources or reservation");
		placeIds.add(p.id);
	}
	if (
		s.pending.some((id) => {
			const resident = s.people.find((r) => r.person.id === id);
			return (
				!ids.has(id) ||
				!resident?.person.body.alive ||
				(!!resident.job && !reviewDue(resident, s.now))
			);
		}) ||
		new Set(s.pending).size !== s.pending.length
	)
		throw Error("Invalid pending actors");
	validateAssistance(s, ids);
	validateEvenings(s, ids);
	validateHandcart(s, ids);
	validateTownChronicle(s, ids);
	validatePlayer(s, ids);
	for (const r of s.people) validateResidentEvidence(r, s, ids);
	let last = 0;
	for (const e of s.events) {
		validateEvent(e, s, ids);
		if (
			!Number.isSafeInteger(e.id) ||
			e.id <= last ||
			e.id >= s.nextEvent ||
			!Number.isSafeInteger(e.at) ||
			e.at > s.now ||
			typeof e.text !== "string" ||
			!Array.isArray(e.causes) ||
			e.causes.some((c) => !Number.isInteger(c) || c >= e.id)
		)
			throw Error("Invalid event");
		last = e.id;
	}
	const reservedFood = s.people.reduce((n, r) => n + (r.job?.food ?? 0), 0);
	const total = s.places.reduce((n, p) => n + p.stock, 0);
	if (total + s.consumed + reservedFood !== s.initialFood + s.produced)
		throw Error("Food conservation violation");
	const initialCash = s.people.reduce((sum, _, i) => sum + 3 + (i % 6), 0);
	const cash = s.people.reduce((sum, r) => sum + r.wealth, 0);
	const paid = s.people.reduce(
		(sum, r) => sum + ((r.paidWork?.totalMinutes ?? 0) / 60) * 2,
		0,
	);
	if (cash + s.consumed + reservedFood !== initialCash + paid)
		throw Error("Money conservation violation");
	s.hf = HF_VERSION;
	return new Runtime(s);
}
