import { required } from "../src/core/invariants.ts";
/** Synthetic physical invitation fixture; actual public Run attention and cold
 * continuation. This does not claim a natural canonical hall reopening. */

import { createPerson, createRun } from "@adam0white/human-framework";
import { expect, it } from "vitest";
import { shareEveningNotice } from "../src/core/evening-news.ts";
import {
	type EveningEvent,
	interveneEvening,
	settleEveningBroadcasts,
	updateEvenings,
} from "../src/core/evenings.ts";
import { TownRunOwner } from "../src/core/hf4-owner.ts";
import {
	authorResidents,
	MINUTE,
	need,
	townSpec,
} from "../src/core/hf4-run.ts";
import { Runtime } from "../src/core/runtime.ts";
import { createRuntime } from "./current-town.ts";

it("retains a spoken notice pending actual attention across cold continuation and never treats hearing as acceptance", () => {
	const runtime = createRuntime(42, 6),
		speaker = runtime.actor("ada"),
		listener = runtime.actor("sam");
	const start = runtime.s.now;
	for (const person of [speaker, listener]) {
		person.place = "hall";
		person.job = {
			personId: person.id,
			activityId: `spoken-fixture:${person.id}`,
			startedAt: Math.round(start * MINUTE),
			offer: {
				id: "talk",
				action: "talk",
				label: "Talk",
				placeId: "hall",
				duration: 30,
				effort: 0.1,
				advertises: {},
			},
			from: "hall",
			arrive: start,
			end: start + 30,
			event: runtime.event(
				"started",
				"Physical conversation fixture.",
				person.id,
				"hall",
			),
			food: 0,
			tools: 0,
		};
	}
	runtime.s.owner.advance(Math.round((start + 15) * MINUTE));
	runtime.s.now = runtime.s.owner.at / MINUTE;
	const id = runtime.event(
		"evening-proposed",
		"Nora invited neighbours to a class.",
		"ada",
		"hall",
	);
	const evening: EveningEvent = {
		id: "spoken-receipt-control",
		kind: "class",
		organiserId: "ada",
		startsAt: 2520,
		endsAt: 2580,
		stage: "proposed",
		notice: required(
			runtime.s.events.find((event) => event.id === id),
			"Missing physical event",
		),
		replies: { ada: { heardAt: start, attendedMinutes: 0 } },
	};
	runtime.s.socialEvenings = {
		version: 1,
		openedAt: start,
		lastCountAt: runtime.s.now,
		events: [evening],
	};
	shareEveningNotice(runtime, speaker, listener);
	expect(evening.replies.sam).toBeUndefined();
	expect(runtime.s.socialEvenings.pendingNotices).toHaveLength(1);
	const eventCount = runtime.s.events.length;
	shareEveningNotice(runtime, speaker, listener);
	expect(runtime.s.events).toHaveLength(eventCount);
	const packet = runtime.export(),
		cold = Runtime.hydrate(packet, TownRunOwner.restore(packet.owner));
	for (const town of [runtime, cold]) {
		town.s.owner.advance(town.s.owner.at + 1);
		town.s.now = town.s.owner.at / MINUTE;
		updateEvenings(town);
	}
	expect(cold.export()).toEqual(runtime.export());
	expect(runtime.s.socialEvenings.pendingNotices).toEqual([]);
	expect(evening.replies.sam?.sourceId).toBe("ada");
	expect(evening.replies.sam?.heardEvent?.causes).toEqual([
		id,
		required(speaker.job, "Missing conversation job").event,
	]);
	expect(evening.replies.sam?.reply).toBeUndefined();
	expect(evening.replies.sam?.attendedMinutes).toBe(0);
	expect(evening.replies.sam?.delivered).toBeUndefined();
	const before = structuredClone(evening.replies);
	settleEveningBroadcasts(runtime.s);
	expect(evening.replies).toEqual(before);
});
it("does not send a bulletin to an actual authored sleeping body or invent a receipt when it later wakes", () => {
	const packet = createRuntime(42, 6).export();
	const run = need(createRun(townSpec(42)));
	for (const person of structuredClone(authorResidents(42, 6))) {
		if (person.id === "elin") person.state.body.asleep = true;
		need(createPerson(run, person));
	}
	const owner = new TownRunOwner(run);
	packet.owner = owner.export();
	packet.physical.now = owner.at / MINUTE;
	const runtime = Runtime.hydrate(packet, owner);
	expect(owner.actor("elin").body.asleep).toBe(true);
	const id = runtime.event(
		"evening-proposed",
		"Nora invited neighbours to a class.",
		"ada",
		"hall",
	);
	const evening: EveningEvent = {
		id: "sleeping-broadcast-control",
		kind: "class",
		organiserId: "ada",
		startsAt: 2520,
		endsAt: 2580,
		stage: "proposed",
		notice: required(
			runtime.s.events.find((event) => event.id === id),
			"Missing physical event",
		),
		replies: {},
	};
	runtime.s.socialEvenings = {
		version: 1,
		openedAt: runtime.s.now,
		lastCountAt: runtime.s.now,
		events: [evening],
	};
	interveneEvening(runtime, "advertise-evening", evening.id);
	const perceptId = `town:${required(evening.advertisement, "Missing bulletin").id}:elin`;
	expect(
		owner
			.export()
			.queued.some(
				(input) =>
					input.kind === "observation.received" &&
					input.payload.person === "elin",
			),
	).toBe(false);
	owner.advance(owner.at + 1);
	runtime.s.now = owner.at / MINUTE;
	settleEveningBroadcasts(runtime.s);
	expect(owner.attention("elin", perceptId)).toBeNull();
	expect(evening.replies.elin).toBeUndefined();
});
it("settles a broadcast only from actual attention after cold continuation without inventing acceptance or attendance", () => {
	const live = createRuntime(42, 6);
	const id = live.event(
		"evening-proposed",
		"Nora invited neighbours to a class.",
		"ada",
		"hall",
	);
	const notice = required(
		live.s.events.find((event) => event.id === id),
		"Missing physical event",
	);
	const evening: EveningEvent = {
		id: "evening-0-class",
		kind: "class",
		organiserId: "ada",
		startsAt: 2520,
		endsAt: 2580,
		stage: "proposed",
		notice,
		replies: {},
	};
	live.s.socialEvenings = {
		version: 1,
		openedAt: live.s.now,
		lastCountAt: live.s.now,
		events: [evening],
	};
	const controls = live.s.controls;
	interveneEvening(live, "advertise-evening", evening.id);
	expect(live.s.controls).toBe(controls - 1);
	expect(evening.advertisement?.causes).toEqual([id]);
	expect(evening.replies).toEqual({});
	const pending = live.export();
	const cold = Runtime.hydrate(pending, TownRunOwner.restore(pending.owner));
	for (const runtime of [live, cold]) {
		runtime.s.owner.advance(runtime.s.owner.at + 1);
		runtime.s.now = runtime.s.owner.at / MINUTE;
		updateEvenings(runtime);
	}
	expect(cold.export()).toEqual(live.export());
	const replied = Object.entries(evening.replies);
	expect(replied.length).toBeGreaterThan(0);
	for (const [person, reply] of replied) {
		expect(
			live.s.owner.attention(
				person,
				`town:${required(evening.advertisement, "Missing bulletin").id}:${person}`,
			),
		).toBeGreaterThan(0);
		expect(reply.heardAt).toBe(
			required(
				live.s.owner.attentionTime(
					person,
					`town:${required(evening.advertisement, "Missing bulletin").id}:${person}`,
				),
				"Missing actual attention time",
			) / MINUTE,
		);
		expect(reply.reply).toBeUndefined();
		expect(reply.attendedMinutes).toBe(0);
		expect(reply.delivered).toBeUndefined();
	}
	const before = structuredClone(evening.replies);
	updateEvenings(live);
	expect(evening.replies).toEqual(before);
	const unsent = live.event(
		"intervention",
		"A retained bulletin with no Run ingress.",
		undefined,
		"hall",
		[id],
	);
	const absent: EveningEvent = {
		...evening,
		id: "absent-receipt-control",
		replies: {},
		advertisement: required(
			live.s.events.find((event) => event.id === unsent),
			"Missing physical event",
		),
	};
	required(live.s.socialEvenings, "Missing evenings").events.push(absent);
	settleEveningBroadcasts(live.s);
	expect(absent.replies).toEqual({});
	expect(() =>
		interveneEvening(live, "advertise-evening", evening.id),
	).toThrow();
	expect(live.s.controls).toBe(controls - 1);
});
