/** HF 4.17 native sleep and failed-inspection controls. Paired opportunity probes
 * remain unqualified under archive/hf415-qualified-source. Not whole-world proof. */
import { expect, it } from "vitest";
import { required } from "../src/core/invariants.ts";
import { createRuntime } from "./current-town.ts";
import { finishObserver, stepUntil } from "./producer-controls.ts";

it("leaves completed sleeping recovery to the actual native body", () => {
	const runtime = createRuntime(42, 6);
	expect(
		runtime.affordances("elin").some((offer) => offer.mode === "sleep"),
	).toBe(true);
	const observer = finishObserver(runtime);
	try {
		runtime.step();
		const body = runtime.s.owner.actor("elin").body;
		expect(body.asleep).toBe(true);
		stepUntil(
			runtime,
			() =>
				observer.finishes.some(
					(finish) =>
						finish.person === "elin" && finish.job.offer.mode === "sleep",
				),
			16,
		);
		const finish = required(
			observer.finishes.find(
				(finish) =>
					finish.person === "elin" && finish.job.offer.mode === "sleep",
			),
			"Missing actual sleep finish",
		);
		observer.assertNative(finish);
		expect(finish.outcome.status).toBe("completed");
		expect(finish.outcome.actual.psychological).not.toHaveProperty("sleep");
		expect(finish.outcome.actual.psychological).not.toHaveProperty("rest");
		expect(runtime.s.owner.actor("elin").body.sleepPressure).toBeLessThan(
			body.sleepPressure,
		);
		const learned = required(
			runtime.s.owner
				.actor("elin")
				.memory.expectations.find(
					(entry) => entry.key === finish.job.offer.action,
				),
			"Missing actual learned sleep expectation",
		);
		expect(learned.samples).toBeGreaterThan(0);
		expect(learned.needs.sleep).toBeDefined();
		expect(learned.needs.sleep).not.toBe(finish.job.offer.advertises.sleep);
	} finally {
		observer.stop();
	}
});

it("records an actual failed inspection with a closed hall and no native relief or goals", () => {
	const runtime = createRuntime(42, 6);
	const observer = finishObserver(runtime);
	try {
		stepUntil(
			runtime,
			() =>
				observer.finishes.some(
					(finish) =>
						finish.job.offer.action === "open-section" &&
						finish.outcome.status === "failed",
				),
			16,
		);
		const finish = required(
			observer.finishes.find(
				(finish) =>
					finish.job.offer.action === "open-section" &&
					finish.outcome.status === "failed",
			),
			"Missing real failed inspection; do not force the decision",
		);
		// The native offer/start checks precede claims about delivered relief.
		observer.assertNative(finish);
		expect(finish.job.offer.advertises).toEqual({});
		expect(finish.hallSafe).toBe(false);
		expect(finish.outcome.actual.psychological).toEqual({});
		expect(finish.outcome.fulfills).toEqual([]);
		expect(finish.outcome.advances).toEqual([]);
	} finally {
		observer.stop();
	}
});
