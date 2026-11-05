import { describe, expect, it } from "vitest";
import {
	benchWindow,
	validateBenchProposal,
} from "../src/core/bench-window.ts";

describe("typed main-bench proposals", () => {
	it("accepts only the bounded premise, never permission or arbitrary times", () => {
		expect(
			validateBenchProposal({
				schema: "neighbours-bench-proposal@1",
				kind: "bench-window",
				slot: "soon",
			}),
		).toBe("soon");
		for (const value of [
			{
				schema: "neighbours-bench-proposal@1",
				kind: "bench-window",
				slot: { toString: () => "soon" },
			},
			null,
			[],
			{
				schema: "neighbours-bench-proposal@1",
				kind: "bench-window",
				slot: "soon",
				agreed: true,
			},
			{
				schema: "neighbours-bench-proposal@1",
				kind: "bench-window",
				slot: "forever",
			},
		])
			expect(() => validateBenchProposal(value)).toThrow();
	});
	it("reserves time for asking and a reply, never outside workshop hours", () => {
		expect(benchWindow(480, "soon")).toEqual({ from: 525, until: 765 });
		expect(benchWindow(1050, "soon")).toEqual({ from: 1920, until: 2160 });
		expect(benchWindow(600, "tomorrow")).toEqual({ from: 1920, until: 2160 });
	});
	it("keeps a brief window too short for the one-hour repair", () => {
		const window = benchWindow(600, "brief");
		expect(window.until - window.from).toBe(30);
		expect(window.from).toBe(645);
	});
	it("rejects invalid clocks instead of normalizing imported premises", () => {
		for (const now of [-1, Infinity, NaN, 480 + 1 / 7])
			expect(() => benchWindow(now, "soon")).toThrow();
	});
});

it("preserves an actual millisecond ingress in the physical window", () => {
	const now = 480 + 1 / 60000;
	expect(benchWindow(now, "soon").from).toBe(now + 45);
});
