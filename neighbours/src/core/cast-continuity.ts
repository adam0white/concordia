/** Scope: current receiving preparation. Published client0.5.8 has no Neighbours
 * target roles. A valid source passport is preserved and refused before any write.
 * Historical calendar/person mutation adapters are archived with their HF3 science.
 */
import {
	type LifePreparation,
	type PersonaEnvelope,
	portablePersonRole,
} from "@adam0white/lab-client";
import type { NativeActor } from "./host-types.ts";
import { restoreRuntime } from "./restore.ts";
import type { NativeTownArchive } from "./runtime.ts";
import { createRuntime } from "./scenario.ts";
export interface CastChapter {
	edition: string;
	inputs: LifePreparation[];
	claims: PersonaEnvelope[];
	initial: Record<string, NativeActor>;
	mapping: string;
}
export const HEARSAY_ROLES = {
	"hf.cast.derya.stairwell": "derya",
	"hf.cast.ece.murmur": "ece",
} as const;
export function admitTownPerson(
	input: LifePreparation,
	_target?: NativeActor,
): never {
	portablePersonRole(input.parent, "neighbours");
	throw Error(
		"The published Neighbours Run admission mapping is unavailable. Continue or export the source chapter.",
	);
}
export function prepareTownCast(
	seed: number,
	population: number,
	inputs: LifePreparation[],
): NativeTownArchive {
	for (const input of inputs) admitTownPerson(input);
	return createRuntime(seed, population).export() as NativeTownArchive;
}
export function validateCastChapter(): never {
	throw Error(
		"Historical cast chapters cannot continue in HF4. Keep their export and start a fresh town.",
	);
}
export interface PreparedTown {
	format: "neighbours-prepared/1";
	sourceRevisions: string[];
	candidate: NativeTownArchive;
}
/** SDK admission callbacks await this complete durable host preparation. It is
 * preparation, not an ownership claim or source retirement acknowledgement.
 */
export async function prepareIncomingTownDurably(
	seed: number,
	population: number,
	inputs: LifePreparation[],
	persist: (value: PreparedTown) => Promise<void>,
	isCurrent: () => boolean,
): Promise<NativeTownArchive> {
	if (!isCurrent()) throw Error("Run changed before receiving preparation");
	const candidate = prepareTownCast(seed, population, inputs);
	restoreRuntime(candidate);
	const pinned: PreparedTown = {
		format: "neighbours-prepared/1",
		sourceRevisions: inputs.map((input) => input.parent.revision),
		candidate,
	};
	if (!isCurrent())
		throw Error("Run changed before durable receiving preparation");
	await persist(structuredClone(pinned));
	if (!isCurrent())
		throw Error("Run changed during durable receiving preparation");
	return candidate;
}
