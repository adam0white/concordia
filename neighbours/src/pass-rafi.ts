/** Historical Pass13 bodies remain archived. No mutable Person admission in HF4. */
import type { LifePreparation } from "@adam0white/lab-client";
export const PASS_RAFI = "hf.cast.rafi.pass";
export function isPassInput(input: LifePreparation) {
	return input.parent.castId === PASS_RAFI;
}
export function passContinuationWitness(): never {
	throw Error(
		"Historical Pass13 continuation requires its original source runtime. Keep the export.",
	);
}
export function admitPassRafi(): never {
	throw Error(
		"Published client0.5.7 has no Neighbours receiving role. Continue or export the source chapter.",
	);
}
