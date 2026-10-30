/** Adversarial current-save controls. All valid inputs come from one real town;
 * forged physical receipts must fail before replacing that live town. */
import { beforeAll, expect, it } from "vitest";
import { required } from "../src/core/invariants.ts";
import type { NativeTownArchive } from "../src/core/runtime.ts";
import { createRuntime, restoreRuntime } from "./current-town.ts";

let live: ReturnType<typeof createRuntime>, baseline: NativeTownArchive;
beforeAll(() => {
	live = createRuntime(42, 6);
	live.step();
	baseline = live.export();
	expect(restoreRuntime(baseline).export()).toEqual(baseline);
});
const mutants: readonly [string, (packet: NativeTownArchive) => void][] = [
	[
		"impossible repair progress",
		(packet) => {
			packet.physical.hall = 13;
		},
	],
	[
		"invented tool stock",
		(packet) => {
			packet.physical.tools += 1;
		},
	],
	[
		"invented paid shift totals",
		(packet) => {
			required(packet.physical.people[0], "Missing resident").paidWork = {
				day: 0,
				starts: 3,
				minutes: 180,
				totalMinutes: 180,
			};
		},
	],
	[
		"shortened actual travel",
		(packet) => {
			const person = required(
				packet.physical.people.find(
					(person) =>
						person.job && person.job.arrive > person.job.startedAt / 60000,
				),
				"Missing actual trip",
			);
			const job = required(person.job, "Missing trip");
			job.arrive = job.startedAt / 60000;
		},
	],
	[
		"contact naming a different active event",
		(packet) => {
			const job = required(
				packet.physical.people.find((person) => person.job)?.job,
				"Missing job",
			);
			job.socialContacts = [{ otherId: "jo", event: job.event }];
		},
	],
	[
		"invented received event with a false source",
		(packet) => {
			const person = required(packet.physical.people[0], "Missing resident");
			person.received = [
				{
					id: 9000,
					at: packet.physical.now,
					kind: "question",
					text: "Forged remote question.",
					actorId: "ravi",
					targetId: person.id,
					placeId: "hall",
					causes: [],
					importance: 0.8,
				},
			];
		},
	],
	[
		"future journal event",
		(packet) => {
			packet.physical.events.push({
				id: packet.physical.nextEvent,
				at: packet.physical.now + 1,
				kind: "intervention",
				text: "Forged future receipt.",
				causes: [],
				importance: 0.8,
			});
		},
	],
	[
		"forged physical completion witness",
		(packet) => {
			packet.boundary.witnesses = [
				{ id: "ada", name: "Nora", place: "hall", idleSince: 0 },
			];
		},
	],
];
for (const [name, mutate] of mutants)
	it(`rejects ${name} and preserves the valid complete town`, () => {
		const forged = structuredClone(baseline);
		mutate(forged);
		expect(() => restoreRuntime(forged)).toThrow();
		expect(live.export()).toEqual(baseline);
	});
