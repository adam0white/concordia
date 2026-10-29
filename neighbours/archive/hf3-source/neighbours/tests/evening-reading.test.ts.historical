import assert from "node:assert/strict";
import { expect, it } from "vitest";
import type { TownEvent } from "../src/contracts.ts";
import type { EveningEvent } from "../src/core/evenings.ts";
import { createRuntime, type Save } from "../src/core/index.ts";
import { Runtime } from "../src/core/runtime.ts";
import { groupStories } from "../src/ui/observations.ts";
import {
	captureEveningReading,
	projectEveningReading,
} from "../src/ui/Stories.tsx";

// Scope: synthetic UI boundary sensitivity/purity. Actual unchanged native source and
// Ece/Derya/Nora trajectories use the immutable independently reviewed R1 proof.
function fixture() {
	const runtime = new Runtime(createRuntime(42).export() as Save);
	runtime.s.now = 1215;
	const event = (
		id: number,
		at: number,
		kind: string,
		text: string,
		actorId = "sam",
	): TownEvent => ({
		id,
		at,
		kind,
		text,
		actorId,
		placeId: "hall",
		causes: [],
		importance: 0.95,
	});
	const evening: EveningEvent = {
		id: "evening-0-meal",
		kind: "meal",
		organiserId: "sam",
		startsAt: 1080,
		endsAt: 1140,
		stage: "proposed",
		notice: event(
			100,
			600,
			"evening-proposed",
			"Sam invited neighbours to supper.",
		),
		replies: {
			noor: { heardAt: 615, reply: "accepted", attendedMinutes: 0 },
			elin: { heardAt: 630, reply: "declined", attendedMinutes: 0 },
			ada: {
				heardAt: 645,
				reply: "accepted",
				attendedMinutes: 0,
				attempted: true,
			},
		},
	};
	runtime.s.socialEvenings = {
		version: 1,
		openedAt: 480,
		lastCountAt: runtime.s.now,
		events: [evening],
	};
	const view = () => runtime.view();
	const story = () => {
		const retained = evening.result ?? evening.notice;
		assert(retained);
		const found = groupStories(view(), undefined).find((s) =>
			s.eventIds.includes(retained.id),
		);
		assert(found);
		return found;
	};
	const packet = () => ({
		schema: "neighbours/concordia@1",
		rounds: runtime.s.round,
		runtime: runtime.export(),
	});
	return { runtime, evening, event, view, story, packet };
}
it("reads only bound public host facts; acceptance/attempt/overlap do not invent delivery or methods", async () => {
	const f = fixture();
	let view = f.view(),
		story = f.story(),
		packet = f.packet();
	const before = JSON.stringify(packet);
	const read = projectEveningReading(packet, view, story);
	assert(read);
	expect(read.people.find((p) => p.id === "noor")?.lines.join(" ")).toContain(
		"Delivery unknown",
	);
	expect(
		read.people.find((p) => p.id === "noor")?.lines.join(" "),
	).not.toContain("Meal delivery recorded");
	expect(read.people.find((p) => p.id === "ada")?.lines.join(" ")).toContain(
		"Physical arrival unknown",
	);
	expect(read.people.find((p) => p.id === "elin")?.lines.join(" ")).toContain(
		"Declined",
	);
	expect(read.people.find((p) => p.id === "ravi")?.lines.join(" ")).toContain(
		"Later activity unknown",
	);
	expect(JSON.stringify(packet)).toBe(before);
	f.evening.stage = "closed";
	f.evening.result = f.event(
		110,
		1155,
		"evening-ended",
		"Ece ate with the host at Sam’s shared supper.",
	);
	f.evening.replies.noor = {
		heardAt: 615,
		reply: "accepted",
		attendedMinutes: 30,
		attempted: true,
		delivered: true,
	};
	f.evening.replies.ada = {
		heardAt: 645,
		reply: "accepted",
		attendedMinutes: 0,
		attempted: true,
		delivered: false,
	};
	f.runtime.s.events = [
		f.event(111, 1170, "completed", "Ece finished resting.", "noor"),
		f.event(112, 1185, "started", "Ece started to sleep.", "noor"),
		f.event(113, 1300, "started", "HIDDEN FUTURE", "noor"),
	];
	view = f.view();
	story = f.story();
	packet = f.packet();
	const closedBefore = JSON.stringify(packet);
	const delivered = projectEveningReading(packet, view, story);
	assert(delivered);
	const ece = delivered.people.find((p) => p.id === "noor")?.lines.join(" ");
	expect(ece).toContain("30 recorded minutes awake");
	expect(ece).toContain("Meal delivery recorded");
	expect(ece).toContain("Ece started to sleep");
	expect(ece).not.toContain("HIDDEN FUTURE");
	expect(
		delivered.people.find((p) => p.id === "ada")?.lines.join(" "),
	).toContain("Attendance ended without delivery");
	expect(JSON.stringify(packet)).toBe(closedBefore);
	// Projection must never inspect native Persons/body/knowledge/cast ownership.
	const hostOnly = {
		schema: packet.schema,
		runtime: new Proxy(packet.runtime as object, {
			get: (target, key) => {
				if (["people", "chapter", "rng"].includes(String(key)))
					throw Error("Private field read");
				return Reflect.get(target, key);
			},
		}),
	};
	expect(projectEveningReading(hostOnly, view, story)).toEqual(delivered);
	expect(
		projectEveningReading(
			{ ...packet, runtime: { ...packet.runtime, now: 1216 } },
			view,
			story,
		),
	).toBeUndefined();
	expect(
		projectEveningReading(
			{ ...packet, runtime: { ...packet.runtime, seed: 999 } },
			view,
			story,
		),
	).toBeUndefined();
	expect(
		projectEveningReading(packet, view, { ...story, eventIds: [999] }),
	).toBeUndefined();
	f.evening.kind = "class";
	f.evening.result = f.event(
		110,
		1155,
		"evening-ended",
		"Ece received a lesson.",
	);
	expect(
		projectEveningReading(f.packet(), f.view(), f.story())
			?.people.find((p) => p.id === "noor")
			?.lines.join(" "),
	).toContain("does not establish acquisition");
	delete f.evening.replies.noor?.delivered;
	expect(
		projectEveningReading(f.packet(), f.view(), f.story())
			?.people.find((p) => p.id === "noor")
			?.lines.join(" "),
	).toContain("No delivery recorded when the evening closed");
});
it("rejects changed-run/closed/advanced async captures and never publishes a stale reading", async () => {
	const f = fixture();
	let current = true;
	let finish!: (packet: unknown) => void;
	const pending = captureEveningReading(
		f.view(),
		f.story(),
		() =>
			new Promise((resolve) => {
				finish = resolve;
			}),
		() => current,
	);
	current = false;
	finish(f.packet());
	await expect(pending).rejects.toThrow(/changed|closed/);
	await expect(
		captureEveningReading(
			f.view(),
			f.story(),
			async () => f.packet(),
			() => true,
		),
	).resolves.toBeDefined();
	await expect(
		captureEveningReading(
			f.view(),
			f.story(),
			async () => ({
				...f.packet(),
				runtime: { ...f.packet().runtime, now: 1300 },
			}),
			() => true,
		),
	).rejects.toThrow(/settled|record/);
	let calls = 0;
	await expect(
		captureEveningReading(
			f.view(),
			f.story(),
			async () => {
				calls++;
				return f.packet();
			},
			() => false,
		),
	).rejects.toThrow(/changed|closed/);
	expect(calls).toBe(0);
});
