import type { Offer } from "@adam0white/human-framework";
import { MINUTE, nativeMilliseconds } from "./hf4-run.ts";
import type { Affordance } from "./host-types.ts";

/** The host maps physical possibilities and expected benefits; HF evaluates them. */
export function nativeOffer(person: string, offer: Affordance): Offer {
	return {
		id: offer.id,
		actionId: offer.action,
		label: offer.label,
		person,
		durationMs: nativeMilliseconds(offer.duration),
		...(offer.targetId ? { target: offer.targetId } : {}),
		...(offer.placeId ? { place: offer.placeId } : {}),
		participants: offer.with ?? [],
		alongside: offer.alongside ?? [],
		demands: {
			effort: offer.effort,
			focus: offer.focus ?? 0,
			mode: offer.mode ?? "awake",
			requires: offer.requires ?? {},
			...(offer.skill
				? {
						skill: {
							id: offer.skill.id,
							difficulty: offer.skill.difficulty,
							domain:
								offer.skill.domain === "knowledge" ? "knowledge" : "motor",
						},
					}
				: {}),
		},
		tags: offer.tags ?? [],
		norms: offer.norms ?? [],
		expected: {
			needs: offer.advertises,
			...(offer.material === undefined ? {} : { material: offer.material }),
			...(offer.risk ? { risk: offer.risk } : {}),
			followedBy: [],
			provenance: ["neighbours-physical-rules"],
		},
		...(offer.methodContext ? { methodContext: offer.methodContext } : {}),
		fulfills: offer.fulfills ?? [],
		advances: offer.advances ?? [],
		diminishes: offer.diminishes ?? [],
	};
}

export function physicalOffer(
	offer: import("@adam0white/human-framework").DeepReadonly<Offer>,
): Affordance {
	return {
		id: offer.id,
		action: offer.actionId,
		label: offer.label,
		...(offer.place ? { placeId: offer.place } : {}),
		...(offer.target ? { targetId: offer.target } : {}),
		duration: offer.durationMs / MINUTE,
		effort: offer.demands.effort,
		focus: offer.demands.focus,
		mode: offer.demands.mode,
		advertises: structuredClone(offer.expected.needs),
		...(offer.expected.material === undefined
			? {}
			: { material: offer.expected.material }),
		tags: [...offer.tags],
		norms: offer.norms,
		fulfills: [...offer.fulfills],
		advances: [...offer.advances],
		diminishes: [...offer.diminishes],
		alongside: [...offer.alongside],
		with: [...offer.participants],
		...(offer.methodContext ? { methodContext: offer.methodContext } : {}),
	};
}
