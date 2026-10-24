import { expect, it } from "vitest";
import { RuntimePort } from "../src/bridge-port.ts";
import { stateHash } from "../src/core/hash.ts";

it("observes an actual finished action without changing offers, choices or the town", () => {
	const observed = new RuntimePort(42, 6),
		control = new RuntimePort(42, 6);
	observed.wanted.add("noor");
	for (let round = 0; round < 24 && !observed.boundaries.has("noor"); round++) {
		const a = observed.dispatch({ op: "prepare" }) as string[],
			b = control.dispatch({ op: "prepare" }) as string[];
		expect(a).toEqual(b);
		for (const actorId of a) {
			expect(observed.dispatch({ op: "offers", actorId })).toEqual(
				control.dispatch({ op: "offers", actorId }),
			);
			const actionId = observed.dispatch({ op: "choose", actorId });
			expect(actionId).toEqual(control.dispatch({ op: "choose", actorId }));
			observed.dispatch({ op: "apply", actorId, actionId });
			control.dispatch({ op: "apply", actorId, actionId });
		}
	}
	const actual = observed.boundaries.get("noor");
	if (!actual) throw Error("No real completed-action boundary");
	expect(actual.activity).toBeFalsy();
	expect(actual.nextDecision).toBeGreaterThan(0);
	expect(actual.now).toBeGreaterThan(480);
	expect(stateHash(observed.runtime.export())).toBe(
		stateHash(control.runtime.export()),
	);
});
