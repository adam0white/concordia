import { expect, it } from "vitest";
import { createRuntime, restoreRuntime } from "../src/core/index.ts";
import type { NativeTownArchive } from "../src/core/runtime.ts";

function checkpoint() {
	const runtime = createRuntime(42, 6);
	runtime.step();
	return runtime.export() as NativeTownArchive;
}
it("restores the complete town when JSON object keys are reordered", () => {
	const original = checkpoint();
	const reordered = JSON.parse(
		JSON.stringify(original, (_key, value) =>
			value && typeof value === "object" && !Array.isArray(value)
				? Object.fromEntries(
						Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
					)
				: value,
		),
	);
	expect(restoreRuntime(reordered).export()).toEqual(original);
});
it("still refuses a separately forged numeric advertisement", () => {
	const packet = checkpoint();
	const job = packet.physical.people.find((person) => person.job)?.job;
	if (!job) throw Error("Missing actual job");
	job.offer.advertises.competence = 0.31;
	expect(() => restoreRuntime(packet)).toThrow(/replay.*host rules/i);
});
it("refuses a missing array entry instead of skipping its value", () => {
	const packet = checkpoint();
	const job = packet.physical.people.find((person) => person.job)?.job;
	if (!job) throw Error("Missing actual job");
	job.offer.tags = new Array<string>(1);
	expect(() => restoreRuntime(packet)).toThrow();
});
it("keeps signed zero distinct in saved offer scalars", () => {
	const packet = checkpoint();
	const job = packet.physical.people.find(
		(person) => person.job?.offer.effort === 0,
	)?.job;
	if (!job) throw Error("Missing actual zero-effort activity");
	job.offer.effort = -0;
	expect(() => restoreRuntime(packet)).toThrow(/replay.*host rules/i);
});
