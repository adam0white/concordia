import { expect, it } from "vitest";
import { nativeMilliseconds } from "../src/core/hf4-run.ts";
import { required } from "../src/core/invariants.ts";
import { createRuntime } from "./current-town.ts";

it("returns nonzero physical reservations once when a journey is interrupted before arrival", () => {
	const runtime = createRuntime(42, 6),
		resident = runtime.actor("ada");
	const destination = required(
		runtime.s.places.find((place) => place.id === "workshop"),
		"Missing workshop",
	);
	const market = required(
		runtime.s.places.find((place) => place.id === "market"),
		"Missing market",
	);
	const original = {
		tools: runtime.s.tools,
		stock: market.stock,
		wealth: resident.wealth,
		reserved: destination.reserved,
	};
	// Isolated host resource fixture. Native cognition is neither edited nor replaced.
	runtime.s.tools -= 1;
	market.stock -= 2;
	resident.wealth -= 2;
	destination.reserved++;
	resident.job = {
		personId: resident.id,
		activityId: "physical-resource-fixture",
		startedAt: nativeMilliseconds(runtime.s.now),
		offer: {
			id: "repair",
			action: "repair",
			label: "Repair the hall",
			placeId: "workshop",
			duration: 60,
			effort: 0.5,
			advertises: {},
		},
		from: resident.place,
		arrive: runtime.s.now + 15,
		end: runtime.s.now + 60,
		event: runtime.event(
			"started",
			"A physical resource fixture reserved one tool and two food.",
			resident.id,
			"workshop",
		),
		food: 2,
		tools: 1,
	};
	const origin = resident.place;
	runtime.interruptJob(resident.id);
	expect(resident.place).toBe(origin);
	expect(resident.job).toBeUndefined();
	expect({
		tools: runtime.s.tools,
		stock: market.stock,
		wealth: resident.wealth,
		reserved: destination.reserved,
	}).toEqual(original);
	const interrupted = runtime.s.events.filter(
		(event) => event.kind === "interrupted",
	);
	expect(interrupted).toHaveLength(1);
	expect(required(interrupted[0], "Missing interruption").text).toContain(
		"on the way",
	);
	runtime.interruptJob(resident.id);
	expect({
		tools: runtime.s.tools,
		stock: market.stock,
		wealth: resident.wealth,
		reserved: destination.reserved,
	}).toEqual(original);
	expect(
		runtime.s.events.filter((event) => event.kind === "interrupted"),
	).toEqual(interrupted);
});
it("handles a public lifecycle death and releases the actual physical job exactly once", () => {
	const runtime = createRuntime(42, 6);
	runtime.step();
	const resident = runtime.s.people.find((person) => person.job);
	if (!resident?.job) throw Error("No actual physical job");
	const food = resident.job.food,
		tools = resident.job.tools;
	const beforeTools = runtime.s.tools;
	const beforeStock =
		runtime.s.places.find((place) => place.id === "market")?.stock ?? 0;
	// Explicit engineering host event. This does not claim a natural town death.
	runtime.s.owner.enqueue("lifecycle.received", {
		type: "death",
		person: { kind: "actor", id: resident.id },
		basis: {
			evidence: { kind: "evidence", id: "lifecycle-control:observed-death" },
			worldRevision: runtime.s.owner.revision,
		},
	});
	runtime.step();
	expect(runtime.s.owner.actor(resident.id).body.alive).toBe(false);
	expect(resident.job).toBeUndefined();
	expect(resident.lifeEvent?.kind).toBe("death");
	expect(runtime.s.tools).toBeGreaterThanOrEqual(beforeTools + tools);
	expect(
		runtime.s.places.find((place) => place.id === "market")?.stock,
	).toBeGreaterThanOrEqual(beforeStock + food);
	expect(runtime.s.pending).toEqual([]);
});
