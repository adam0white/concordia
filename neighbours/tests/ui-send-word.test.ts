import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, test, vi } from "vitest";
import type { useVisitorSession } from "../src/ui/useVisitorSession";

const preference = vi.hoisted(() => ({
	switchedOff: false,
	privacySignalOn: false,
	telemetryOn: true,
}));
vi.mock("../src/ui/lab", () => ({
	lab: {},
	LabPrivacy: () => createElement("label", {}, "Record play for the lab"),
	useLabRecording: () => preference,
}));

import SendWord from "../src/ui/SendWord";

const session = {
	town: { day: 3, seed: 42 },
	commandPending: false,
	exportSave: () => {},
	downloadUrl: "",
} as unknown as ReturnType<typeof useVisitorSession>;
const render = () =>
	renderToStaticMarkup(createElement(SendWord, { session, onClose: () => {} }));
afterEach(() => {
	preference.switchedOff = false;
	preference.privacySignalOn = false;
	preference.telemetryOn = true;
	vi.unstubAllGlobals();
});
test("player recording opt-out permits notes and retains the local copy action", () => {
	preference.switchedOff = true;
	preference.telemetryOn = false;
	const html = render();
	expect(html).toContain("Share this run and my play with the lab");
	expect(html).not.toContain("Record play for the lab");
	expect(html).not.toContain('checked=""');
	expect(html).not.toMatch(/disabled="">Submit</);
	expect(html).toContain("Keep a copy of this run");
});
test("browser privacy permits an unlinked note", () => {
	preference.privacySignalOn = true;
	preference.telemetryOn = false;
	const html = render();
	expect(html).toContain("Share this run and my play with the lab");
	expect(html).not.toContain("Record play for the lab");
	expect(html).not.toMatch(/disabled="">Submit</);
	expect(html).not.toContain("Your run, saves and log reach us on their own.");
});
test("normal recording allows feedback and prefills a remembered optional name", () => {
	vi.stubGlobal("localStorage", { getItem: () => "Returning tester" });
	const html = render();
	expect(html).toContain('value="Returning tester"');
	expect(html).toContain("Your name or tester id");
	expect(html).not.toContain("Share this run and my play with the lab");
	expect(html).not.toMatch(/disabled="">Submit</);
});
