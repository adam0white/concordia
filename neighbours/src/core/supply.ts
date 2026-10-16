import { keyed } from "./hash.ts";

/** Finite outside provisioning: about three meals/person/day, in four-hour lots.
 * A meal restores .65 satiety; HF's awake resting metabolism uses .0008/minute,
 * plus exertion. This budget permits ordinary meals and some waste, not immunity
 * to access failures. Garden/quay production remains separately conserved.
 */
export function scheduledFoodDelivery(
	seed: number,
	round: number,
	population: number,
	availableStock: number,
): number {
	if (round % 16 !== 0) return 0;
	const shipment = Math.ceil(
		population * (0.4 + 0.2 * keyed(seed, round, "food-delivery")),
	);
	return Math.max(0, Math.min(shipment, population * 6 - availableStock));
}
