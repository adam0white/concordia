import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ErrorMessage from "../src/ui/ErrorMessage";

function render(message: string) {
	return renderToStaticMarkup(createElement(ErrorMessage, { message }));
}

describe("action-owned error recovery", () => {
	it("explains a rejected import without asking the visitor to reload", () => {
		const html = render(
			"This save could not be loaded. Your current town is unchanged. Traceback: Invalid Concordia town checkpoint.",
		);
		expect(html).toContain(
			"This save could not be loaded. Your current town is unchanged.",
		);
		expect(html).toContain("Technical details");
		expect(html).not.toContain("You can reload");
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
