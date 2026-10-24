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
	default: () => createElement("p", {}, "Browser continuity"),
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
		"Browser continuity",
		"Compare futures",
		"Recorded studies",
		"town&#x27;s pace",
		"To the title page",
		"Paper or lamplight",
	])
		expect(ordinary).not.toContain(text);
	expect(ordinary).toContain('href="https://human.adamwhite.work/games/"');
	vi.stubGlobal("location", { search: "?lab=1" });
	expect(render()).toContain("Browser continuity");
	expect(render()).toContain("Recorded studies");
});
it("projects old impressions without changing their source", () => {
	const text = "Cheerful, a little tired. Promised to repair the door.";
	expect(personRead("Nora", text)).toBe(
		"Nora looks cheerful, a little tired. Nora promised to repair the door.",
	);
	expect(text).toBe("Cheerful, a little tired. Promised to repair the door.");
	expect(plainText("Set on working a paid shift")).toBe(
		"They plan to continue working a paid shift",
	);
	expect(plainText("Derya says she has not corrected it yet.")).toBe(
		"Derya says she has not corrected it yet.",
	);
});
