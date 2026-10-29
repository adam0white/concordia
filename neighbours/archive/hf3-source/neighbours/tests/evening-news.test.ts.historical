import assert from "node:assert/strict";
import { describe, expect, it } from "vitest";
import { shareEveningNotice } from "../src/core/evening-news.ts";
import { updateEvenings } from "../src/core/evenings.ts";
import { Runtime } from "../src/core/runtime.ts";
import type { Resident, Save } from "../src/core/state.ts";
import { createRuntime } from "./historical-runtime.ts";

function fixture() {
	const host = new Runtime(createRuntime(42, 8).export() as Save);
	host.s.hallSafe = true;
	updateEvenings(host);
	const speaker = host.actor("lea"),
		listener = host.actor("ada");
	const evening = host.s.socialEvenings?.events[0];
	assert(evening);
	const noticeId = host.event(
		"evening-proposed",
		"Lea's class tomorrow",
		"lea",
		"hall",
	);
	evening.notice = structuredClone(
		host.s.events.find((e) => e.id === noticeId),
	);
	evening.stage = "proposed";
	evening.replies.lea = { heardAt: 480, attendedMinutes: 0 };
	function contact(resident: Resident) {
		resident.place = "market";
		resident.job = {
			offer: {
				id: "talk",
				action: "talk",
				label: "Talk at the market",
				effort: 0.1,
				placeId: "market",
				duration: 30,
				advertises: { belonging: 0.2 },
			},
			arrive: 480,
			end: 510,
			from: "market",
			event: host.event("started", "Talking", resident.person.id, "market"),
			food: 0,
			tools: 0,
		};
	}
	contact(speaker);
	contact(listener);
	host.s.now = 495;
	speaker.person.now = listener.person.now = 495;
	return { host, speaker, listener, evening };
}
describe("spoken evening invitations", () => {
	it("learns from a market conversation without accepting or promising attendance", () => {
		const { host, speaker, listener, evening } = fixture();
		const commitments = structuredClone(listener.person.agenda.commitments);
		shareEveningNotice(host, speaker, listener);
		expect(evening.replies.ada).toMatchObject({
			heardAt: 495,
			attendedMinutes: 0,
			sourceId: "lea",
		});
		expect(evening.replies.ada?.reply).toBeUndefined();
		expect(listener.person.agenda.commitments).toEqual(commitments);
		const received = listener.received?.find(
			(e) => e.kind === "evening-retold",
		);
		expect(received).toMatchObject({
			actorId: "lea",
			targetId: "ada",
			placeId: "market",
		});
		expect(received?.causes).toEqual([evening.notice?.id, speaker.job?.event]);
		expect(evening.replies.ada).toHaveProperty("heardEvent", received);
		expect(evening.replies.musa).toBeUndefined();
	});
	it.each([
		"distant",
		"travelling",
		"short",
		"sleeping",
		"speaker asleep",
		"bystander",
		"self",
		"unknown notice",
		"closed",
		"started",
	])("does not transmit to %s", (condition) => {
		const { host, speaker, listener, evening } = fixture();
		assert(listener.job && speaker.job);
		if (condition === "distant") listener.job.offer.placeId = "homes";
		if (condition === "travelling") listener.job.arrive = 510;
		if (condition === "short") listener.job.arrive = 490;
		if (condition === "sleeping") listener.person.body.asleep = true;
		if (condition === "speaker asleep") speaker.person.body.asleep = true;
		if (condition === "bystander") delete listener.job;
		if (condition === "unknown notice") delete evening.replies.lea;
		if (condition === "closed") evening.stage = "closed";
		if (condition === "started") evening.startsAt = host.s.now;
		shareEveningNotice(
			host,
			speaker,
			condition === "self" ? speaker : listener,
		);
		expect(evening.replies.ada).toBeUndefined();
		expect(
			host.s.events.filter((e) => e.kind === "evening-retold"),
		).toHaveLength(0);
	});
	it("shares at most one notice per contact and deduplicates repeated calls", () => {
		const { host, speaker, listener, evening } = fixture();
		const second = host.s.socialEvenings?.events[1];
		assert(second && evening.notice);
		second.notice = {
			...evening.notice,
			id: host.event("evening-proposed", "Sam's supper", "sam", "hall"),
		};
		second.stage = "proposed";
		second.replies.lea = { heardAt: 480, attendedMinutes: 0 };
		shareEveningNotice(host, speaker, listener);
		shareEveningNotice(host, speaker, listener);
		expect(evening.replies.ada).toBeDefined();
		expect(second.replies.ada).toBeUndefined();
		expect(
			host.s.events.filter((e) => e.kind === "evening-retold"),
		).toHaveLength(1);
	});
});
