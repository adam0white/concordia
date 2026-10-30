import { replay } from "@adam0white/human-framework";
import { expect, it } from "vitest";
import { required } from "../src/core/invariants.ts";
import type { NativeTownArchive } from "../src/core/runtime.ts";
import { createRuntime } from "../src/core/scenario.ts";

it("advances the actual host town through one Run and conserves physical resources", () => {
	const runtime = createRuntime(42, 6);
	runtime.step();
	const archive = runtime.export() as NativeTownArchive;
	expect(archive.physical.now).toBe(495);
	expect(Object.keys(archive.owner.run.current.people)).toHaveLength(6);
	expect(archive.physical.people).toHaveLength(6);
	expect(
		archive.physical.places.every(
			(place) => place.reserved >= 0 && place.reserved <= place.capacity,
		),
	).toBe(true);
	expect(
		archive.physical.places.find((place) => place.id === "market")?.stock,
	).toBeGreaterThanOrEqual(0);
	expect(archive.physical.tools).toBeGreaterThanOrEqual(0);
	expect(
		archive.physical.places.reduce((sum, place) => sum + place.stock, 0) +
			archive.physical.consumed +
			archive.physical.people.reduce(
				(sum, person) => sum + (person.job?.food ?? 0),
				0,
			),
	).toBe(archive.physical.initialFood + archive.physical.produced);
	expect(
		archive.physical.tools +
			archive.physical.people.reduce(
				(sum, person) => sum + (person.job?.tools ?? 0),
				0,
			),
	).toBe(3);
	expect(
		runtime.view().diagnostics.filter((item) => item.severity === "error"),
	).toEqual([]);
	const full = runtime.export() as NativeTownArchive;
	for (const resident of full.physical.people)
		if (resident.job) {
			const activity = required(
				full.owner.run.current.people[resident.id]?.activity,
				"Physical job lacks native activity",
			);
			expect(activity.startedAt).toBe(resident.job.startedAt);
			expect(activity.endsAt).toBe(Math.round(resident.job.end * 60000));
			expect(activity.startedAt % 60000).toBeGreaterThan(0);
		}
	expect(replay(JSON.parse(JSON.stringify(full.owner.run))).ok).toBe(true);
});
