import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { createRuntime } from "../src/core/index";
import { SpeakPanel } from "../src/ui/SpeakPanel";
import type { useVisitorSession } from "../src/ui/useVisitorSession";

it("carries Ada's current inspector question into the conversation before another request", () => {
	const r = createRuntime(42, 208);
	r.intervene({ kind: "player-move", placeId: "hall" });
	for (let i = 0; i < 6; i++) r.step();
	const html = renderToStaticMarkup(
		createElement(SpeakPanel, {
			session: { town: r.view() } as ReturnType<typeof useVisitorSession>,
			personId: "ada",
			showAction: false,
		}),
	);
	expect(html).toContain("Ada is waiting for an inspector");
	expect(html).toContain("How can I tell whether the timber is safe?");
	expect(html).toContain("Ask Ada to do something");
	expect(html).toContain("Cover an hour for Ada");
	expect(html.indexOf("Cover an hour for Ada")).toBeLessThan(
		html.indexOf("Ask them to"),
	);
}, 60000);

it("shows direct credit only after the real covered shift reaches HF and keeps later help visible", () => {
	const r = createRuntime(42, 208);
	r.intervene({ kind: "player-move", placeId: "hall" });
	for (let i = 0; i < 6; i++) r.step();
	r.intervene({ kind: "player-help", actorId: "ada" });
	const render = () =>
		renderToStaticMarkup(
			createElement(SpeakPanel, {
				session: { town: r.view() } as ReturnType<typeof useVisitorSession>,
				personId: "ada",
				showAction: false,
			}),
		);
	expect(render()).not.toContain("You covered that hour for me.");
	while (r.view().player?.job) r.step();
	expect(render()).toContain(
		"You covered that hour for me. I received the two coins.",
	);
	// A historical receipt cannot hide a new host opportunity on a later visit.
	const town = r.view();
	if (!town.player) throw Error("Missing player");
	town.player.present.push({
		id: "ada",
		name: "Ada",
		known: true,
		activity: "Free to choose",
	});
	town.player.helpOffers = [
		{
			toId: "ada",
			toName: "Ada",
			work: "cover-shift",
			placeId: "workshop",
			placeName: "Workshop",
			minutes: 60,
			endsAt: town.now + 60,
			label: "Cover one paid shift for Ada",
		},
	];
	const html = renderToStaticMarkup(
		createElement(SpeakPanel, {
			session: { town } as ReturnType<typeof useVisitorSession>,
			personId: "ada",
			showAction: false,
		}),
	);
	expect(html).toContain("Ada remembers");
	expect(html).toContain("Cover an hour for Ada");
}, 60000);
