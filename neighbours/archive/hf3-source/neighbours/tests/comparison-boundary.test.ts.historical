import { describe, expect, it, vi } from "vitest";
import { RuntimePort } from "../src/bridge-port.ts";
import { compareTown } from "../src/comparison.ts";
import type { Intervention } from "../src/contracts.ts";
import type { PythonSession } from "../src/python-session.ts";

describe("comparison input boundary", () => {
	it("rejects an unavailable intervention before running either hypothetical future", async () => {
		const port = new RuntimePort(42, 8);
		for (let i = 0; i < 3; i++) port.runtime.intervene({ kind: "lend-tools" });
		const before = structuredClone(port.runtime.export());
		const py = {
			runPythonAsync: vi
				.fn()
				.mockRejectedValue(Error("snapshot must not be reached")),
			globals: { set: vi.fn() },
		};
		await expect(
			compareTown(py, port, { kind: "lend-tools" }, 672),
		).rejects.toThrow("No intervention allowance remains");
		expect(py.runPythonAsync).not.toHaveBeenCalled();
		expect(port.runtime.export()).toEqual(before);
	});
	it("cancels before touching a live checkpoint when cancellation is already requested", async () => {
		const port = new RuntimePort(42, 8);
		const view = vi.spyOn(port.runtime, "view");
		const py = { runPythonAsync: vi.fn(), globals: { set: vi.fn() } };
		await expect(
			compareTown(
				py,
				port,
				{ kind: "lend-tools" },
				16,
				() => {},
				() => true,
			),
		).rejects.toThrow("Comparison cancelled");
		expect(view).not.toHaveBeenCalled();
		expect(py.runPythonAsync).not.toHaveBeenCalled();
	});
	it.each([673, 0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
		"rejects %s rounds before touching the live runtime or Python engine",
		async (rounds) => {
			const port = new RuntimePort(42, 8);
			const before = port.runtime.export();
			const view = vi.spyOn(port.runtime, "view");
			const py = { runPythonAsync: vi.fn(), globals: { set: vi.fn() } };
			await expect(
				compareTown(py, port, { kind: "lend-tools" }, rounds),
			).rejects.toThrow("1 and 672");
			expect(view).not.toHaveBeenCalled();
			expect(py.runPythonAsync).not.toHaveBeenCalled();
			expect(port.runtime.export()).toEqual(before);
		},
	);
	it.each(["open-evening-slot", "advertise-evening"] as const)(
		"rejects an unavailable %s target before Python advancement",
		async (kind) => {
			const port = new RuntimePort(42, 8);
			const py: PythonSession = {
				runPythonAsync: vi.fn().mockRejectedValue(Error("snapshot reached")),
				globals: { set: vi.fn() },
			};
			await expect(
				compareTown(py, port, { kind, eventId: "cycle-one" }, 672),
			).rejects.toThrow("Evening intervention is no longer available");
			expect(py.runPythonAsync).not.toHaveBeenCalled();
		},
	);
	it("rejects an unknown kind before Python or runtime access", async () => {
		const port = new RuntimePort(42, 8);
		const view = vi.spyOn(port.runtime, "view");
		const py = { runPythonAsync: vi.fn(), globals: { set: vi.fn() } };
		await expect(
			compareTown(py, port, { kind: "fake" } as unknown as Intervention, 672),
		).rejects.toThrow("Unknown comparison intervention");
		expect(view).not.toHaveBeenCalled();
		expect(py.runPythonAsync).not.toHaveBeenCalled();
	});
});
