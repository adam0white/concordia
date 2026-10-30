import { expect, it } from "vitest";
import { MixedPort } from "../src/experiments/mixed-native.ts";

it("refuses historical external policies before a provider or current town is invoked", () => {
	let calls = 0;
	for (const mode of ["live", "replay"] as const)
		expect(
			() =>
				new MixedPort(42, 6, "ada", mode, () => {
					calls++;
					throw Error("No provider call");
				}),
		).toThrow(/Historical external-policy/);
	expect(calls).toBe(0);
});
