import { describe, expect, it } from "vitest";
import { forkRuntime } from "../src/core/fork.ts";
import { createRuntime, restoreRuntime } from "../src/core/index.ts";
import type { NativeTownArchive, Runtime } from "../src/core/runtime.ts";

describe("live host branches preserve the complete Run without archive admission", () => {
	it("matches strict cold continuation and isolates both futures including a pending boundary", () => {
		const live = createRuntime(42, 6);
		live.intervene({ kind: "lend-tools" });
		live.step();
		const checkpoint = live.export();
		const cold = restoreRuntime(checkpoint);
		const branch = forkRuntime(live);
		expect(branch.export()).toEqual(checkpoint);
		expect(branch.currentActors()).toEqual(live.currentActors());
		branch.intervene({ kind: "restore-bus" });
		cold.intervene({ kind: "restore-bus" });
		branch.step();
		cold.step();
		expect(branch.export()).toEqual(cold.export());
		expect(live.export()).toEqual(checkpoint);
		// A branch must also retain unresolved requests, witness state and queued inputs.
		const boundary = live.prepareBoundary();
		const pending = forkRuntime(live);
		expect(pending.export()).toEqual(live.export());
		for (const request of boundary.requests) {
			const action = live.choose(request.id);
			expect(pending.choose(request.id)).toEqual(action);
			live.apply(request.id, action);
			pending.apply(request.id, action);
		}
		expect(pending.prepareBoundary()).toEqual(live.prepareBoundary());
		expect(pending.export()).toEqual(live.export());
	}, 15000);
	it("detaches host metadata and queued observations from both siblings", () => {
		const live = createRuntime(42, 6) as Runtime;
		const before = live.export();
		const a = forkRuntime(live),
			b = forkRuntime(live);
		a.s.owner.queue({
			id: "fork-test",
			kind: "observation.received",
			at: a.s.owner.at + 1,
			source: { type: "host", id: "neighbours" },
			payload: { person: "ada", evidenceId: "fork-test", percepts: [] },
		});
		a.s.owner.allocate("test");
		const person = a.s.people[0];
		if (!person) throw Error("Missing resident");
		person.wealth += 1;
		expect(live.export()).toEqual(before);
		expect(b.export()).toEqual(before);
	});
	it("refuses archives as live branches and leaves strict tamper rejection intact", () => {
		const live = createRuntime(42, 6);
		const packet = live.export() as NativeTownArchive;
		expect(() => forkRuntime(packet as unknown as Runtime)).toThrow(
			"live town",
		);
		const person = packet.physical.people[0];
		if (!person) throw Error("Missing resident");
		person.wealth++;
		expect(() => restoreRuntime(packet)).toThrow("replay differs");
	});
});
