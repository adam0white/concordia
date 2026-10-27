import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ErrorMessage from "../src/ui/ErrorMessage";

beforeEach(() => vi.stubGlobal("location", { search: "?lab=1" }));
afterEach(() => vi.unstubAllGlobals());
function render(message: string) {
	return renderToStaticMarkup(createElement(ErrorMessage, { message }));
}

describe("action-owned error recovery", () => {
	it("explains a rejected import without asking the visitor to reload", () => {
		const html = render(
			"This save could not be loaded. Your current town is unchanged. Traceback: Invalid Concordia town checkpoint.",
		);
		expect(html).toContain("Your current town is unchanged.");
		expect(html).not.toContain("Technical details");
		expect(html).not.toContain("You can reload");
	});
	it("gives a start-fresh explanation for a short old-export rejection in lab mode", () => {
		const html = render(
			"This save could not be loaded. Your current town is unchanged. Activity differs from host rules",
		);
		expect(html).toContain("Start a new game to use this version.");
		expect(html).toContain("Your current town is unchanged.");
	});
	it("retains the protected corrupt device-save warning", () => {
		const html = render(
			"The saved town could not be restored. Traceback: invalid packet",
		);
		expect(html).toContain(
			"Its device save is preserved while this fresh town is paused.",
		);
		expect(html).toContain("Taking an action will replace that save.");
	});
	it("does not infer an import from arbitrary technical error text", () => {
		const html = render(
			"Traceback: the intervention called restore: but failed",
		);
		expect(html).toContain("The town could not complete that action.");
		expect(html).not.toContain("Your current town is unchanged.");
	});
});

it("keeps raw errors out of the ordinary recovery message", () => {
	vi.stubGlobal("location", { search: "?lab=true" });
	const html = render("Shelf unavailable. Use a local file.");
	expect(html).not.toContain("Shelf unavailable");
	expect(html).not.toContain("Use a local file");
	expect(html).not.toContain("Technical details");
	expect(html).toContain("Feedback");
});

it("preserves compression recovery without exposing the raw exception", () => {
	const html = render(
		"This save could not be compressed. The current town is unchanged. Test compression failure",
	);
	expect(html).toContain(
		"This save could not be compressed. The current town is unchanged.",
	);
	expect(html).not.toContain("Test compression failure");
	expect(html).not.toContain("reload");
});
