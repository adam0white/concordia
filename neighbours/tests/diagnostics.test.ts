import { describe, expect, it } from "vitest";
import { townDiagnostics } from "../src/core/diagnostics.ts";
import { createRuntime } from "../src/core/index.ts";
import type { Save } from "../src/core/state.ts";

describe("derived diagnostics", () => {
	it("catches conservation and clock defects without mutating its input", () => {
		const s = createRuntime(42, 8).export() as Save;
		s.tools = -1;
		if (s.places[0]) s.places[0].stock = 9;
		s.now += 15;
		const before = JSON.stringify(s);
		const codes = townDiagnostics(s).map((d) => d.code);
		expect(codes).toContain("CLOCK_DIVERGENCE");
		expect(codes).toContain("TOOL_CONSERVATION");
		expect(codes).toContain("FOOD_CONSERVATION");
		expect(JSON.stringify(s)).toBe(before);
	});
	it("keeps a valid delayed reopening distinct from an invariant failure", () => {
		const s = createRuntime(42, 8).export() as Save;
		s.hall = 12;
		const result = townDiagnostics(s);
		expect(result.some((d) => d.severity === "error")).toBe(false);
		expect(result.some((d) => d.code === "INSPECTION_PENDING")).toBe(true);
	});
});
