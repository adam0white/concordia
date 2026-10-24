/** Canonical public profiles only. Secrets require actual chosen encounters. */
import { canonicalCast, castForGame } from "@adam0white/lab-client";
export const HOST_CAST = {
	ada: "hf.cast.nora.smallworks",
	elin: "hf.cast.derya.stairwell",
	sam: "hf.cast.sam.smallworks",
	jo: "hf.cast.bilal.rope",
	ravi: "hf.cast.rafi.pass",
	noor: "hf.cast.ece.murmur",
} as const;
export type CastRole = keyof typeof HOST_CAST;
export const ALLOCATION = castForGame("neighbours");
export const CAST_RULES = "neighbours-cast-1";
export const CAST_EDITION = "neighbours-cast/1";
export function roleFor(castId: string): CastRole {
	const role = (Object.keys(HOST_CAST) as CastRole[]).find(
		(r) => HOST_CAST[r] === castId,
	);
	if (!role) throw Error("This person has no Neighbours role.");
	return role;
}
export function canonicalOpening(id: string) {
	const cast = canonicalCast(HOST_CAST[id as CastRole]);
	return {
		name: cast.name,
		bornAt: -cast.age * 525600,
		sex: ["ada", "elin", "noor"].includes(id)
			? ("female" as const)
			: ("male" as const),
		traits: structuredClone(cast.traits),
		values: structuredClone(cast.values),
		relationships: [],
	};
}
