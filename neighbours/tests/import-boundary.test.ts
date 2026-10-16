import { describe, expect, it } from "vitest";
import { createRuntime, restoreRuntime } from "../src/core/index.ts";
import type { Save } from "../src/core/state.ts";

function runningTown(): Save {
	const r = createRuntime(42, 208);
	r.step();
	return r.export() as Save;
}
describe("import physical integrity", () => {
	it("rejects impossible hall progress and invented tool totals", () => {
		for (const key of ["hall", "tools"] as const) {
			const s = runningTown();
			s[key] = key === "hall" ? 13 : 999;
			expect(() => restoreRuntime(s)).toThrow();
		}
	});
	it("rejects shortened travel even when both activity copies agree", () => {
		const s = runningTown();
		const r = s.people.find((p) => p.job && p.job.arrive > s.now);
		if (!r?.job || !r.person.activity) throw Error("Missing travelling actor");
		const travel = r.job.arrive - s.now;
		r.job.offer.duration -= travel;
		r.job.end -= travel;
		r.job.arrive = s.now;
		r.person.activity.affordance.duration = r.job.offer.duration;
		r.person.activity.endsAt = r.job.end;
		expect(() => restoreRuntime(s)).toThrow();
	});
	it("rejects injected learning or promise effects in both activity copies", () => {
		for (const key of ["skill", "fulfills", "with"] as const) {
			const s = runningTown();
			const r = s.people.find((p) => p.job);
			if (!r?.job || !r.person.activity) throw Error("Missing actor");
			if (key === "skill")
				r.job.offer.skill = { id: "invented-skill", difficulty: 0.9 };
			if (key === "fulfills") r.job.offer.fulfills = ["not-a-real-promise"];
			if (key === "with") r.job.offer.with = ["lea"];
			r.person.activity.affordance = structuredClone(r.job.offer);
			expect(() => restoreRuntime(s)).toThrow();
		}
	});
	it("keeps legitimate pre-bus journeys valid after the bus intervention", () => {
		const r = createRuntime(42, 208);
		r.step();
		r.intervene({ kind: "restore-bus" });
		const restored = restoreRuntime(r.export());
		for (let i = 0; i < 8; i++) {
			r.step();
			restored.step();
		}
		expect(restored.export()).toEqual(r.export());
	});
});
