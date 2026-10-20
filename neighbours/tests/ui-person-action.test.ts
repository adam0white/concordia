import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { createRuntime } from "../src/core/index";
import PersonPanel from "../src/ui/PersonPanel";
import { PlayerAction, SpeakPanel } from "../src/ui/SpeakPanel";
import TownGoal from "../src/ui/TownGoal";
import type { useVisitorSession } from "../src/ui/useVisitorSession";

type Session = ReturnType<typeof useVisitorSession>;
const session = () => ({ town: createRuntime(42, 8).view() }) as Session;

it("groups the immediate verb, actual location and walking controls together", () => {
	const html = renderToStaticMarkup(
		createElement(SpeakPanel, { session: session() }),
	);
	expect(html).toContain('class="player-action"');
	expect(html).toContain("Choose a place to walk");
	expect(html).not.toContain("Find your feet");
	expect(html).toContain('class="current-action"');
	expect(html).toContain('<details class="walk" open="">');
	expect(html).toMatch(/player-action[\s\S]*You are at[\s\S]*Walk somewhere/);
});

it("places the resident name before the immediate action and the description after it", () => {
	const town = createRuntime(42, 8).view();
	const person = town.people[0];
	if (!person) throw new Error("Missing seeded resident");
	const html = renderToStaticMarkup(
		createElement(PersonPanel, {
			person,
			town,
			close: () => {},
			observed: undefined,
			playerAction: createElement(
				"div",
				{ className: "player-action" },
				"Walk somewhere",
			),
		}),
	);
	expect(html.indexOf('class="player-action"')).toBeGreaterThan(-1);
	expect(html.indexOf('class="player-action"')).toBeGreaterThan(
		html.indexOf("</h2>"),
	);
	expect(html.indexOf('class="player-action"')).toBeLessThan(
		html.indexOf('class="description"'),
	);
});

it("names the same initial walking action on the map", () => {
	const html = renderToStaticMarkup(
		createElement(TownGoal, {
			town: createRuntime(42, 8).view(),
			help: () => {},
			openJournal: () => {},
		}),
	);
	const text = html.replace(/<[^>]*>/g, "");
	expect(text).toContain("Choose a place to walk");
	expect(text).not.toContain("Find your feet");
});

it("offers the selected resident's actual destination before player location", () => {
	const current = session();
	const html = renderToStaticMarkup(
		createElement(PlayerAction, { session: current, personId: "ada" }),
	);
	expect(html).toContain("Walk to Workshop to talk");
	expect(html).toContain("~60 min");
	expect(html.indexOf("Walk to Workshop to talk")).toBeLessThan(
		html.indexOf("You are at"),
	);
	expect(html).not.toContain("Choose a place to walk");
});
it("offers conversation with a present resident before the location", () => {
	const current = session();
	const person = current.town?.people.find((p) => p.id === "ada");
	if (!person || !current.town?.player) throw new Error("No resident");
	current.town.player.present = [
		{
			id: person.id,
			name: person.name,
			known: true,
			activity: person.activity,
		},
	];
	const html = renderToStaticMarkup(
		createElement(PlayerAction, {
			session: current,
			personId: person.id,
			conversation: createElement("p", {}, "Actual speech controls"),
		}),
	);
	expect(html).toContain(`Talk to ${person.name}`);
	expect(html.indexOf(`Talk to ${person.name}`)).toBeLessThan(
		html.indexOf("You are at"),
	);
	expect(html).toContain("Actual speech controls");
});

it("retains conversation follow-up when a resident is away", () => {
	const html = renderToStaticMarkup(
		createElement(PlayerAction, {
			session: session(),
			personId: "ada",
			conversation: createElement("p", {}, "Held reply and promise controls"),
		}),
	);
	expect(html).toContain("Held reply and promise controls");
});

it("keeps a held answer and open promise when the listener departs", () => {
	const current = session();
	const player = current.town?.player;
	if (!player) throw new Error("Missing player");
	player.requests = [
		{
			id: 1,
			at: 480,
			targetId: "ada",
			targetName: "Ada",
			affordanceId: "repair",
			label: "Help repair the hall",
			mode: "ask",
			verdict: "deferred",
			says: "I will think about it.",
			status: "held",
		},
	];
	player.pledges = [
		{
			id: "pledge-1",
			toId: "ada",
			toName: "Ada",
			work: "carry-meals",
			label: "Carry food",
			placeId: "quay",
			dueBy: 1080,
			status: "open",
			canStart: true,
		},
	];
	player.present = [];
	const html = renderToStaticMarkup(
		createElement(PlayerAction, {
			session: current,
			personId: "ada",
			conversation: createElement(SpeakPanel, {
				session: current,
				personId: "ada",
				showAction: false,
			}),
		}),
	);
	expect(html).toContain('class="latest-answer"');
	expect(html.indexOf('class="latest-answer"')).toBeLessThan(
		html.indexOf("is not with you"),
	);
	expect(html).toContain("Your promises");
	expect(html).toContain("Start the hour");
	expect(html).toContain('class="resident-talk"');
});

it("keeps promise inputs together with explicit work and a visible evening deadline", () => {
	const current = session();
	const player = current.town?.player;
	if (!player) throw new Error("Missing player");
	player.present = [
		{ id: "ada", name: "Ada", known: true, activity: "working" },
	];
	player.pledgeDeadlines = [1080];
	current.speechPrediction = {
		actorId: "ada",
		prediction: {
			targetId: "ada",
			at: 480,
			offers: [{ affordanceId: "rest", label: "Rest at home" }],
			read: [],
		},
	} as NonNullable<Session["speechPrediction"]>;
	const html = renderToStaticMarkup(
		createElement(SpeakPanel, {
			session: current,
			personId: "ada",
			showAction: false,
		}),
	);
	expect(html).toContain('class="promise-choice"');
	expect(html).toContain("Choose what to ask");
	expect(html).toContain("Choose a deadline");
	expect(html).not.toMatch(/value="rest" selected/);
	expect(html).toMatch(/value="1080" selected/);
	expect(html).toMatch(
		/<details class="speech-alternatives"><summary>Ask or urge instead/,
	);
	expect(html.indexOf("Promise an hour")).toBeLessThan(
		html.indexOf("Ask or urge instead"),
	);
	expect(html).toContain("It binds you only if they take it up.");
});
it("reserves the same promise form while predictions load", () => {
	const current = session();
	if (!current.town?.player) throw new Error("Missing player");
	current.town.player.present = [
		{ id: "ada", name: "Ada", known: true, activity: "working" },
	];
	const html = renderToStaticMarkup(
		createElement(SpeakPanel, {
			session: current,
			personId: "ada",
			showAction: false,
		}),
	);
	expect(html).toContain('class="promise-choice"');
	expect(html).toContain("Your hour");
	expect(html).toContain("Done by");
	expect(html).toContain("Promise an hour");
});

it("puts a bound hour before another offer so the player can start helping", () => {
	const current = session();
	const player = current.town?.player;
	if (!player) throw Error("Missing player");
	player.present = [
		{ id: "ada", name: "Ada", known: true, activity: "working" },
	];
	player.pledges = [
		{
			id: "hour",
			toId: "ada",
			toName: "Ada",
			work: "carry-meals",
			label: "Carry food",
			placeId: "quay",
			dueBy: 1080,
			status: "open",
			canStart: true,
		},
	];
	const html = renderToStaticMarkup(
		createElement(SpeakPanel, {
			session: current,
			personId: "ada",
			showAction: false,
		}),
	);
	expect(html.indexOf("Start the hour")).toBeLessThan(
		html.indexOf('class="promise-choice"'),
	);
});
