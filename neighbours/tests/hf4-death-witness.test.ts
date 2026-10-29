import { readRunHistory } from "@adam0white/human-framework";
/** Host-authored lifecycle receipt, not a natural-death experiment. One actual
 * public Run supplies event-time bodies and observation attention. */
import { expect, it } from "vitest";
import { required } from "../src/core/invariants.ts";
import { createRuntime, restoreRuntime } from "./current-town.ts";
import { facultyProof } from "./faculty-proof.ts";

it("delivers one native death observation only to actual awake boundary witnesses and cold replays pending ingress", () => {
	const town = createRuntime(42, 6);
	const proof = facultyProof(town.s.owner, "death-witness");
	town.receiveLifecycle({
		type: "death",
		person: { kind: "actor", id: "ada" },
		basis: {
			evidence: { kind: "evidence", id: "death-control:observed" },
			worldRevision: town.s.owner.revision,
		},
	});
	const operation = required(
		town.export().inputs.find((input) => input.op === "lifecycle"),
		"Missing accepted lifecycle journal",
	);
	expect(operation.accepted).toMatchObject({
		person: "ada",
		evidenceId: "death-control:observed",
	});
	const beforeDuplicate = town.export();
	expect(() =>
		town.receiveLifecycle({
			type: "death",
			person: { kind: "actor", id: "ada" },
			basis: {
				evidence: { kind: "evidence", id: "duplicate-death" },
				worldRevision: town.s.owner.revision,
			},
		}),
	).toThrow(/already recorded/);
	expect(town.export()).toEqual(beforeDuplicate);
	const source = required(
		town.actor("ada").lifeEvent,
		"Missing actual death event",
	);
	expect(source.kind).toBe("death");
	const packet = town.export(),
		cold = restoreRuntime(packet);
	expect(cold.export()).toEqual(packet);
	const queued = packet.owner.queued.filter(
		(input) =>
			input.kind === "observation.received" &&
			input.payload.percepts.some((percept) => percept.kind === "death"),
	);
	expect(queued.length).toBeGreaterThan(0);
	for (const input of queued)
		if (input.kind === "observation.received")
			expect(input.payload.percepts[0]?.targetId).toBe("ada");
	town.step();
	cold.step();
	expect(cold.export()).toEqual(town.export());
	for (const input of queued)
		if (input.kind === "observation.received") {
			const percept = required(
				input.payload.percepts[0],
				"Missing death percept",
			);
			expect(percept.provenance).toContain(
				`native-death:${(operation.accepted as { eventId: string }).eventId}`,
			);
			expect(
				JSON.stringify(town.s.owner.inspect(input.payload.person, ["events"])),
			).toContain('"died":"ada"');
			expect(
				town.s.owner.attention(input.payload.person, percept.id),
			).toBeGreaterThan(0);
			expect(
				town
					.actor(input.payload.person)
					.received?.filter((event) => event.id === source.id),
			).toHaveLength(1);
		}
	expect(
		readRunHistory(town.s.owner.export().run)
			.flatMap((transaction) => transaction.inputs)
			.filter((input) => input.kind === "death.heard"),
	).toEqual([]);
	town.step();
	cold.step();
	expect(cold.export()).toEqual(town.export());
	const deathInputs = readRunHistory(town.s.owner.export().run)
		.flatMap((transaction) => transaction.inputs)
		.filter(
			(input) =>
				input.kind === "observation.received" &&
				input.payload.percepts.some((percept) => percept.kind === "death"),
		);
	expect(deathInputs).toHaveLength(queued.length);
	expect(
		town.s.events.filter(
			(event) => event.kind === "death" && event.actorId === "ada",
		),
	).toHaveLength(1);
	expect(
		queued.map((input) =>
			input.kind === "observation.received" ? input.payload.person : "",
		),
	).toEqual(["ravi"]);
	proof({
		packet,
		final: town.export(),
		coldFinal: cold.export(),
		operation,
	});
});

it("does not send death evidence to an actually sleeping colocated actor or awake remote actors", async () => {
	const { createRun, createPerson, replay } = await import(
		"@adam0white/human-framework"
	);
	const { TownRunOwner } = await import("../src/core/hf4-owner.ts");
	const { authorResidents, townSpec, need, MINUTE } = await import(
		"../src/core/hf4-run.ts"
	);
	const run = need(createRun(townSpec(42)));
	for (const authored of structuredClone(authorResidents(42, 6))) {
		if (authored.id === "elin") authored.state.body.asleep = true;
		need(createPerson(run, authored));
	}
	const town = createRuntime(42, 6),
		owner = new TownRunOwner(run);
	const proof = facultyProof(owner, "death-sleep-negative");
	// Explicit initial authoring faculty, before any native ingress. No native
	// body/time is edited after createPerson. This fixture is not default-town wire replay.
	town.s.owner = owner;
	town.s.now = owner.at / MINUTE;
	for (const person of town.s.people) person.owner = owner;
	expect(owner.actor("elin").body.asleep).toBe(true);
	town.receiveLifecycle({
		type: "death",
		person: { kind: "actor", id: "noor" },
		basis: {
			evidence: { kind: "evidence", id: "death-negative:observed" },
			worldRevision: owner.revision,
		},
	});
	town.prepareBoundary();
	expect(town.actor("noor").lifeEvent?.kind).toBe("death");
	expect(
		owner
			.export()
			.queued.filter(
				(input) =>
					input.kind === "observation.received" &&
					input.payload.percepts.some((percept) => percept.kind === "death"),
			),
	).toEqual([]);
	expect(replay(owner.export().run).ok).toBe(true);
	proof({ physical: town.export().physical });
});

it("rejects a forged death journal for a still-live actor and a false native source identity", () => {
	const town = createRuntime(42, 6),
		proof = facultyProof(town.s.owner, "death-provenance");
	town.receiveLifecycle({
		type: "death",
		person: { kind: "actor", id: "ada" },
		basis: {
			evidence: { kind: "evidence", id: "death-forgery-control" },
			worldRevision: town.s.owner.revision,
		},
	});
	const operation = required(
		town.export().inputs.find((input) => input.op === "lifecycle"),
		"Missing actual source",
	);
	const stillLive = createRuntime(42, 6),
		forged = stillLive.export();
	forged.inputs.push(structuredClone(operation));
	expect(() => restoreRuntime(forged)).toThrow();
	expect(stillLive.s.owner.actor("ada").body.alive).toBe(true);
	const forgedSource = town.export();
	const entry = required(
		forgedSource.inputs.find((input) => input.op === "lifecycle"),
		"Missing source",
	);
	entry.accepted = {
		...(entry.accepted as object),
		eventId: "forged-native-source",
	};
	expect(() => restoreRuntime(forgedSource)).toThrow();

	proof({ valid: town.export(), forged, forgedSource });
});
