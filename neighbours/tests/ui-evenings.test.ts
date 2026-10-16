import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { PersonView, TownView } from "../src/contracts";
import EveningBoard, { PersonInvitations } from "../src/ui/EveningBoard";

type Evening = NonNullable<TownView["evenings"]>[number];
const notice = (input: Partial<Evening> = {}): Evening => ({
	id: "class-one",
	kind: "class",
	organiserId: "lea",
	title: "Evening class",
	startsAt: 2520,
	endsAt: 2580,
	stage: "proposed",
	heard: 3,
	accepted: 2,
	attended: 0,
	participantIds: [],
	...input,
});
const people = [
	{ id: "lea", name: "Lea" },
	{ id: "sam", name: "Sam" },
];
const board = (evenings: Evening[], now = 2000) =>
	renderToStaticMarkup(
		createElement(EveningBoard, {
			town: { now, evenings, people },
			select: () => {},
		}),
	);

it("shows no noticeboard before a resident proposes an activity", () => {
	expect(board([])).toBe("");
	expect(board([notice({ stage: "candidate" })])).toBe("");
});

it("shows the next notice and host while keeping counts, participants and later notices folded", () => {
	const html = board([
		notice({ id: "later", title: "Shared meal", startsAt: 3000, endsAt: 3060 }),
		notice({ participantIds: ["sam"], result: "Recorded outcome" }),
	]);
	const visible = html.split("<details")[0];
	expect(visible).toContain("Evening class");
	expect(visible).toContain("Day 2 · 18:00");
	expect(visible).toContain("Invitation posted");
	expect(visible).toContain("Follow host Lea");
	expect(visible).not.toContain("Shared meal");
	expect(visible).not.toContain("Recorded outcome");
	expect(visible).not.toContain("Sam");
	expect(html).toContain("3 received · 2 accepted · 0 attended");
	expect(html).toContain("Recorded participants");
	expect(html).toContain("Other hall notices · 1");
	expect(html).not.toContain("<details open");
});

it("keeps finished notices in the folded archive rather than calling them upcoming", () => {
	const html = board([notice({ stage: "closed", result: "Nobody arrived." })]);
	expect(html.split("<details")[0]).toContain("No upcoming hall notices.");
	expect(html.split("<details")[0]).not.toContain("Nobody arrived.");
	expect(html).toContain("Nobody arrived.");
});

it("does not infer personal invitation knowledge from public notices", () => {
	const html = renderToStaticMarkup(
		createElement(PersonInvitations, {
			person: {},
			town: { now: 2000, evenings: [notice()] },
		}),
	);
	expect(html).toBe("");
});

it("shows one current received invitation and folds prior replies without inventing acceptance", () => {
	const invitations: NonNullable<PersonView["invitations"]> = [
		{
			eventId: "past",
			title: "Earlier meal",
			startsAt: 1000,
			status: "declined",
		},
		{
			eventId: "class-one",
			title: "Evening class",
			startsAt: 2520,
			status: "heard",
		},
	];
	const html = renderToStaticMarkup(
		createElement(PersonInvitations, {
			person: { invitations },
			town: { now: 2535, evenings: [notice()] },
		}),
	);
	const visible = html.split("<details")[0];
	expect(visible).toContain("Evening class");
	expect(visible).toContain("Invitation received");
	expect(visible).not.toContain("Accepted");
	expect(visible).not.toContain("Earlier meal");
	expect(html).toContain("Earlier meal");
	expect(html).toContain("Declined");
	expect(html).not.toContain("<details open");
});
