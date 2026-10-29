import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllGlobals());

import type { PersonView, TownEvent, TownView } from "../src/contracts";
import { groupStories } from "../src/ui/observations";
import PersonPanel from "../src/ui/PersonPanel";
import PersonPromises from "../src/ui/PersonPromises";
import StoryHeadline from "../src/ui/StoryHeadline";
import { createRuntime } from "./historical-runtime.ts";

const event = (
	id: number,
	at: number,
	kind: string,
	actorId: string,
): TownEvent => ({
	id,
	at,
	kind,
	actorId,
	text: "Actual recorded result",
	causes: [],
	importance: 0.5,
});
function storyTown(): TownView {
	const town = createRuntime(42, 8).view();
	town.events = [
		event(1, 100, "completed", "musa"),
		event(2, 200, "hall-repaired", "ada"),
	];
	town.stories = [
		{
			id: "repair",
			kind: "hall-repaired",
			at: 200,
			title: "The repairs are finished. The hall still needs an inspection.",
			summary: "Actual repairs finished",
			eventIds: [1, 2],
		},
	];
	return town;
}
it("uses recorded story time and direct actor, never ancestry as repair participants", () => {
	const group = groupStories(storyTown(), undefined)[0];
	expect(group?.at).toBe(200);
	expect(group?.actorIds).toEqual(["ada"]);
});
it("retains a provided timestamp but does not invent an actor when details are pruned", () => {
	const town = storyTown();
	town.events = [];
	town.people = town.people.map((person) => ({
		...person,
		history: [],
		observations: [],
		inspection: undefined,
	}));
	const group = groupStories(town, undefined)[0];
	expect(group?.at).toBe(200);
	expect(group?.actorIds).toEqual([]);
});
it("promotes the latest grouped story and has no initial empty headline", () => {
	const town = storyTown();
	town.stories.unshift({
		id: "older",
		at: 50,
		kind: "shared-meal",
		title: "Earlier meal",
		summary: "Recorded earlier meal",
		eventIds: [],
	});
	const latest = groupStories(town, undefined)[0];
	const html = renderToStaticMarkup(
		createElement(StoryHeadline, { story: latest, open: () => {} }),
	);
	expect(html).toContain(
		"Read story: The repairs are finished. The hall still needs an inspection.",
	);
	expect(html).toContain("Day 1 · 03:20");
	expect(
		renderToStaticMarkup(createElement(StoryHeadline, { open: () => {} })),
	).toBe("");
});
it("folds a settled Day 1 promise beside the current promise without repeating either", () => {
	const commitments = [
		{ label: "Repair doors before evening", at: 1080, status: "broken" },
		{ label: "Bring tools tomorrow", at: 2520, status: "pending" },
	];
	const html = renderToStaticMarkup(
		createElement(PersonPromises, { person: { commitments }, now: 1920 }),
	);
	expect(html).toContain("Broken · deadline Day 1 · 18:00");
	expect(html.match(/Repair doors before evening/g)).toHaveLength(1);
	expect(html.match(/Bring tools tomorrow/g)).toHaveLength(1);
	expect(html).toContain("Repair doors before evening");
	expect(html).toContain("deadline Day 1 · 18:00");
	expect(html).toContain("Other promises · 1");
	expect(html).not.toContain("<details open");
});
it("never calls an overdue pending promise broken before HF settles it", () => {
	const html = renderToStaticMarkup(
		createElement(PersonPromises, {
			person: {
				commitments: [{ label: "Still pending", at: 1080, status: "pending" }],
			},
			now: 1920,
		}),
	);
	expect(html).toContain("Pending · deadline passed");
	expect(html).not.toContain("Broken");
	expect(html).not.toContain("Promise result");
});
it("preserves exact kept and released statuses", () => {
	for (const status of ["kept", "released"]) {
		const html = renderToStaticMarkup(
			createElement(PersonPromises, {
				person: {
					commitments: [{ label: "Recorded promise", at: 1080, status }],
				},
				now: 1920,
			}),
		);
		expect(html).toContain(
			`Promise result · ${status[0]?.toUpperCase()}${status.slice(1)}`,
		);
	}
});
it("keeps controller and numeric evidence in lab mode", () => {
	vi.stubGlobal("location", { search: "?lab=1" });
	const town = createRuntime(42, 8).view();
	const person = {
		...town.people[0],
		decision: {
			reason: "HF numeric evidence 0.345678",
			source: "HF 2.2.1",
			chosen: "rest",
			label: "Rest",
			options: [],
			decidedAt: 480,
		},
	} as PersonView;
	const html = renderToStaticMarkup(
		createElement(PersonPanel, {
			person,
			town,
			observed: undefined,
			close: () => {},
		}),
	);
	expect(html).toContain(
		'<details class="reason"><summary>Why this choice · Day 1 · 08:00</summary>',
	);
	expect(html).toContain("HF numeric evidence 0.345678");
	expect(html).toContain("A neighbour</div>");
	expect(html).toContain("Controller · HF");
	expect(html.indexOf("Controller · HF")).toBeGreaterThan(
		html.indexOf("Reasons and records ▸"),
	);
	expect(html).toContain("Right now");
});

it("does not turn a received repair bulletin into a participant claim", () => {
	const town = storyTown();
	const receiver = town.people.find((person) => person.id === "musa");
	if (receiver)
		receiver.observations = [
			{ ...event(2, 200, "hall-repaired", "ada"), targetId: "musa" },
		];
	expect(groupStories(town, undefined)[0]?.actorIds).toEqual(["ada"]);
});

