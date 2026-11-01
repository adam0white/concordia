import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { PlayerView, TownView } from "../src/contracts";
import { currentGuide, pledgePresentation } from "../src/ui/current-promises";
import RequestRecord from "../src/ui/RequestRecord";
import { recordedAcceptance } from "../src/ui/recorded-acceptance";
import {
	OwnWork,
	PlayerJournal,
	PromisedWork,
	SpeakPanel,
} from "../src/ui/SpeakPanel";
import type { useVisitorSession } from "../src/ui/useVisitorSession";

// Public host/UI records exercise presentation without writing simulation state.
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

it("waits for an offered hour in the guide and does not expose a start control in the Journal", () => {
	const offered = { ...pledge, status: "offered" as const, canStart: true };
	const player: PlayerView = {
		active: true,
		placeId: "market",
		workHoursLeft: 2,
		canMove: true,
		present: [],
		presentCount: 0,
		destinations: [],
		requests: [],
		pledges: [offered],
		goals: [guide],
		journal: [],
		notices: 0,
	};
	const session = {
		town: { now: 750, player, people: [], places: [] } as unknown as TownView,
	} as ReturnType<typeof useVisitorSession>;
	const hint = currentGuide(player)?.hint;
	const journal = renderToStaticMarkup(
		createElement(PlayerJournal, { player, session }),
	);
	expect(hint).toContain("You do not owe this hour yet.");
	expect(hint).toContain("Wait for an actual agreement or action.");
	expect(hint).not.toContain("Start the hour");
	expect(journal).toContain("You do not owe this hour yet.");
	expect(journal).not.toContain("Start the hour");
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

// Source-only retest guards. No runtime execution has been authorized for this batch.
it("confirms only the acceptance whose recorded request event is correlated", () => {
	const request: PlayerView["requests"][number] = {
		id: 31,
		at: 540,
		targetId: "noor",
		targetName: "Ece",
		affordanceId: "repair",
		label: "repair the hall",
		mode: "ask",
		verdict: "assented",
		says: "I will do it.",
		status: "held",
	};
	const entry: PlayerView["journal"][number] = {
		id: "journal-31",
		at: 540,
		day: 1,
		label: "recorded",
		sourceEventIds: [31, 32],
		text: "You accepted Ece’s offer to repair the hall after visiting. Ece answered: “I will do it.”",
	};
	const render = (journal: PlayerView["journal"]) =>
		renderToStaticMarkup(
			createElement(RequestRecord, { request, pledges: [], journal }),
		);
	const before = JSON.stringify({ request, entry });
	const confirmed = render([entry]);
	expect(confirmed).toContain("Your acceptance is recorded.");
	expect(confirmed).toContain("does not guarantee their later choice or work");
	expect(confirmed).toContain("No later choice or start is recorded");
	expect(confirmed).toContain("I will do it.");
	for (const journal of [
		[],
		[{ ...entry, sourceEventIds: [99, 31] }],
		[{ ...entry, at: 555 }],
		[{ ...entry, text: "You asked Ece to repair the hall." }],
	]) {
		expect(render(journal)).not.toContain("Your acceptance is recorded.");
	}
	expect(
		recordedAcceptance({ ...request, targetId: "ada", targetName: "Nora" }, [
			entry,
		]),
	).toBeUndefined();
	expect(JSON.stringify({ request, entry })).toBe(before);
});

it("makes the same open hour startable in the Journal and hall, and keeps own work separate", () => {
	const open: PlayerView["pledges"][number] = {
		...pledge,
		status: "open",
		canStart: true,
	};
	const player = {
		pledges: [open],
		requests: [],
		journal: [],
		workHoursLeft: 2,
		canMove: true,
		canAirTimber: false,
	} as unknown as PlayerView;
	const session = { town: { player } } as ReturnType<typeof useVisitorSession>;
	const before = JSON.stringify(player);
	for (const element of [
		createElement(PlayerJournal, { player, session }),
		createElement(PromisedWork, { session }),
	]) {
		const html = renderToStaticMarkup(element);
		expect(html).toContain("Start the hour");
		expect(html).not.toContain('disabled=""');
		expect(html).toContain("including the walk");
	}
	open.canStart = false;
	Object.assign(open, { blocked: "You have no working hours left today." });
	const blocked = renderToStaticMarkup(
		createElement(PlayerJournal, { player, session }),
	);
	expect(blocked).toContain('disabled=""');
	expect(blocked).toContain("You have no working hours left today.");
	open.status = "released";
	// Closed status overrides stale canStart; no start action is exposed.
	expect(
		renderToStaticMarkup(createElement(PromisedWork, { session })),
	).not.toContain("Start the hour");
	const own = renderToStaticMarkup(createElement(OwnWork, { session }));
	expect(own).toContain("Start your own hour: help repair the hall");
	expect(own).toContain("You ask for nothing in return");
	expect(own).toContain("This does not keep a separately promised hour.");
	expect(own).not.toContain("Start the hour");
	// Only the explicit fixture mutations differ; rendering did not write to it.
	player.pledges = [{ ...pledge, status: "open", canStart: true }];
	expect(renderToStaticMarkup(createElement(OwnWork, { session }))).toContain(
		"Use Start the hour for that promise.",
	);
	expect(JSON.stringify(player)).toBe(before);
});

it("keeps another person's recorded answer out of the selected conversation", () => {
	const request: PlayerView["requests"][number] = {
		id: 40,
		at: 540,
		targetId: "ada",
		targetName: "Nora",
		affordanceId: "rest",
		label: "rest at home",
		mode: "ask",
		verdict: "deferred",
		says: "I will finish my current work first.",
		status: "held",
	};
	const player = {
		requests: [request],
		pledges: [],
		journal: [],
		present: [],
	} as unknown as PlayerView;
	const session = {
		town: { now: 555, player, people: [], places: [], events: [] },
	} as unknown as ReturnType<typeof useVisitorSession>;
	const render = (personId: string) =>
		renderToStaticMarkup(
			createElement(SpeakPanel, { session, personId, recordOnly: true }),
		);
	expect(render("ada")).toContain("I will finish my current work first.");
	expect(render("noor")).not.toContain("I will finish my current work first.");
});
