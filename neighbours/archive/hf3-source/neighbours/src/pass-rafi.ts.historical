/** Finite Pass13 → Neighbours Rafi admission using published HF calendar transport.
 * Keeps the released evening source's personal jar abstention; skim stays a source-only token.
 * Also accepts that exact carried rule from a subsequent native Neighbours Rafi checkpoint.
 * Adds no jar/action, kitchen qualification, work/care waiver, lived travel or source restamp.
 */
import {
	admitCalendarPersona,
	type CalendarPersonaSnapshot,
	type Commitment,
	DEFAULT_NORMS,
	isContinuingCommitment,
	type Person,
	projectCalendarPersona,
	restore,
	validateCalendarPersona,
} from "@adam0white/human-framework";
import {
	canonicalCast,
	canonicalPersona,
	type LifePreparation,
	type PersonaEnvelope,
	preparePersonaLife,
} from "@adam0white/lab-client";
import { CAST_RULES } from "./core/canonical-cast.ts";

import { personaDigest, validateReceivingPersona } from "./persona-protocol.ts";

export const PASS_RAFI = "hf.cast.rafi.pass";
export function isPassInput(input: LifePreparation) {
	if (input?.parent?.transfer?.castPassport === "pass-kitchen/1") return true;
	const parent = input?.parent;
	if (
		parent?.transfer?.passOrigin !== undefined ||
		parent?.transfer?.passWitness !== undefined
	)
		return true;
	const p = parent?.transfer?.person as CalendarPersonaSnapshot | undefined;
	return (
		parent?.castId === PASS_RAFI &&
		parent.transfer.castPassport === "neighbours-cast/1" &&
		Array.isArray(p?.calendar?.commitments) &&
		p.calendar.commitments.some(
			(c) => Array.isArray(c.violatedBy) && c.violatedBy.includes("skim"),
		)
	);
}
// The transport has no full Pass witness. These pins cover the reviewed played checkpoint, not all Pass13 saves.
const PASS_BUILD = "453be90356e344bc90508ace10e066baf25519b9";
const PASS_REVISION =
	"5b9b5236011bd7dd16bc63af46550f70151915874a47412be380a5fbff4a0ba6";
const PASS_RAW =
	"f8ab39530609e3f47f8c79343a3c088b6074a17434a7a34059352f83a35d1ab8";
const PASS_PROJECTION =
	"e7bc8841dc02b26e099e761240e05d2aa0a10a532ba465153e26434286b58000";
