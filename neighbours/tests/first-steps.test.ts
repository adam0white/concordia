import { describe, expect, it } from "vitest";
import {
	firstStep,
	requestOutcome,
	restoredBaseline,
} from "../src/ui/first-steps";

describe("first steps follows the visitor's actual actions", () => {
	it("waits for selection, conversation and a new recorded answer", () => {
		const base = {
			enabled: true,
			selected: "",
			conversation: false,
			requestIds: [],
			knownIds: [],
		};
		expect(firstStep(base)).toBe("select");
		expect(firstStep({ ...base, selected: "ada" })).toBe("route");
		expect(
			firstStep({
				...base,
				selected: "ada",
				conversation: true,
				requestIds: [1],
				knownIds: [1],
			}),
		).toBe("request");
		expect(
			firstStep({
				...base,
				selected: "ada",
				conversation: true,
				requestIds: [1, 2],
				knownIds: [1],
			}),
		).toBe("answer");
		expect(firstStep({ ...base, enabled: false })).toBe(null);
	});
	it("restores only a compatible guide baseline and names actual request status", () => {
		const stored = JSON.stringify({ seed: 42, at: 480, ids: [1] });
		expect(restoredBaseline(stored, 42, 500, [1, 2])).toEqual([1]);
		expect(restoredBaseline(stored, 43, 500, [1, 2])).toBe(null);
		expect(restoredBaseline(stored, 42, 470, [1, 2])).toBe(null);
		expect(restoredBaseline(stored, 42, 500, [])).toBe(null);
		const full = JSON.stringify({
			seed: 42,
			at: 480,
			ids: [1, 2, 3, 4, 5, 6, 7, 8],
		});
		expect(restoredBaseline(full, 42, 500, [2, 3, 4, 5, 6, 7, 8, 9])).toEqual([
			1, 2, 3, 4, 5, 6, 7, 8,
		]);
		expect(
			restoredBaseline(full, 42, 500, [9, 10, 11, 12, 13, 14, 15, 16]),
		).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
		expect(requestOutcome("held")).toContain("waiting");
		expect(requestOutcome("refused")).toContain("refused");
		expect(requestOutcome("started")).toContain("not finished");
	});
});
