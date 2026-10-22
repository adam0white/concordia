import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, test, vi } from "vitest";
import type { useVisitorSession } from "../src/ui/useVisitorSession";

const preference = vi.hoisted(() => ({
	switchedOff: false,
	privacySignalOn: false,
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
	vi.unstubAllGlobals();
});
test("player recording opt-out blocks sending and retains the local copy action", () => {
	preference.switchedOff = true;
	const html = render();
	expect(html).toContain("Recording is off, so nothing is sent.");
	expect(html).toContain("Record play for the lab");
	expect(html).toMatch(/disabled="">Send</);
	expect(html).toContain("Keep a copy of this run");
});
test("browser privacy requires explicit run consent before Send", () => {
	preference.privacySignalOn = true;
	const html = render();
	expect(html).toContain("Send this run with my note");
	expect(html).toMatch(/disabled="">Send</);
	expect(html).not.toContain("Your run, saves and log reach us on their own.");
});
test("normal recording allows feedback and prefills a remembered optional name", () => {
	vi.stubGlobal("localStorage", { getItem: () => "Returning tester" });
	const html = render();
	expect(html).toContain('value="Returning tester"');
	expect(html).toContain("Your name or tester id");
	expect(html).not.toMatch(/disabled="">Send</);
});
