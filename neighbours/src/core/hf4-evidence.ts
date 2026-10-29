import type { PerceptData } from "@adam0white/human-framework";
import { sha256 } from "@noble/hashes/sha2.js";
import { minutePercept, type TownRunOwner } from "./hf4-owner.ts";

type NativeAdvice = PerceptData["advice"][number];
export type HostObservation = Omit<
	PerceptData,
	| "id"
	| "occurredAt"
	| "claims"
	| "norms"
	| "advice"
	| "consequences"
	| "withdrawConsequences"
	| "witnesses"
	| "reports"
	| "provenance"
> & {
	at: number;
	claims?: PerceptData["claims"];
	norms?: PerceptData["norms"];
	advice?: readonly Omit<NativeAdvice, "adviceId">[];
	consequences?: PerceptData["consequences"];
};
/** Physical event evidence enters one Run; only its actual attention receipt counts as received. */
export function observeFacts(
	owner: TownRunOwner,
	person: string,
	observations: readonly HostObservation[],
): string[] {
	return observations.flatMap((observation) => {
		const { at, advice, ...data } = observation;
		const hash = Array.from(
			sha256(new TextEncoder().encode(JSON.stringify([person, observation]))),
			(byte) => byte.toString(16).padStart(2, "0"),
		).join("");
		const id = `host-observation:${hash}`;
		const percept = minutePercept(id, at, {
			...data,
			advice: (advice ?? []).map((item, i) => ({
				...item,
				adviceId: `${id}:advice:${i}`,
			})),
		});
		return owner.observe(person, percept) ? [id] : [];
	});
}
