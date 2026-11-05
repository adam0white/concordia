import { expect, it } from "vitest";
import { inkBox, inkCircle, inkLine, jitter, seeded } from "../src/ui/ink";
import { needWords, trustWords, urgencyWord } from "../src/ui/person-status";

it("draws the same ink for the same key without Math.random", () => {
	const random = Math.random;
	Math.random = () => {
		throw Error("ink must not use Math.random");
	};
	try {
		const line = inkLine("hall:door", [
			[0, 0],
			[40, 10],
		]);
		expect(
			inkLine("hall:door", [
				[0, 0],
				[40, 10],
			]),
		).toBe(line);
		expect(
			inkLine("quay:door", [
				[0, 0],
				[40, 10],
			]),
		).not.toBe(line);
		expect(inkBox("a", 0, 0, 30, 20)).toEqual(inkBox("a", 0, 0, 30, 20));
		expect(seeded("x")()).toBe(seeded("x")());
		for (let i = 0; i < 50; i++) {
			const value = jitter("k", i);
			expect(value).toBeGreaterThanOrEqual(-1);
			expect(value).toBeLessThanOrEqual(1);
		}
	} finally {
		Math.random = random;
	}
});

it("keeps a jittered marker ring inside its 22-unit hit circle", () => {
	for (const id of ["ada", "lea", "sam", "jo", "ravi", "noor", "musa", "kit"]) {
		const numbers = inkCircle(id, 0, 0, 14, 0.07)
			.replace(/[MQZ]/g, " ")
			.trim()
			.split(/\s+/)
			.map(Number);
		for (let i = 0; i < numbers.length; i += 2)
			expect(
				Math.hypot(numbers[i] ?? 0, numbers[i + 1] ?? 0),
			).toBeLessThanOrEqual(15.1);
	}
});

it("words inner state instead of showing meters or percentages", () => {
	expect(needWords({ food: 0.9, sleep: 0.6, leisure: 0.1 })).toBe(
		"This person looks very hungry and sleepy.",
	);
	expect(needWords({ food: 0.1 })).toBe(
		"This person looks calm. No need seems urgent.",
	);
	expect(urgencyWord(0.3)).toBe("noticed");
	expect(trustWords(0.8)).toBe("This person trusts this person deeply");
	expect(`${needWords({ belonging: 0.7 })}${trustWords(0.1)}`).not.toMatch(
		/\d|%/,
	);
});
