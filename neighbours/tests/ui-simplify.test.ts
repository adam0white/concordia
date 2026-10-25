import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { actionWords, ingWords, jobLine } from "../src/core/voicing";
import { labMode } from "../src/ui/lab-mode";
import { personRead, plainText } from "../src/ui/plain-english";
import type { useVisitorSession } from "../src/ui/useVisitorSession";

vi.mock("../src/ui/lab", () => ({
	LabPrivacy: () => createElement("label", {}, "Recording"),
}));
vi.mock("../src/ui/CastMenu", () => ({
	default: () => createElement("p", {}, "People saved in this browser"),
}));

import type { TownView } from "../src/contracts";
import SessionMenu from "../src/ui/SessionMenu";
import Stories from "../src/ui/Stories";

afterEach(() => vi.unstubAllGlobals());
it("requires the exact lab flag", () => {
	for (const search of ["", "?lab=true", "?lab=0", "?laboratory=1"])
		expect(labMode(search)).toBe(false);
	expect(labMode("?lab=1")).toBe(true);
});
it("ordinary menu contains only the approved actions; diagnostics remain available", () => {
	const session = { town: { day: 1 } } as unknown as ReturnType<
		typeof useVisitorSession
	>;
	const render = () =>
		renderToStaticMarkup(
			createElement(SessionMenu, {
				session,
				open: true,
				close: () => {},
				onNavigate: () => {},
			}),
		);
	vi.stubGlobal("location", { search: "" });
	const ordinary = render();
	for (const text of [
		"Feedback",
		"Full screen",
		"All games",
		"Recording",
		"New game",
		"Resume",
	])
		expect(ordinary).toContain(text);
	for (const text of [
		"People saved in this browser",
		"Compare possible outcomes",
		"Recorded studies",
		"town&#x27;s pace",
		"To the title page",
		"Switch light or dark colours",
	])
		expect(ordinary).not.toContain(text);
	expect(ordinary).toContain('href="https://human.adamwhite.work/games/"');
	vi.stubGlobal("location", { search: "?lab=1" });
	expect(render()).toContain("People saved in this browser");
	expect(render()).toContain("Recorded studies");
});
it("displays complete source prose and external narration without lookup substitutions", () => {
	const text =
		"They seem cheerful and a little tired. They promised to repair the door.";
	expect(personRead("Nora", text)).toBe(text);
	const external = "Not now — after I pray.";
	expect(plainText(external)).toBe(external);
});

it("projects complete routed narration without changing the recorded strings", () => {
	const guests =
		"Reese Reed, Ellis Diaz, Charlie Carter, Alex Patel, Alex Silva, Rowan Stone, Cameron Silva, Cameron Das, Quinn Khan";
	expect(plainText(`${guests} ate with the host at Sam’s shared supper.`)).toBe(
		"Reese Reed, Ellis Diaz and 7 other neighbours ate with Sam at his shared supper.",
	);
	for (const names of [
		"Reese Reed",
		"Reese Reed, Ellis Diaz",
		"Reese Reed, Ellis Diaz, Charlie Carter",
	])
		expect(
			plainText(
				`${names} received the practical lesson at Nora’s practical class.`,
			),
		).toBe(
			`${names === "Reese Reed" ? names : names === "Reese Reed, Ellis Diaz" ? "Reese Reed and Ellis Diaz" : "Reese Reed, Ellis Diaz and 1 other neighbour"} received the practical lesson from Nora at her practical class.`,
		);
	for (const action of [
		"started to host",
		"stopped hosting",
		"could not finish hosting",
		"stopped on the way to Community hall before starting to host",
	])
		expect(plainText(`Nora ${action} Nora’s practical class.`)).toBe(
			`Nora ${action} her practical class.`,
		);
	for (const action of [
		"started to get the hall ready for",
		"stopped getting the hall ready for",
		"could not finish getting the hall ready for",
		"stopped on the way to Community hall before starting to get the hall ready for",
	])
		expect(plainText(`Sam ${action} Sam’s shared supper.`)).toBe(
			`Sam ${action} his shared supper.`,
		);
	expect(plainText("Nora finished hosting Nora’s practical class.")).toBe(
		"Nora finished hosting her practical class.",
	);
	expect(
		plainText("Sam finished getting the hall ready for Sam’s shared supper."),
	).toBe("Sam finished getting the hall ready for his shared supper.");
	expect(
		plainText("Derya finished getting the hall ready for Sam’s shared supper."),
	).toBe("Derya finished getting the hall ready for Sam’s shared supper.");
	expect(
		plainText(
			"Derya stopped visiting the neighbours at the hall at Flooded hall and did something else.",
		),
	).toBe(
		"Derya stopped visiting the neighbours at the flooded hall and did something else.",
	);
	expect(
		plainText(
			"I cannot do it now. After I finish this task (Repair the flood-damaged hall), I will do it.",
		),
	).toBe(
		"I cannot do it now. After I finish this task (repair the flood-damaged hall), I will do it.",
	);
	expect(
		personRead("Nora", "Nora plans to keep having a drink of water."),
	).toBe("Nora seems thirsty.");
	expect(plainText("0 meals arrived by handcart.")).toBe(
		"No meals arrived by handcart.",
	);
	expect(plainText("Nora started to keep this section closed.")).toBe(
		"Nora started to keep the inspected section of the hall closed.",
	);
	for (const [held, conflict] of [
		["shared supper", "practical class"],
		["practical class", "shared supper"],
	])
		expect(
			plainText(
				`Sam prepared the hall for the ${held} on Day 19 at 18:00. The other activity cannot use the same room at that time.`,
			),
		).toBe(
			`Sam prepared the hall for the ${held} on Day 19 at 18:00. The ${conflict} cannot use the hall at that time.`,
		);
	expect(plainText("Keep the annex closed")).toBe("Keep the annex closed");
});

it("projects a single outcome in the actual story card", () => {
	const html = renderToStaticMarkup(
		createElement(Stories, {
			stories: [
				{
					id: "closed",
					title: "Hall inspection",
					kind: "outcome",
					actorIds: [],
					participantIds: [],
					summaries: ["Nora started to keep this section closed."],
					eventIds: [],
					missingEventIds: [],
				},
			],
			town: { people: [] } as unknown as TownView,
			select: () => {},
		}),
	);
	expect(html).toContain(
		"Nora started to keep the inspected section of the hall closed.",
	);
	expect(html).not.toContain("this section");
});

it("uses owner pronouns through every generated evening job phase", () => {
	for (const [name, possessive, activity] of [
		["Nora", "her", "practical class"],
		["Sam", "his", "shared supper"],
	] as const) {
		for (const label of [
			`Host ${name}’s ${activity} at the hall`,
			`Prepare the hall for ${name}’s ${activity}`,
			`Invite neighbours and promise to host ${name}’s ${activity}`,
		]) {
			const lines = [
				`${name} started to ${actionWords(label)}.`,
				`${name} stopped ${ingWords(label)} at Community hall.`,
				`${name} stopped on the way to Community hall before starting to ${actionWords(label)}.`,
				jobLine(name, label, false),
				jobLine(name, label, true),
			];
			for (const line of lines) {
				const projected = plainText(line);
				expect(projected).toContain(`${possessive} ${activity}`);
				expect(projected).not.toContain(`${name}’s ${activity}`);
				expect(projected.startsWith(name)).toBe(true);
			}
		}
	}
});
