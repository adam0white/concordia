import { describe, expect, it, vi } from "vitest";
import { RuntimePort } from "../src/bridge-port.ts";
import { compareTown } from "../src/comparison.ts";
import type { Intervention } from "../src/contracts.ts";
import type { PythonSession } from "../src/python-session.ts";

describe("comparison input boundary", () => {
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
		"accepts 672 rounds and the %s kind at the checkpoint boundary",
		async (kind) => {
			const port = new RuntimePort(42, 8);
			const py: PythonSession = {
				runPythonAsync: vi.fn().mockRejectedValue(Error("snapshot reached")),
				globals: { set: vi.fn() },
			};
			await expect(
				compareTown(py, port, { kind, eventId: "cycle-one" }, 672),
			).rejects.toThrow("snapshot reached");
			expect(py.runPythonAsync).toHaveBeenCalledWith(
				"json.dumps(town_engine.save())",
			);
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
