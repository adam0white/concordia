import { describe, expect, it } from "vitest";
import { MixedPort } from "../src/experiments/mixed-native.ts";

describe("native mixed policy response tape", () => {
	it("uses an actual external response and restores without calling provider", () => {
		let calls = 0;
		const provider = (prompt: string) => {
			calls++;
			const input = JSON.parse(prompt);
			return {
				rawResponse: JSON.stringify({
					contextId: input.contextId,
					action: input.choices[0].id,
					reason: "A legal test decision.",
				}),
				provenance: {
					provider: "test",
					models: ["test-model"],
					requestedModel: "test",
				},
			};
		};
		const a = new MixedPort(42, 8, "ada", "live", provider);
		const initial = a.dispatch({ op: "save" }) as Record<string, unknown>;
		for (const actorId of a.dispatch({ op: "prepare" }) as string[]) {
			const actionId = a.dispatch({ op: "choose", actorId });
			a.dispatch({ op: "apply", actorId, actionId });
		}
		const final = a.dispatch({ op: "save" }) as Record<string, unknown>;
		expect(calls).toBe(1);
		const b = new MixedPort(42, 8, "ada", "replay", () => {
			throw Error("Network must not run");
		});
		const replayStart = {
			...initial,
			mixed: { ...(final.mixed as object), cursor: 0 },
		};
		b.dispatch({ op: "restore", save: replayStart });
		for (const actorId of b.dispatch({ op: "prepare" }) as string[]) {
			const actionId = b.dispatch({ op: "choose", actorId });
			b.dispatch({ op: "apply", actorId, actionId });
		}
		expect(b.dispatch({ op: "save" })).toEqual(final);
		expect(
			b.port.runtime.view().people.find((p) => p.id === "ada")?.policy,
		).toBe("llm");
	});
	it("fails without fallback on malformed model output or missing replay", () => {
		for (const mode of ["live", "replay"] as const) {
			const a = new MixedPort(42, 8, "ada", mode, () => ({
				rawResponse: "not JSON",
				provenance: { provider: "test", models: ["x"], requestedModel: "test" },
			}));
			a.dispatch({ op: "prepare" });
			expect(() => a.dispatch({ op: "choose", actorId: "ada" })).toThrow();
		}
	});
});
