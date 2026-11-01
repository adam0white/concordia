import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { PlayerView, TownView } from "../src/contracts";
import { currentGuide, pledgePresentation } from "../src/ui/current-promises";
import RequestRecord from "../src/ui/RequestRecord";
import { PlayerJournal, SpeakPanel } from "../src/ui/SpeakPanel";
import type { useVisitorSession } from "../src/ui/useVisitorSession";

// Source-only candidate: these guards have NOT been run.
const pledge: PlayerView["pledges"][number] = {
	id: "hour-1",
	toId: "nora",
	toName: "Nora",
	work: "help-repair",
	label: "Help repair the hall",
	placeId: "hall",
	dueBy: 1080,
	status: "released",
};
const guide = {
	id: "pledge",
	title: "Keep your promise",
	hint: "Do the hour.",
	status: "current" as const,
	eventIds: [],
};

it("does not turn the tutorial step or a released offer into a debt", () => {
	const player = { goals: [guide], pledges: [] };
	expect(currentGuide(player)?.title).toBe("No hour is owed");
	const released = currentGuide({ ...player, pledges: [pledge] });
	expect(released?.title).toBe("Your hour was released");
	expect(released?.hint).toContain("You no longer owe this hour.");
	expect(released?.hint).toContain("Nora");
});

it("names the actual owed work and deadline before a later closed pledge", () => {
	const open = { ...pledge, id: "hour-2", status: "open" as const };
	const player = { goals: [guide], pledges: [open, pledge] };
	const before = JSON.stringify(player);
	expect(currentGuide(player)?.hint).toContain("Help repair the hall");
	expect(currentGuide(player)?.hint).toContain("Day 1 · 18:00");
	expect(currentGuide(player)?.hint).toContain("You owe this hour.");
	expect(pledgePresentation({ ...open, status: "offered" }).detail).toContain(
		"You do not owe this hour yet.",
	);
	expect(JSON.stringify(player)).toBe(before);
});

it("keeps an earlier answer and later refusal together without inventing a cause", () => {
	const request: PlayerView["requests"][number] = {
		id: 5,
		at: 750,
		placeId: "hall",
		targetId: "bilal",
		targetName: "Bilal",
		affordanceId: "repair",
		label: "repair the hall",
		mode: "ask",
		verdict: "assented",
		says: "I will do it.",
		status: "decided",
		decision: {
			at: 765,
			verdict: "refused",
			says: "That is not available here now.",
			chosenAffordanceId: "home",
			chosenLabel: "go home",
		},
	};
	const html = renderToStaticMarkup(
		createElement(RequestRecord, { request, pledges: [] }),
	);
	expect(html).toContain("I will do it.");
	expect(html).toContain("That is not available here now.");
	expect(html).toContain("Day 1 · 12:45");
	expect(html).toContain("A specific reason is not recorded here.");
	expect(html).not.toContain("because");
});

it("shows the same released hour beside history in the Journal and a departed person's drawer", () => {
	const player: PlayerView = {
		active: true,
		placeId: "market",
		workHoursLeft: 2,
		canMove: true,
		present: [],
		presentCount: 0,
		destinations: [],
		requests: [
			{
				id: 7,
				at: 750,
				placeId: "hall",
				targetId: "nora",
				targetName: "Nora",
				affordanceId: "repair",
				label: "repair the hall",
				mode: "promise",
				verdict: "refused",
				says: "I will not do that.",
				status: "refused",
				pledgeId: pledge.id,
			},
		],
		pledges: [pledge],
		goals: [guide],
		journal: [],
		notices: 0,
	};
	const session = {
		town: { now: 1200, player, people: [], places: [] } as unknown as TownView,
	} as ReturnType<typeof useVisitorSession>;
	const journal = renderToStaticMarkup(
		createElement(PlayerJournal, { player }),
	);
	const drawer = renderToStaticMarkup(
		createElement(SpeakPanel, {
			session,
			personId: "nora",
			recordOnly: true,
			showAction: false,
		}),
	);
	for (const html of [journal, drawer]) {
		expect(html).toContain("I will not do that.");
		expect(html).toContain("You no longer owe this hour.");
		expect(html).not.toContain("Start the hour");
	}
});

// Synthetic public records exercise host-linked job status, not actual Bilal history.
it.each([
	["started", "The chosen activity started. It is not recorded as finished."],
	["completed", "The chosen activity finished."],
	["failed", "The chosen activity failed."],
	["interrupted", "The chosen activity was interrupted."],
])(
	"does not report requested repairs when an alternative job is %s",
	(status, expected) => {
		const request: PlayerView["requests"][number] = {
			id: 9,
			at: 750,
			targetId: "bilal",
			targetName: "Bilal",
			affordanceId: "repair",
			label: "repair the hall",
			mode: "ask",
			verdict: "assented",
			says: "I will do it.",
			status,
			decision: {
				at: 765,
				verdict: "refused",
				says: "That is not available here now.",
				chosenAffordanceId: "home",
				chosenLabel: "go home",
			},
			...(status !== "started" ? { result: "A retained result line." } : {}),
		};
		const before = JSON.stringify(request);
		const html = renderToStaticMarkup(
			createElement(RequestRecord, { request, pledges: [] }),
		);
		expect(html).toContain(expected);
		expect(html).toContain("Bilal chose to go home.");
		expect(html).toContain("I will do it.");
		expect(html).toContain("That is not available here now.");
		if (request.result) expect(html).toContain("A retained result line.");
		expect(html).not.toContain("The requested activity");
		expect(JSON.stringify(request)).toBe(before);
	},
);

it("still reports completion when the chosen activity matches the requested repair", () => {
	const request: PlayerView["requests"][number] = {
		id: 10,
		at: 750,
		targetId: "bilal",
		targetName: "Bilal",
		affordanceId: "repair",
		label: "repair the hall",
		mode: "ask",
		verdict: "assented",
		says: "I will do it.",
		status: "completed",
		decision: {
			at: 765,
			verdict: "complied",
			says: "I will do it.",
			chosenAffordanceId: "repair",
			chosenLabel: "repair the hall",
		},
	};
	const html = renderToStaticMarkup(
		createElement(RequestRecord, { request, pledges: [] }),
	);
	expect(html).toContain("Bilal chose to repair the hall.");
	expect(html).toContain("The chosen activity finished.");
});
