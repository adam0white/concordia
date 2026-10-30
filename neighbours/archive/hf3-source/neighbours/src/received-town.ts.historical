/** Receiving entry for an explicit Pass13 source. Existing chapters use the unchanged core entry.
 * A Pass chapter is validated against its complete pinned initial people before physical restore.
 * Core decisions do not read chapter metadata; retain it on export without altering core semantics.
 */
import { ENGINE_VERSION, restore, snapshot } from "@adam0white/human-framework";
import {
	canonicalCast,
	canonicalPersona,
	type LifePreparation,
	lifeAdmission,
} from "@adam0white/lab-client";
import { RuntimePort } from "./bridge-port.ts";
import type { TownRuntime } from "./contracts.ts";
import { CAST_EDITION, CAST_RULES, HOST_CAST } from "./core/canonical-cast.ts";
import { type CastChapter, prepareTownCast } from "./core/cast-continuity.ts";
import { restoreRuntime, type Save } from "./core/index.ts";
import { admitPassRafi, isPassInput } from "./pass-rafi.ts";
import { validateReceivingPersona } from "./persona-protocol.ts";

export function prepareReceivingTownCast(
	seed: number,
	population: number,
	inputs: LifePreparation[],
): Save {
	const pass = inputs.filter(isPassInput);
	if (!pass.length) return prepareTownCast(seed, population, inputs);
	if (
		pass.length !== 1 ||
		new Set(inputs.map((i) => i.parent.castId)).size !== inputs.length
	)
		throw Error("Duplicate receiving person.");
	const save = prepareTownCast(
		seed,
		population,
		inputs.filter((i) => !isPassInput(i)),
	);
	const input = pass[0];
	const resident = save.people.find((r) => r.person.id === "ravi");
	if (!input || !resident) throw Error("Allocated Pass Rafi absent from town.");
	resident.person = admitPassRafi(input, resident.person);
	const life = lifeAdmission(input, "neighbours");
	resident.description += ` ${life.line} Memories that cannot be used here remain in the source archive.`;
	resident.place = life.startsAtHome
		? "homes"
		: input.life.place === "public-garden"
			? "garden"
			: resident.place;
	resident.person.agenda.goals.push({
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
		resident.person.memory.episodes.push({
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
	return save;
}

function validateReceivingChapter(
	chapter: CastChapter,
	seed: number,
	population: number,
) {
	if (
		chapter.edition !== CAST_EDITION ||
		chapter.mapping !== "neighbours-calendar/1" ||
		!Array.isArray(chapter.inputs) ||
		chapter.inputs.length > 6 ||
		!Array.isArray(chapter.claims) ||
		chapter.claims.length !== chapter.inputs.length ||
		new Set(chapter.inputs.map((i) => i.parent.castId)).size !==
			chapter.inputs.length ||
		new Set(chapter.claims.map((c) => c.castId)).size !== chapter.claims.length
	)
		throw Error("Unsupported receiving chapter. Start fresh.");
	for (const [i, input] of chapter.inputs.entries()) {
		const parent = validateReceivingPersona(input.parent);
		const claim = validateReceivingPersona(chapter.claims[i]);
		const { revision: parentRevision, ...body } = parent;
		const { revision: _revision, ...claimedBody } = claim;
		if (
			claim.source.game !== "neighbours" ||
			claim.source.engine !== ENGINE_VERSION ||
			claim.source.rules !== CAST_RULES ||
			canonicalPersona(claim.source) !==
				canonicalPersona(chapter.claims[0]?.source) ||
			canonicalPersona(claimedBody) !==
				canonicalPersona({
					...body,
					parentRevision,
					source: claim.source,
					transfer: { ...body.transfer, life: input.life },
				})
		)
			throw Error("Unbound initial claim.");
	}
	const expected = prepareReceivingTownCast(seed, population, chapter.inputs);
	if (
		Object.keys(chapter.initial).sort().join() !==
		Object.values(HOST_CAST).sort().join()
	)
		throw Error("Incomplete initial cast.");
	for (const resident of expected.people.filter((r) => r.known)) {
		const id = HOST_CAST[resident.person.id as keyof typeof HOST_CAST];
		if (
			canonicalPersona(snapshot(restore(chapter.initial[id]))) !==
			canonicalPersona(snapshot(resident.person))
		)
			throw Error("Pinned initial actor differs from its admitted source.");
	}
}

export function restoreReceivingRuntime(value: unknown): TownRuntime {
	const incoming = value as Save | undefined;
	if (
		!Array.isArray(incoming?.chapter?.inputs) ||
		!incoming.chapter.inputs.some(isPassInput)
	)
		return restoreRuntime(value);
	const chapter = structuredClone(incoming.chapter);
	validateReceivingChapter(chapter, incoming.seed, incoming.people.length);
	const physical = { ...incoming };
	delete physical.chapter;
	const runtime = restoreRuntime(physical);
	const physicalExport = runtime.export.bind(runtime);
	runtime.export = () => ({
		...(physicalExport() as Save),
		chapter: structuredClone(chapter),
	});
	return runtime;
}

/** Both browser Pyodide and the native JSON-lines bridge use this exact receiving boundary. */
export class ReceivingRuntimePort extends RuntimePort {
	override dispatch(request: Record<string, unknown>): unknown {
		if (request.op !== "restore") return super.dispatch(request);
		this.runtime = restoreReceivingRuntime(request.save);
		return null;
	}
}
