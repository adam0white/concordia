/** Neighbours' finite passport map. Portable history is never inferred from a public profile.
 * Hearsay6 Derya/Ece and SmallWorks2 Nora/Sam/Rafi use explicit native calendar maps. Unknown source dialects refuse.
 * Unsupported memories/skills remain in the full source archive; no qualification is invented.
 */
import {
	admitCalendarPersona,
	DEFAULT_NORMS,
	type Person,
	restore,
	snapshot,
	validateCalendarPersona,
} from "@adam0white/human-framework";
import {
	canonicalCast,
	canonicalPersona,
	type LifePreparation,
	lifeAdmission,
	type PersonaEnvelope,
	preparePersonaLife,
} from "@adam0white/lab-client";
import {
	CAST_EDITION,
	CAST_RULES,
	HOST_CAST,
	roleFor,
} from "./canonical-cast.ts";
import { createRuntime } from "./scenario.ts";
import type { Save } from "./state.ts";

export interface CastChapter {
	edition: typeof CAST_EDITION;
	inputs: LifePreparation[];
	claims: PersonaEnvelope[];
	/** All six complete initial actors, including authored people without source heads. */
	initial: Record<string, Person>;
	mapping: "neighbours-calendar/1";
}
export const HEARSAY_ROLES = {
	"hf.cast.derya.stairwell": "derya",
	"hf.cast.ece.murmur": "ece",
} as const;
const ACTIONS = new Set([
	"pray",
	"pray-home",
	"pray-qada",
	"pray-eid",
	"eat",
	"drink",
	"tea",
	"sleep",
	"rest",
]);
export function admitTownPerson(
	input: LifePreparation,
	target: Person,
): Person {
	const { parent } = input;
	const cast = canonicalCast(parent.castId);
	const role = roleFor(parent.castId);
	if (parent.castRevision !== cast.revision || parent.terminal)
		throw Error(
			"Closed or old cast edition. Export the source or explicitly play a fresh local town.",
		);
	if (
		canonicalPersona(preparePersonaLife(parent, input.clockMs).life) !==
		canonicalPersona(input.life)
	)
		throw Error("Life input differs from its pinned clock.");
	// Only the batch helper's absent-head authored profile may use this dialect.
	if (parent.transfer.castPassport === "authored-cast/1")
		throw Error("A public profile is not a portable played history.");
	const own =
		parent.source.game === "neighbours" &&
		parent.transfer.castPassport === "neighbours-cast/1" &&
		parent.source.rules === CAST_RULES;
	const native = [
		{
			game: "hearsay",
			rules: "hearsay-cast-6",
			passport: "hearsay-cast/1",
			mapping: "hearsay-calendar/1",
			roles: HEARSAY_ROLES as Record<string, string>,
		},
		{
			game: "repair",
			rules: "canonical-workshop-2",
			passport: "workshop-cast/1",
			mapping: "workshop-calendar/1",
			roles: {
				"hf.cast.nora.smallworks": "nora",
				"hf.cast.sam.smallworks": "sam",
				"hf.cast.rafi.pass": "rafi",
			} as Record<string, string>,
		},
	].find(
		(d) =>
			parent.transfer.castPassport === d.passport &&
			((parent.source.game === d.game && parent.source.rules === d.rules) ||
				(parent.source.game === "neighbours" &&
					parent.source.rules === CAST_RULES &&
					parent.parentRevision !== null)),
	);
	const sourceRole = own ? role : native?.roles[parent.castId];
	const mapping = own ? "neighbours-calendar/1" : native?.mapping;
	if (
		(!own && !native) ||
		parent.source.engine !== "2.17.0" ||
		!sourceRole ||
		!mapping ||
		parent.transfer.sourceRole !== sourceRole
	)
		throw Error(
			"No registered semantic adapter for this source. Keep its archive or explicitly play a fresh local town.",
		);
	const p = validateCalendarPersona(parent.transfer.person);
	const c = parent.transfer.checkpoint as
		| { schema: unknown; sourceMinute: unknown; rng: unknown; sha256: unknown }
		| undefined;
	if (
		p.person.mappingVersion !== mapping ||
		p.person.source.id !== sourceRole ||
		!c ||
		c.schema !== p.person.source.schema ||
		c.sourceMinute !== p.person.source.now ||
		canonicalPersona(c.rng) !== canonicalPersona(p.person.rng) ||
		typeof c.sha256 !== "string" ||
		!/^[a-f0-9]{64}$/.test(c.sha256)
	)
		throw Error("Invalid native source receipt.");
	if (
		p.calendar.norms.some(
			(n) =>
				!DEFAULT_NORMS.some((k) => canonicalPersona(k) === canonicalPersona(n)),
		)
	)
		throw Error("Untrusted source norm meaning.");
	for (const duty of [...p.calendar.commitments, ...p.calendar.owed]) {
		if (
			[...duty.actions, ...(duty.violatedBy ?? [])].some((a) => !ACTIONS.has(a))
		)
			throw Error(
				"A source work or care duty has no town adapter. Finish or hand it over in its actual source.",
			);
		if (
			"toId" in duty &&
			duty.toId &&
			duty.toId !== "self" &&
			duty.toId !== sourceRole
		)
			throw Error("An obligation needs somebody still at source.");
		if (
			"targetId" in duty &&
			duty.targetId &&
			duty.targetId !== "self" &&
			duty.targetId !== sourceRole
		)
			throw Error("An obligation needs somebody still at source.");
		if ("toId" in duty && duty.toId === sourceRole) duty.toId = role;
		if ("targetId" in duty && duty.targetId === sourceRole)
			duty.targetId = role;
	}
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
	for (const owed of p.calendar.owed) {
		owed.at += offset;
		if (owed.lapseSince !== undefined) owed.lapseSince += offset;
	}
	if (p.calendar.lapse) p.calendar.lapse.since += offset;
	// Explicit zero-duration age/calendar translation, no healing or lived travel.
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
	if (omitted.length)
		p.person.limitations.push(
			`These skills have no equivalent here and remain in the source archive: ${omitted.join(", ")}. This person gains no new trade qualification.`,
		);
	return admitCalendarPersona(p, target, {
		mappingVersion: mapping,
		sourceId: sourceRole,
		targetId: role,
		targetNorms: p.calendar.norms,
	}).person;
}
export function prepareTownCast(
	seed: number,
	population: number,
	inputs: LifePreparation[],
): Save {
	const save = createRuntime(seed, population).export() as Save;
	for (const input of inputs) {
		const role = roleFor(input.parent.castId),
			r = save.people.find((r) => r.person.id === role);
		if (!r) throw Error("Allocated person absent from town.");
		r.person = admitTownPerson(input, r.person);
		const life = lifeAdmission(input, "neighbours");
		r.description += ` ${life.line} Memories that cannot be used here remain in the source archive.`;
		r.place = life.startsAtHome
			? "homes"
			: input.life.place === "public-garden"
				? "garden"
				: r.place;
		r.person.agenda.goals.push({
			id: `life:${input.life.clock.watermark}`,
			label: life.assignment,
			serves: ["competence"],
			importance: 0.25,
			progress: 0,
			status: "active",
			adoptedAt: 480,
			advancedBy: [
				{ action: life.availableForExtraWork ? "work" : "rest", amount: 0.25 },
			],
		});
		for (const id of input.life.notices) {
			const peer = canonicalCast(id);
			r.person.memory.episodes.push({
				id: `cast-note:${id}:${input.life.clock.watermark}`,
				at: 480,
				kind: "cast-notice",
				actorId: id,
				valence: 0,
				salience: 0.4,
				summary: `Read ${peer.name}’s public work note: ${peer.work}. Reading this note does not mean they have met or know each other.`,
				tags: ["social", "work"],
			});
		}
	}
	return save;
}
/** Pure validation on load. Never reads shelf or clock. */
export function validateCastChapter(
	value: CastChapter,
	seed: number,
	population: number,
) {
	if (
		value.edition !== CAST_EDITION ||
		value.mapping !== "neighbours-calendar/1" ||
		!Array.isArray(value.inputs) ||
		value.inputs.length > 6 ||
		!Array.isArray(value.claims) ||
		value.claims.length !== value.inputs.length ||
		new Set(value.inputs.map((i) => i.parent.castId)).size !==
			value.inputs.length ||
		new Set(value.claims.map((c) => c.castId)).size !== value.claims.length
	)
		throw Error("Unsupported cast chapter. Start fresh.");
	const expected = prepareTownCast(seed, population, value.inputs);
	const ids = Object.values(HOST_CAST);
	if (Object.keys(value.initial).sort().join() !== [...ids].sort().join())
		throw Error("Incomplete initial cast.");
	for (const r of expected.people.filter((r) => r.known)) {
		const id = HOST_CAST[r.person.id as keyof typeof HOST_CAST];
		const initial = restore(value.initial[id]);
		if (
			canonicalPersona(snapshot(initial)) !==
			canonicalPersona(snapshot(r.person))
		)
			throw Error("Pinned initial actor differs from its admitted source.");
	}
	for (const [i, claim] of value.claims.entries())
		if (
			claim.castId !== value.inputs[i]?.parent.castId ||
			claim.parentRevision !== value.inputs[i]?.parent.revision ||
			claim.source.game !== "neighbours"
		)
			throw Error("Unbound initial claim.");
}
