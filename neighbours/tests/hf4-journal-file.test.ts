import { inspect } from "@adam0white/human-framework";
import { expect, it } from "vitest";
import { RuntimePort } from "../src/bridge-port.ts";
import { restoreRuntime } from "../src/core/restore.ts";
import type { Runtime } from "../src/core/runtime.ts";
import { decodeSave, encodeSave } from "../src/ui/save-codec.ts";
import { createRuntime } from "./current-town.ts";

// SCOPE: complete public journal files, not linked recording or a day/stress pass.
it("exports a complete journal file and restores every host/native/RNG field before useful continuation", async () => {
	const live = createRuntime(42, 6) as Runtime;
	for (let round = 0; round < 4; round++) live.step();
	const native = live.export();
	const port = new RuntimePort(42, 6);
	port.runtime = live;
	const journal = port.dispatch({ op: "save-journal" });
	expect(live.export()).toEqual(native);
	const file = await encodeSave(journal);
	const decoded = await decodeSave(file);
	const cold = restoreRuntime(decoded) as Runtime;
	expect(cold.export()).toEqual(native);
	const projected = inspect(live.s.owner.run, {
		perspective: { kind: "host" },
		people: Object.keys(native.owner.run.current.people),
		select: ["events"],
	});
	if (!projected.ok) throw Error(projected.error.message);
	expect(projected.value.events.length).toBeGreaterThan(
		native.owner.run.current.events.length,
	);
	let attended = 0;
	for (const person of projected.value.people)
		if (person.kind === "host")
			for (const part of person.parts)
				if (part.select === "events")
					for (const event of part.value)
						if (event.data.kind === "observation-attended") {
							const percept = event.data.perceptId;
							expect(cold.s.owner.attention(person.id, percept)).toBe(
								live.s.owner.attention(person.id, percept),
							);
							expect(cold.s.owner.attentionTime(person.id, percept)).toBe(
								live.s.owner.attentionTime(person.id, percept),
							);
							attended++;
						}
	expect(attended).toBeGreaterThan(0);
	live.step();
	cold.step();
	expect(cold.export()).toEqual(live.export());
	expect(live.export()).not.toEqual(native);
});

type ForgedJournal = {
	physical: { hall: number };
	owner: {
		journal: { chunks: unknown[]; head: { ordinal: number } };
		nextInput: number;
	};
	boundary: { projectedRevision: number };
};
const mutations: [string, (value: ForgedJournal) => void][] = [
	[
		"missing accepted history",
		(value) => {
			value.owner.journal.chunks = [];
		},
	],
	[
		"wrong committed head",
		(value) => {
			value.owner.journal.head.ordinal++;
		},
	],
	[
		"wrong owner counter",
		(value) => {
			value.owner.nextInput++;
		},
	],
	[
		"forged physical state",
		(value) => {
			value.physical.hall++;
		},
	],
	[
		"forged boundary",
		(value) => {
			value.boundary.projectedRevision++;
		},
	],
];
it.each(mutations)(
	"refuses %s without changing the live town",
	(_name, mutate) => {
		const port = new RuntimePort(77, 6);
		port.runtime.step();
		const before = port.runtime.export();
		const journal = port.dispatch({ op: "save-journal" }) as ForgedJournal;
		const forged = structuredClone(journal);
		mutate(forged);
		expect(() => restoreRuntime(forged)).toThrow();
		expect(port.runtime.export()).toEqual(before);
	},
);

it("applies the published closed journal schema before host replay", () => {
	const port = new RuntimePort(42, 6);
	const journal = port.dispatch({ op: "save-journal" }) as {
		owner: { journal: Record<string, unknown> };
	};
	journal.owner.journal.untrusted = undefined;
	expect(() => restoreRuntime(journal)).toThrow();
});
