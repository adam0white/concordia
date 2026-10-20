import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { createRuntime } from "../src/core/index";
import PersonPanel from "../src/ui/PersonPanel";
import { SpeakPanel } from "../src/ui/SpeakPanel";
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

it("places the player action before the resident's identity and description", () => {
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
	expect(html.indexOf('class="player-action"')).toBeLessThan(
		html.indexOf('class="person-heading"'),
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
