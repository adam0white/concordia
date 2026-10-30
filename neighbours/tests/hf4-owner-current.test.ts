/** SCOPE: same-engine public current adoption. Complete archives remain the oracle
 * for all fields/order, history/RNG, cold restore and independent export freshness. */
import {
	createPerson,
	createRun,
	exportRun,
	exportRunJournal,
	inspect,
	readRunHistory,
	replay,
	restoreRun,
	step,
} from "@adam0white/human-framework";
import { expect, it } from "vitest";
import { minutePercept, TownRunOwner } from "../src/core/hf4-owner.ts";
import {
	authorResidents,
	createTownRun,
	need,
	townSpec,
} from "../src/core/hf4-run.ts";

it("reads all206 exact public fields once per unchanged transaction and isolates old readings", () => {
	const run = need(createRun(townSpec(42)));
	for (const person of structuredClone(authorResidents(42, 206))) {
		if (person.id === "elin") person.state.body.asleep = true;
		if (person.id === "sam")
			person.state.body.downed = {
				since: person.state.body.since,
				reason: "authored control",
			};
		need(createPerson(run, person));
	}
	const owner = new TownRunOwner(run),
		before = exportRun(run);
	const current = owner.current;
	expect(current).toStrictEqual(before.current);
	expect(Object.keys(current.people)).toHaveLength(206);
	expect(Object.keys(current.people)).toEqual(
		Object.keys(before.current.people),
	);
	for (const id of Object.keys(current.people))
		expect(owner.actor(id)).toBe(current.people[id]);
	expect(owner.current).toBe(current);
	expect(current.people.elin?.body.asleep).toBe(true);
	expect(current.people.sam?.body.downed).toBeDefined();
	expect(Object.hasOwn(current.people.ada ?? {}, "activity")).toBe(
		Object.hasOwn(before.current.people.ada ?? {}, "activity"),
	);
	expect(Reflect.set(current.world, "revision", 999)).toBe(false);
	expect(exportRun(run)).toStrictEqual(before);
	expect(
		inspect(run, {
			perspective: { kind: "person", observer: "ada" },
			people: [],
			select: ["current"],
		}).ok,
	).toBe(false);
	expect(() => owner.actor("missing")).toThrow("Unknown Run actor");
	owner.observe(
		"ada",
		minutePercept("below-floor-percept", owner.at / 60000, {
			channel: "told",
			actorId: "player",
			kind: "current-control",
			salience: 1,
			summary: "Explicit low-strength advice control.",
			advice: [
				{ adviceId: "below-floor-current", action: "rest", strength: 0.001 },
			],
		}),
	);
	owner.enqueue("lifecycle.received", {
		type: "death",
		person: { kind: "actor", id: "noor" },
		basis: {
			evidence: { kind: "evidence", id: "current-control-death" },
			worldRevision: owner.revision,
		},
	});
	owner.advance(owner.at + 1);
	expect(owner.current).toStrictEqual(exportRun(run).current);
	expect(owner.actor("noor").body.alive).toBe(false);
	expect(
		owner
			.actor("ada")
			.will.advice.some((a) => a.adviceId === "below-floor-current"),
	).toBe(true);
	expect(JSON.stringify(owner.inspect("ada", ["advice"]))).not.toContain(
		"below-floor-current",
	);
	const complete = owner.export().run;
	const priorCurrent = owner.current;
	need(step(run, { until: owner.at, inputs: [] }));
	expect(owner.current).not.toBe(priorCurrent);
	expect(owner.current).toStrictEqual(exportRun(run).current);
	expect(owner.export().run).not.toBe(complete);
	expect(owner.export().run).toStrictEqual(exportRun(run));
	expect(current).toStrictEqual(before.current);
	const cold = TownRunOwner.restore(owner.export());
	owner.advance(owner.at + 1);
	cold.advance(cold.at + 1);
	expect(cold.export()).toStrictEqual(owner.export());
}, 30000);

it("refreshes changed initial authoring and keeps public initial effective parameters exact", () => {
	const run = createTownRun(42, 6),
		owner = new TownRunOwner(run),
		initial = owner.current;
	const person = authorResidents(42, 7)[6];
	if (!person) throw Error("Missing author");
	need(createPerson(run, person));
	expect(Object.keys(owner.current.people)).toHaveLength(7);
	expect(owner.current).not.toBe(initial);
	expect(owner.current).toStrictEqual(exportRun(run).current);
	expect(owner.parameters).toStrictEqual(
		need(exportRunJournal(run)).opening?.initial.effective,
	);
	expect(owner.parameters).toStrictEqual(exportRun(run).initial.effective);
});

it("preserves exact millisecond order and64/65 receipt windows through external steps, rejection and cold replay", () => {
	const run = need(createRun(townSpec(42))),
		owner = new TownRunOwner(run),
		start = owner.at;
	for (let i = 1; i <= 65; i++) {
		need(
			step(run, {
				until: start + i,
				inputs: [
					{
						id: `current-world-${i}`,
						at: start + i,
						source: { type: "host", id: "neighbours" },
						kind: "world.changed",
						payload: {
							expectedRevision: i - 1,
							revision: i,
							put: [],
							remove: [],
							hostState: null,
						},
					},
				],
			}),
		);
		expect(owner.current).toStrictEqual(exportRun(run).current);
		expect(owner.at).toBe(start + i);
		if (i >= 64) {
			expect(owner.current.receipts.inputs).toHaveLength(64);
			expect(owner.accepted("current-world-1")).toBe(i === 64);
		}
	}
	const archive = owner.export().run,
		cold = need(restoreRun(archive));
	expect(need(replay(archive)).fullHash).toBe(archive.hashes.full);
	expect(() => owner.advance(start)).toThrow();
	expect(owner.export().run).toStrictEqual(archive);
	need(step(run, { until: start + 65, inputs: [] }));
	need(step(cold, { until: start + 65, inputs: [] }));
	expect(owner.current).toStrictEqual(exportRun(cold).current);
	expect(owner.export().run).toStrictEqual(exportRun(cold));
	expect(readRunHistory(owner.export().run)).toHaveLength(66);
});

// Authored grief is explicit synthetic state, not a natural town or clinical claim.
it("keeps exact optional active crisis and all206 actor fields through the public current selection", () => {
	const spec = townSpec(42),
		run = need(createRun(spec));
	for (const p of structuredClone(authorResidents(42, 206))) {
		p.state.affect.mood.valence = -1;
		p.state.affect.emotions = [
			{
				id: "grief",
				intensity: 1,
				cause: "explicit-current-control",
				since: spec.start,
				halfLifeMs: 7 * 24 * 60 * 60000,
			},
		];
		need(createPerson(run, p));
	}
	const owner = new TownRunOwner(run),
		before = owner.current;
	expect(Object.values(before.people).some((p) => p.affect.crisis.active)).toBe(
		false,
	);
	owner.advance(spec.start + 60000);
	expect(
		Object.values(owner.current.people).some((p) => p.affect.crisis.active),
	).toBe(true);
	expect(owner.current).toStrictEqual(exportRun(run).current);
	expect(Object.keys(owner.current.people)).toEqual(Object.keys(before.people));
	expect(Object.values(before.people).some((p) => p.affect.crisis.active)).toBe(
		false,
	);
}, 30000);