function reviewedOrigin(value: unknown): PersonaEnvelope {
	const origin = validateReceivingPersona(value);
	if (origin.revision !== PASS_REVISION)
		throw Error("Unbound Pass origin receipt.");
	return origin;
}
/** Bind actual own raw state to its SDK projection and reviewed origin; never synthesize source state. */
export function passContinuationWitness(input: LifePreparation, raw: Person) {
	const origin =
		input.parent.transfer.castPassport === "pass-kitchen/1"
			? reviewedOrigin(input.parent)
			: reviewedOrigin(input.parent.transfer.passOrigin);
	return { passOrigin: origin, passWitness: raw };
}
function projectOwn(raw: Person) {
	const retained = raw.agenda.commitments.filter((c) =>
		isContinuingCommitment(raw.agenda, c),
	);
	const owed = raw.agenda.owed ?? [];
	const identity = (values: string[]) =>
		Object.fromEntries(values.map((v) => [v, v]));
	return projectCalendarPersona(raw, {
		version: "neighbours-calendar/1",
		skills: Object.hasOwn(raw.skills, "repair") ? { repair: "repair" } : {},
		calendar: {
			version: "hf-persona-calendar-map/1",
			offset: 0,
			sourceNorms: DEFAULT_NORMS,
			references: {
				commitments: identity([
					...retained.flatMap((c) => [
						c.id,
						...(c.makeUpOf ? [c.makeUpOf] : []),
					]),
					...owed.map((d) => d.ofId),
				]),
				chains: identity(retained.flatMap((c) => (c.chain ? [c.chain] : []))),
				actions: identity([
					...retained.flatMap((c) => [...c.actions, ...(c.violatedBy ?? [])]),
					...owed.flatMap((d) => [...d.actions, ...(d.violatedBy ?? [])]),
				]),
				entities: identity(
					retained.flatMap((c) =>
						[c.toId, c.targetId].filter((v): v is string => v !== undefined),
					),
				),
				norms: identity(DEFAULT_NORMS.map((n) => n.id)),
			},
		},
	});
}
function personalJarRule(c: Commitment, own: boolean) {
	return (
		c.kind === "abstain" &&
		c.toId === "self" &&
		!c.targetId &&
		c.label === "my rule about the jar" &&
		c.actions.length === 0 &&
		c.violatedBy?.length === 1 &&
		c.violatedBy[0] === "skim" &&
		(own || c.from % 1440 === 1050) &&
		c.until - c.from === 270 &&
		c.recurEvery === 1440 &&
		!c.chain &&
		!c.normId &&
		!c.makeUpOf
	);
}
export function admitPassRafi(input: LifePreparation, target: Person): Person {
	const { parent } = input;
	const cast = canonicalCast(PASS_RAFI);
	if (
		parent.castId !== PASS_RAFI ||
		parent.castRevision !== cast.revision ||
		parent.terminal ||
		target.id !== "ravi"
	)
		throw Error("Closed, old or unallocated Pass Rafi source.");
	if (
		canonicalPersona(preparePersonaLife(parent, input.clockMs).life) !==
		canonicalPersona(input.life)
	)
		throw Error("Life input differs from its pinned clock.");
	// A receiving wrapper alone is not a Pass origin link. Require direct source or witnessed own continuation.
	const native =
		parent.source.game === "pass" && parent.source.rules === "pass-13";
	const own =
		parent.source.game === "neighbours" &&
		parent.source.rules === CAST_RULES &&
		parent.transfer.castPassport === "neighbours-cast/1";
	if (
		(!native && !own) ||
		!isPassInput(input) ||
		parent.source.engine !== "2.23.0" ||
		parent.transfer.sourceRole !== (own ? "ravi" : "rafi")
	)
		throw Error("No registered semantic adapter for this Pass source.");
	const p = validateCalendarPersona(
		own ? parent.transfer.person : parent.transfer.kitchenPerson,
	);
	const originalReceipt = parent.transfer.checkpoint as
		| Record<string, unknown>
		| undefined;
	const receipt = own
		? {
				sourceSchema: originalReceipt?.schema,
				sourceNow: originalReceipt?.sourceMinute,
				sourceRng: originalReceipt?.rng,
				checkpointDigest: originalReceipt?.sha256,
			}
		: originalReceipt;
	if (
		p.person.mappingVersion !==
			(own ? "neighbours-calendar/1" : "pass-kitchen-calendar/1") ||
		p.person.source.id !== (own ? "ravi" : "rafi") ||
		p.person.source.engine !== parent.source.engine ||
		p.calendar.offset !== 0 ||
		receipt?.sourceSchema !== p.person.source.schema ||
		receipt.sourceNow !== p.person.source.now ||
		canonicalPersona(receipt.sourceRng) !== canonicalPersona(p.person.rng) ||
		typeof receipt.checkpointDigest !== "string" ||
		!/^[a-f0-9]{64}$/.test(receipt.checkpointDigest)
	)
		throw Error("Invalid native source receipt.");
	if (!own && p.person.source.now % 1440 < 1305)
		throw Error(
			"Pass Rafi needs a released evening boundary. Finish kitchen work at source.",
		);
	if (
		p.calendar.norms.some(
			(n) =>
				!DEFAULT_NORMS.some((k) => canonicalPersona(k) === canonicalPersona(n)),
		)
	)
		throw Error("Untrusted source norm meaning.");
	if (
		p.calendar.owed.length ||
		p.calendar.lapse ||
		p.calendar.commitments.some((c) => !personalJarRule(c, own))
	)
		throw Error(
			"A source work or care duty has no town adapter. Finish it at source.",
		);
	if (own) {
		const origin = reviewedOrigin(parent.transfer.passOrigin);
		const raw = restore(parent.transfer.passWitness as Person);
		if (
			parent.branchId !== origin.branchId ||
			raw.id !== "ravi" ||
			raw.engine !== parent.source.engine ||
			personaDigest(raw) !== receipt.checkpointDigest ||
			canonicalPersona(projectOwn(raw)) !== canonicalPersona(p)
		)
			throw Error("Unbound own Pass continuation witness.");
	} else if (
		parent.source.build !== PASS_BUILD ||
		receipt.checkpointDigest !== PASS_RAW ||
		personaDigest(p) !== PASS_PROJECTION
	) {
		throw Error("Unreviewed Pass producer or source receipt.");
	}
	validateReceivingPersona(parent);
	if (!own && parent.revision !== PASS_REVISION)
		throw Error("Unreviewed Pass source envelope.");
	const age = p.person.source.now - p.person.life.bornAt;
	if (age < cast.age * 525600 || age > (cast.age + 200) * 525600)
		throw Error("Incompatible age provenance.");
	const offset = 480 - p.person.source.now;
	p.calendar.offset = offset;
	for (const duty of p.calendar.commitments) {
		duty.from += offset;
		duty.until += offset;
		if (duty.recurUntil !== undefined) duty.recurUntil += offset;
		if (duty.exempt) duty.exempt.at += offset;
	}
	// Declared zero-duration chapter-clock translation. No source debt is cleared or body healed.
	target.life.bornAt = p.person.life.bornAt + offset;
	target.body.fitness = p.person.health.fitness;
	target.agenda.commitments = [];
	delete target.agenda.owed;
	delete target.agenda.lapse;
	if (p.person.family) target.family = structuredClone(p.person.family);
	if (p.person.bonds) target.bonds = structuredClone(p.person.bonds);
	const omitted = Object.keys(p.person.skills).filter(
		(k) => !own || k !== "repair",
	);
	for (const skill of omitted) delete p.person.skills[skill];
	// Bind only the source person's self-reference. Recorded words and source action tokens stay exact.
	if (!own)
		for (const episode of p.person.episodes)
			if (episode.actorId === "rafi") episode.actorId = "ravi";
	if (omitted.length)
		p.person.limitations.push(
			`Kitchen skills stay in the source archive and grant no town qualification: ${omitted.join(", ")}.`,
		);
	return admitCalendarPersona(p, target, {
		mappingVersion: own ? "neighbours-calendar/1" : "pass-kitchen-calendar/1",
		sourceId: own ? "ravi" : "rafi",
		targetId: "ravi",
		targetNorms: p.calendar.norms,
	}).person;
}
