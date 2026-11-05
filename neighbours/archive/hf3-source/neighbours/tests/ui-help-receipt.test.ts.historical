import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { Runtime } from "../src/core/runtime";
import { SpeakPanel } from "../src/ui/SpeakPanel";
import type { useVisitorSession } from "../src/ui/useVisitorSession";
import { createRuntime } from "./historical-runtime.ts";

it("acknowledges a completed hour only after HF has received the kept promise", () => {
	const r = createRuntime(42, 208) as Runtime;
	r.intervene({ kind: "player-move", placeId: "hall" });
	for (let n = 0; n < 7; n++) r.step();
	r.intervene({
		kind: "player-speak",
		actorId: "ada",
		affordanceId: "open-section",
		mode: "promise",
		pledge: { work: "carry-meals", by: 1080 },
	});
	const render = () =>
		renderToStaticMarkup(
			createElement(SpeakPanel, {
				session: { town: r.view() } as ReturnType<typeof useVisitorSession>,
				personId: "ada",
				showAction: false,
			}),
		);
	expect(render()).not.toContain("You kept your promise about that hour.");
	r.step();
	const pledge = r.view().player?.pledges[0];
	if (!pledge) throw Error("Missing promise");
	r.intervene({ kind: "player-work", pledgeId: pledge.id });
	while (r.view().player?.job) r.step();
	expect(r.s.player?.pledges[0]?.hfReported).toBe(true);
	expect(render()).toContain("You kept your promise about that hour.");
	expect(render()).toContain("Ada remembers");
	if (!r.s.player?.pledges[0]) throw Error("Missing completed promise");
	r.s.player.pledges[0].hfReported = false;
	expect(render()).not.toContain("You kept your promise about that hour.");
}, 60000);
