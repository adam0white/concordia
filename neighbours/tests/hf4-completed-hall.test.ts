/** Isolated current physical boundary and UI projection. This replaces the
 * old forty-day conditional HF3 scene search without claiming a natural hall. */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import DayComparison from "../src/ui/DayComparison.tsx";
import { createRuntime } from "./current-town.ts";

it("refuses tool donation at completed repairs without spending allowance and disables comparison before a branch starts", () => {
	const runtime = createRuntime(42, 6);
	runtime.s.hall = 12;
	expect(runtime.s.controls).toBe(3);
	const before = runtime.export();
	expect(() => runtime.intervene({ kind: "lend-tools" })).toThrow();
	expect(runtime.export()).toEqual(before);
	const town = runtime.view();
	expect(town.canLendTools).toBe(false);
	const html = renderToStaticMarkup(
		createElement(DayComparison, {
			town,
			busy: false,
			progress: "",
			error: "",
			selected: "",
			onRun: () => {},
		}),
	);
	expect(html).toMatch(
		/<option[^>]*(?:value="lend-tools"[^>]*disabled=""|disabled=""[^>]*value="lend-tools")/,
	);
	expect(html).toContain("Shared tools cannot be added right now");
	expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Compare from here/);
	expect(html).not.toContain("Cancel comparison");
	expect(html).not.toContain("Resources and neighbour state at the end");
	expect(html).not.toContain('role="alert"');
});
