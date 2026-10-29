import { expect, it } from "vitest";
import { required } from "../src/core/invariants.ts";
import type { NativeTownArchive } from "../src/core/runtime.ts";
import { createRuntime, restoreRuntime } from "./current-town.ts";

it("rejects a forged advertised effect in both physical job and actual native activity without replacing the valid town", () => {
	const live = createRuntime(42, 6);
	live.step();
	const before = live.export() as NativeTownArchive;
	const forged = JSON.parse(JSON.stringify(before)) as {
		physical: NativeTownArchive["physical"];
		owner: {
			run: {
				current: {
					people: Record<
						string,
						{
							activity: {
								offer: { expected: { needs: Record<string, number> } };
							} | null;
						}
					>;
				};
			};
		};
	};
	const resident = required(
		forged.physical.people.find((person) => person.job),
		"Missing actual physical job",
	);
	const job = required(resident.job, "Missing job");
	const activity = required(
		forged.owner.run.current.people[resident.id]?.activity,
		"Missing actual native activity",
	);
	job.offer.advertises.competence = 99;
	activity.offer.expected.needs.competence = 99;
	expect(() => restoreRuntime(forged)).toThrow();
	expect(live.export()).toEqual(before);
	expect(restoreRuntime(before).export()).toEqual(before);
});

it("cold restores the complete host and Run at an unresolved physical boundary and continues exactly", () => {
	const live = createRuntime(42, 6);
	const boundary = live.prepareBoundary();
	expect(boundary.requests.length).toBeGreaterThan(0);
	const packet = JSON.parse(JSON.stringify(live.export())) as NativeTownArchive;
	const cold = restoreRuntime(packet);
	expect(cold.export()).toEqual(live.export());
	for (const request of boundary.requests) {
		live.apply(request.id, live.choose(request.id));
		cold.apply(request.id, cold.choose(request.id));
	}
	live.step();
	cold.step();
	expect(cold.export()).toEqual(live.export());
});
it("rejects forged physical offers, sparse arrays and signed zero before replacing a live town", () => {
	const live = createRuntime(42, 6);
	live.step();
	const packet = live.export() as NativeTownArchive;
	const resident = packet.physical.people.find((person) => person.job);
	expect(resident?.job).toBeDefined();
	if (!resident?.job) throw Error("Missing physical job");
	resident.job.offer.advertises.competence = 0.31;
	expect(() => restoreRuntime(packet)).toThrow(/replay|host rules/i);
	const sparse = live.export() as NativeTownArchive;
	const job = sparse.physical.people.find((person) => person.job)?.job;
	if (!job) throw Error("Missing job");
	job.offer.tags = new Array<string>(1);
	expect(() => restoreRuntime(sparse)).toThrow();
	const zero = live.export() as NativeTownArchive;
	zero.physical.hall = -0;
	expect(() => restoreRuntime(zero)).toThrow();
});

it("cold restores midway through actual simultaneous finishes with the original physical witnesses", () => {
	const live = createRuntime(42, 6);
	let found = false;
	for (let boundaryIndex = 0; boundaryIndex < 100; boundaryIndex++) {
		const boundary = live.prepareBoundary();
		const finishes = boundary.requests.filter(
			(request) => request.kind === "action" && request.stage === "finish",
		);
		if (finishes.length >= 2) {
			const first = required(finishes[0], "Missing actual finish");
			if (first.kind !== "action") throw Error("Expected action");
			const original = structuredClone(
				required(
					required(
						live.s.people.find((person) => person.id === first.person),
						"Missing actual resident",
					).job,
					"Missing actual finishing job",
				),
			);
			live.apply(first.id, live.choose(first.id));
			expect(
				required(
					live.s.people.find((person) => person.id === first.person),
					"Missing actual resident",
				).job,
			).toBeUndefined();
			const packet = live.export() as NativeTownArchive;
			expect(
				packet.boundary.witnesses.find((person) => person.id === first.person)
					?.job,
			).toEqual(original);
			const cold = restoreRuntime(JSON.parse(JSON.stringify(packet)));
			expect(cold.export()).toEqual(packet);
			for (const request of boundary.requests.filter(
				(request) => request.id !== first.id,
			)) {
				live.apply(request.id, live.choose(request.id));
				cold.apply(request.id, cold.choose(request.id));
			}
			live.step();
			cold.step();
			expect(cold.export()).toEqual(live.export());
			found = true;
			break;
		}
		for (const request of boundary.requests)
			live.apply(request.id, live.choose(request.id));
	}
	expect(found).toBe(true);
});
