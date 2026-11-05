import {
	createPerson,
	exportRun,
	readRunHistory,
	step,
} from "@adam0white/human-framework";
import { expect, it } from "vitest";
import { minutePercept, TownRunOwner } from "../src/core/hf4-owner.ts";
import { authorResidents, createTownRun, need } from "../src/core/hf4-run.ts";
import { createRuntime, restoreRuntime } from "./current-town.ts";

// SCOPE: complete public immutable export reuse between actual Run transactions.
// Queue/lesson/counter metadata is still copied; no cheap partial live-state API.
it("reuses only the complete frozen public snapshot and refreshes after every accepted transaction", () => {
	const owner = new TownRunOwner(createTownRun(42, 6));
	const initial = owner.export();
	expect(initial.run).toEqual(exportRun(owner.run));
	expect(Object.isFrozen(initial.run)).toBe(true);
	expect(Object.isFrozen(initial.run.current.people.ada)).toBe(true);
	expect(owner.export().run).toBe(initial.run);
	owner.observe(
		"ada",
		minutePercept("cache-control", 480, {
			channel: "told",
			kind: "cache-control",
			salience: 0.85,
			summary: "A source-bound export cache control.",
		}),
	);
	const queued = owner.export();
	expect(queued.run).toBe(initial.run);
	expect(queued.queued.length).toBeGreaterThan(0);
	queued.queued.length = 0;
	expect(owner.export().queued.length).toBeGreaterThan(0);
	owner.advance(owner.at + 1);
	const accepted = owner.export();
	expect(accepted.run).not.toBe(initial.run);
	expect(accepted.run).toEqual(exportRun(owner.run));
	expect(accepted.run.hashes.full).not.toBe(initial.run.hashes.full);
	expect(owner.export().run).toBe(accepted.run);
	owner.exportJournal();
	owner.inspect("ada", ["events", "body"]);
	expect(owner.export().run).toBe(accepted.run);
	expect(owner.export().run).toEqual(exportRun(owner.run));
	expect(() => owner.advance(owner.at - 1)).toThrow();
	expect(owner.export().run).toBe(accepted.run);
	expect(owner.export().run).toEqual(exportRun(owner.run));
	const cold = TownRunOwner.restore(owner.export());
	expect(cold.export()).toEqual(owner.export());
	owner.advance(owner.at + 1);
	cold.advance(cold.at + 1);
	expect(cold.export()).toEqual(owner.export());
	expect(cold.export().run).toEqual(exportRun(cold.run));
});
it("keeps mutable complete town exports isolated from the cached native archive", () => {
	const live = createRuntime(42, 6);
	live.step();
	const before = live.export();
	const copy = live.export();
	const mutableNative = copy.owner.run.current as unknown as { at: number };
	mutableNative.at++;
	const resident = copy.physical.people[0];
	if (!resident) throw Error("Missing copied physical person");
	resident.wealth++;
	expect(live.export()).toEqual(before);
	const cold = restoreRuntime(live.export());
	live.step();
	cold.step();
	expect(cold.export()).toEqual(live.export());
});

it("invalidates for external public steps at the same time and changed initial authoring", () => {
	const run = createTownRun(42, 6);
	const owner = new TownRunOwner(run);
	const initial = owner.export().run;
	const author = authorResidents(42, 7)[6];
	if (!author) throw Error("Missing extra authored person");
	need(createPerson(run, author));
	const before = owner.export().run;
	expect(Object.keys(before.current.people)).toHaveLength(7);
	expect(before).not.toBe(initial);
	expect(before).toEqual(exportRun(run));
	need(step(run, { until: owner.at + 1, inputs: [] }));
	const advanced = owner.export().run;
	expect(advanced).not.toBe(before);
	expect(advanced).toEqual(exportRun(run));
	const count = readRunHistory(advanced).length;
	need(step(run, { until: owner.at, inputs: [] }));
	const sameTime = owner.export().run;
	expect(sameTime.current.at).toBe(advanced.current.at);
	expect(readRunHistory(sameTime)).toHaveLength(count + 1);
	expect(sameTime).not.toBe(advanced);
	expect(sameTime).toEqual(exportRun(run));
});
