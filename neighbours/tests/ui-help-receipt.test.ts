import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { SpeakPanel } from "../src/ui/SpeakPanel";
import type { useVisitorSession } from "../src/ui/useVisitorSession";
import { createRuntime } from "./current-town.ts";

/** UI receipt sensitivity; actual public voice receipt acceptance is checked below.
 * No natural canonical hall opportunity or completed player hour is claimed here.
 */
it("acknowledges a completed hour only after its actual native receipt is accepted", () => {
	const runtime = createRuntime(42, 6);
	const owner = runtime.s.owner;
	const inputId = owner.enqueue("voice.promise-received", {
		person: "elin",
		voiceId: "player",
		evidenceId: "receipt-control:completed-hour",
		promise: { kept: true, action: "pledge:carry-meals" },
	});
	const town = runtime.view();
	if (!town.player) throw Error("Missing public player view");
	const pledge = {
		id: "receipt-control",
		toId: "elin",
		toName: "Derya",
		work: "carry-meals" as const,
		label: "Carry meals",
		placeId: "market",
		dueBy: 1080,
		status: "kept" as const,
		remembered: owner.accepted(inputId),
		result: "One hour of carried meals recorded at Day1,09:00.",
	};
	town.player.pledges = [pledge];
	const render = () =>
		renderToStaticMarkup(
			createElement(SpeakPanel, {
				session: { town } as ReturnType<typeof useVisitorSession>,
				personId: "elin",
				showAction: false,
			}),
		);
	expect(render()).not.toContain("You kept your promise about that hour.");
	owner.advance(owner.at + 1);
	pledge.remembered = owner.accepted(inputId);
	expect(pledge.remembered).toBe(true);
	expect(render()).toContain("You kept your promise about that hour.");
	expect(render()).toContain("Derya remembers");
	pledge.remembered = false;
	expect(render()).not.toContain("You kept your promise about that hour.");
});
