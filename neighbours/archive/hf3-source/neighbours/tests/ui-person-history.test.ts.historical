import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { TownEvent } from "../src/contracts";
import PersonPanel from "../src/ui/PersonPanel";
import { personHistory } from "../src/ui/person-history";
import Stories from "../src/ui/Stories";
import { createRuntime } from "./historical-runtime.ts";

function event(id: number, kind: string, at: number, text: string): TownEvent {
	return { id, kind, at, text, actorId: "sam", importance: 0.15, causes: [] };
}
function fixture() {
	const town = createRuntime(42, 8).view();
	const sam = town.people.find((person) => person.id === "sam");
	if (!sam) throw Error("Missing Sam");
	sam.history = [
		event(1, "started", 3615, "Sam: Invite neighbours to supper."),
		event(
			2,
			"evening-proposed",
			3630,
			"Sam invited neighbours for Day 3 at 18:00.",
		),
		event(3, "completed", 3630, "Sam finished invite neighbours to supper."),
		event(
			4,
			"evening-proposed",
			3645,
			"Sam invited neighbours for Day 6 at 18:00.",
		),
		event(5, "attempt-failed", 3660, "Sam could not complete preparation."),
	];
	town.events = sam.history;
	town.stories = [];
	return { town, sam };
}
it("folds routine starts and completions without merging distinct dated invitations or failures", () => {
	const { town, sam } = fixture();
	const history = personHistory(sam, town, undefined);
	expect(history.meaningful.map((entry) => entry.eventIds)).toEqual([
		[5],
		[4],
		[2],
	]);
	expect(history.routine.map((entry) => entry.id)).toEqual([3, 1]);
	expect(history.raw.map((entry) => entry.id)).toEqual([5, 4, 3, 2, 1]);
	expect(sam.history).toHaveLength(5);
});
it("uses only retained evidence for this actor, keeps a pruned failure, and deduplicates only by event ID", () => {
	const { town, sam } = fixture();
	town.stories = [
		{
			id: "story-9",
			actorId: "sam",
			kind: "evening-ended",
			at: 4035,
			title: "Sam’s supper did not happen",
			summary: "Nobody came. The room was never prepared.",
			eventIds: [2, 9],
			missingEventIds: [2, 9],
		},
	];
	const observed = {
		seed: town.seed,
		now: town.now,
		events: [
			...sam.history,
			event(8, "evening-missed", 4000, "Sam did not attend."),
		],
	};
	const history = personHistory(sam, town, observed);
	expect(history.meaningful[0]).toMatchObject({
		at: 4035,
		text: "Nobody came. The room was never prepared.",
		eventIds: [2, 9],
	});
	expect(history.raw.filter((entry) => entry.id === 2)).toHaveLength(1);
	expect(
		history.meaningful.some((entry) => entry.kind === "evening-missed"),
	).toBe(true);
	town.events.push(
		event(
			9,
			"evening-ended",
			4035,
			"Nobody came. The room was never prepared.",
		),
	);
	expect(
		personHistory(sam, town, observed).meaningful.filter(
			(entry) => entry.kind === "evening-ended",
		),
	).toHaveLength(1);
});
it("renders outcomes before folded routine activity and preserves raw IDs and event causes", () => {
	const { town, sam } = fixture();
	const html = renderToStaticMarkup(
		createElement(PersonPanel, {
			person: sam,
			town,
			observed: undefined,
			close: () => {},
		}),
	);
	const history = html.slice(html.indexOf("History"));
	const routine = history.indexOf("Routine activity");
	expect(routine).toBeGreaterThan(0);
	expect(history.slice(0, routine)).toContain("Day 3 at 18:00");
	expect(history.slice(0, routine)).toContain("Day 6 at 18:00");
	expect(history.slice(0, routine)).toContain("could not complete preparation");
	expect(history.slice(0, routine)).not.toContain("finished invite");
	expect(history).toContain("Recorded event details");
	expect(history).toContain("#3 · completed");
	expect(history).not.toContain("<details open");
});
it("retains the story outcome without empty source explanations or raw event IDs", () => {
	const { town } = fixture();
	const html = renderToStaticMarkup(
		createElement(Stories, {
			town,
			select: () => {},
			stories: [
				{
					id: "story-9",
					title: "Failed supper",
					kind: "evening-ended",
					at: 4035,
					actorIds: ["sam"],
					participantIds: [],
					summaries: ["The room was never prepared."],
					eventIds: [2, 9],
					missingEventIds: [2],
				},
			],
		}),
	);
	expect(html).not.toContain("Earlier detail is no longer retained");
	expect(html).not.toContain("Source event IDs:");
	expect(html).not.toContain("#2, #9");
	expect(html).toContain("The room was never prepared.");
	expect(html).not.toContain("packet");
});
