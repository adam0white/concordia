import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { labMode } from "../src/ui/lab-mode";
import { personRead, plainText } from "../src/ui/plain-english";
import type { useVisitorSession } from "../src/ui/useVisitorSession";

vi.mock("../src/ui/lab", () => ({
	LabPrivacy: () => createElement("label", {}, "Recording"),
}));
vi.mock("../src/ui/CastMenu", () => ({
	default: () => createElement("p", {}, "People saved in this browser"),
}));

import SessionMenu from "../src/ui/SessionMenu";

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
