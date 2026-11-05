import { expect, it } from "vitest";
import type { EveningEvent } from "../src/core/evenings.ts";
import { townStories } from "../src/core/stories.ts";
import { createRuntime } from "./current-town.ts";

it("headlines distinguish a class invitation, missed class and delivered class", () => {
	const s = createRuntime(42, 8).s;
	const notice = {
		id: 1,
		at: 480,
		kind: "evening-proposed",
		actorId: "ada",
		placeId: "hall",
		text: "Nora invited neighbours to a class.",
		causes: [],
		importance: 0.5,
	};
	const event: EveningEvent = {
		id: "evening-0-class",
		kind: "class" as const,
		organiserId: "ada" as const,
		startsAt: 1080,
		endsAt: 1140,
		stage: "proposed" as const,
		notice,
		replies: {},
	};
	s.socialEvenings = {
		version: 1,
		openedAt: 480,
		lastCountAt: 480,
		events: [event],
	};
	expect(townStories(s)[0]?.title).toBe("Nora invited neighbours to a class");
	const closed: EveningEvent = {
		...event,
		stage: "closed" as const,
		result: {
			...notice,
			id: 2,
			kind: "evening-ended",
			text: "Nobody received the planned activity.",
		},
	};
	s.socialEvenings.events = [closed];
	expect(townStories(s)[0]?.title).toBe("Nora’s class did not happen");
	closed.replies = {
		elin: { heardAt: 480, attendedMinutes: 30, delivered: true },
	};
	expect(townStories(s)[0]?.title).toBe("Neighbours attended Nora’s class");
});