it("keeps received lesson evidence folded and names actual sources without promising expertise", async () => {
	const { default: PersonLessons } = await import("../src/ui/PersonLessons");
	const town = storyTown();
	const html = renderToStaticMarkup(
		createElement(PersonLessons, {
			person: {
				lessons: [
					{
						id: "method-1",
						label: "Inspect wet timber",
						at: 200,
						sourceIds: ["lea", "prior-trade-course"],
						successes: 1,
						failures: 0,
					},
				],
			},
			town,
		}),
	);
	expect(html).toContain("Lessons received");
	expect(html).toContain("Inspect wet timber");
	expect(html).toContain("Received · Day 1 · 03:20");
	expect(html).toContain("Sources: Lea, Prior trade course");
	expect(html).toContain("Recorded successes: 1 · failures: 0");
	expect(html).toContain("do not prove that the person has mastered the skill");
	expect(html).not.toContain("<details open");
	expect(
		renderToStaticMarkup(createElement(PersonLessons, { person: {}, town })),
	).toBe("");
});

it("uses only a unique matching recorded evening result for attendance", () => {
	const town = storyTown();
	town.stories = [
		{
			id: "class",
			kind: "evening-ended",
			at: 200,
			title: "Neighbours received class",
			summary: "Actual class result",
			eventIds: [],
		},
	];
	town.evenings = [
		{
			id: "class-1",
			kind: "class",
			organiserId: "lea",
			title: "Class",
			startsAt: 140,
			endsAt: 180,
			stage: "closed",
			heard: 4,
			accepted: 3,
			attended: 2,
			participantIds: ["noor", "ada"],
			result: "Actual class result",
		},
	];
	expect(groupStories(town, undefined)[0]?.participantIds).toEqual([
		"noor",
		"ada",
	]);
	const evening = town.evenings[0];
	if (evening) evening.endsAt = 300;
	expect(groupStories(town, undefined)[0]?.participantIds).toEqual([]);
	const repair = storyTown();
	expect(groupStories(repair, undefined)[0]?.participantIds).toEqual([]);
});

it("retains only explicit canonical story actors after source details are pruned", () => {
	const town = storyTown();
	town.events = [];
	town.people = town.people.map((person) => ({
		...person,
		history: [],
		observations: [],
		inspection: undefined,
	}));
	const story = town.stories[0];
	if (story) story.actorId = "ada";
	expect(groupStories(town, undefined)[0]?.actorIds).toEqual(["ada"]);
	if (story) story.actorId = "unknown-person";
	expect(groupStories(town, undefined)[0]?.actorIds).toEqual([]);
});

it("renders six recent stories and keeps dated older actors and sources in a closed archive", async () => {
	const { default: Stories } = await import("../src/ui/Stories");
	const town = storyTown();
	const stories = Array.from({ length: 8 }, (_, i) => ({
		id: `record-${i}`,
		title: `Recorded story ${i}`,
		kind: "lesson",
		at: 200 - i * 15,
		actorIds: ["ada"],
		participantIds: [],
		summaries: ["Actual result"],
		eventIds: [i],
		missingEventIds: [],
	}));
	const html = renderToStaticMarkup(
		createElement(Stories, { stories, town, select: () => {} }),
	);
	const archive = html.indexOf('<details class="story-archive">');
	expect(archive).toBeGreaterThan(0);
	expect(html.slice(0, archive).match(/<article/g)).toHaveLength(6);
	expect(html.slice(archive)).toContain("Older stories · 2");
	expect(html.slice(archive)).toContain("Day 1 · 01:50");
	expect(html.slice(archive)).toContain("Follow Ada");
	expect(html).not.toContain('<details class="story-archive" open');
});

it("shows activity and current promise before one evidence disclosure, preserving the evidence inside", () => {
	const town = createRuntime(42, 8).view();
	const person = {
		...town.people[0],
		activity: "Actual active job",
		commitments: [{ label: "Current pledge", at: 900, status: "pending" }],
		observations: [event(300, 500, "lesson", "ada")],
	} as PersonView;
	const html = renderToStaticMarkup(
		createElement(PersonPanel, {
			person,
			town,
			observed: undefined,
			close: () => {},
		}),
	);
	const disclosure = html.indexOf('<details class="person-evidence">');
	expect(disclosure).toBeGreaterThan(html.indexOf("Actual active job"));
	expect(disclosure).toBeGreaterThan(html.indexOf("Current pledge"));
	expect(html.slice(0, disclosure)).not.toContain("<details");
	expect(html.slice(disclosure)).toContain("Reasons and records ▸");
	expect(html.slice(disclosure)).toContain("News received");
	expect(html.slice(disclosure)).toContain(
		"How urgent each need feels · decision evidence",
	);
	expect(html).toContain("Controller · HF");
	expect(html.match(/Current pledge/g)).toHaveLength(1);
});

it("keeps one person link per story and removes repeated actor and participant captions", async () => {
	const { default: Stories } = await import("../src/ui/Stories");
	const town = storyTown();
	const html = renderToStaticMarkup(
		createElement(Stories, {
			town,
			select: () => {},
			stories: [
				{
					id: "one",
					title: "Actual outcome",
					kind: "lesson",
					at: 600,
					actorIds: ["ada"],
					participantIds: ["ada", "noor"],
					summaries: ["Recorded teaching"],
					eventIds: [],
					missingEventIds: [],
				},
			],
		}),
	);
	expect(html.match(/Follow Ada/g)).toHaveLength(1);
	expect(html.match(/Follow Noor/g)).toHaveLength(1);
	expect(html).not.toContain("Recorded actor:");
	expect(html).not.toContain("Recorded participants:");
	expect(html).toContain("Recorded teaching");
	expect(html).toContain("Day 1 · 10:00");
});
