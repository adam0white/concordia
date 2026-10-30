import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { TownRunOwner } from "../src/core/hf4-owner.ts";
import { MINUTE, nativeMilliseconds } from "../src/core/hf4-run.ts";
import { required } from "../src/core/invariants.ts";
import { playerRound } from "../src/core/player.ts";
import { SpeakPanel } from "../src/ui/SpeakPanel";
import type { useVisitorSession } from "../src/ui/useVisitorSession";
import { createRuntime } from "./current-town.ts";

/** Current UI projection fixture. No natural canonical inspection opportunity
 * or recurrence of an old numeric trajectory is claimed. */
it("keeps request chips before secondary covered work and preserves the displayed inspector question", () => {
	const town = createRuntime(42, 6).view(),
		player = required(town.player, "Missing player view");
	const nora = required(
		town.people.find((person) => person.id === "ada"),
		"Missing Nora",
	);
	nora.activity = "Waiting with a question for an inspector";
	nora.placeId = "hall";
	player.present = [
		{
			id: "ada",
			name: "Nora",
			known: true,
			activity: "Waiting for an inspector",
		},
	];
	player.helpOffers = [
		{
			toId: "ada",
			toName: "Nora",
			work: "cover-shift",
			placeId: "workshop",
			placeName: "Workshop",
			minutes: 60,
			endsAt: town.now + 60,
			label: "Cover a paid shift",
		},
	];
	nora.history.push({
		id: 200,
		at: town.now,
		kind: "question",
		actorId: "ada",
		text: "How can I tell whether the timber is safe?",
		causes: [],
		importance: 0.5,
	});
	const html = renderToStaticMarkup(
		createElement(SpeakPanel, {
			session: { town } as ReturnType<typeof useVisitorSession>,
			personId: "ada",
			showAction: false,
		}),
	);
	expect(html).toContain("Nora is waiting for an inspector");
	expect(html).toContain("How can I tell whether the timber is safe?");
	expect(html).toContain("Ask Nora to do something");
	expect(html).toContain("Cover an hour for Nora");
	expect(html.indexOf("Cover an hour for Nora")).toBeGreaterThan(
		html.indexOf("Ask Nora to</legend>"),
	);
}, 60000);

/** Actual paid work and public promise evidence must outlive the native receipt
 * window. No widened receipt window or inferred resident assent. */
it.each([false, true])(
	"retains actual help confirmation after64later inputs displace its receipt (same batch: %s)",
	(sameBatch) => {
		const runtime = createRuntime(42, 6);
		runtime.intervene({ kind: "player-move", placeId: "workshop" });
		const advanceTo = (at: number) => {
			runtime.s.owner.advance(nativeMilliseconds(at));
			runtime.s.now = runtime.s.owner.at / MINUTE;
			playerRound(runtime);
		};
		advanceTo(required(runtime.s.player?.job, "Missing walk").arriveAt);
		runtime.intervene({ kind: "player-help", actorId: "ada" });
		advanceTo(required(runtime.s.player?.job, "Missing work").endsAt);
		const pledge = required(runtime.s.player?.pledges[0], "Missing pledge");
		const input = required(pledge.hfInputId, "Missing promise input");
		expect(pledge.status).toBe("kept");
		expect(pledge.hfReported).toBe(false);
		if (!sameBatch) {
			runtime.s.owner.advance(runtime.s.owner.at + 1);
			runtime.s.now = runtime.s.owner.at / MINUTE;
			playerRound(runtime);
			expect(pledge.hfReported).toBe(true);
		}
		const revision = runtime.s.owner.revision;
		for (let i = 0; i < 65; i++)
			runtime.s.owner.enqueue("world.changed", {
				expectedRevision: revision + i,
				revision: revision + i + 1,
				put: [],
				remove: [],
				hostState: null,
			});
		runtime.s.owner.advance(runtime.s.owner.at + 1);
		runtime.s.now = runtime.s.owner.at / MINUTE;
		if (sameBatch)
			expect(
				runtime.s.owner.last?.events.some(
					(event) =>
						event.person === "ada" &&
						event.data.kind === "input-disposed" &&
						event.data.disposition.inputId === input &&
						event.data.disposition.kind === "consumed" &&
						event.data.disposition.reason === "applied",
				),
			).toBe(true);
		playerRound(runtime);
		expect(runtime.s.owner.accepted(input)).toBe(false);
		expect(runtime.view().player?.pledges[0]?.remembered).toBe(true);
		expect(pledge.hfReported).toBe(true);
		// This isolated faculty advances the actual owner directly. It is not a
		// complete host-control replay. Check complete native continuation instead.
		const complete = runtime.export(),
			cold = TownRunOwner.restore(complete.owner);
		expect(complete.physical.player?.pledges[0]?.hfReported).toBe(true);
		expect(cold.export()).toStrictEqual(complete.owner);
		runtime.s.owner.advance(runtime.s.owner.at + 1);
		cold.advance(cold.at + 1);
		runtime.s.now = runtime.s.owner.at / MINUTE;
		playerRound(runtime);
		expect(cold.export()).toStrictEqual(runtime.s.owner.export());
		expect(runtime.view().player?.pledges[0]?.remembered).toBe(true);
	},
	60000,
);

/** Isolated physical player faculty with an actual six-person Run. The player
 * completes the real walk and paid hour. No resident/body/time/RNG is edited.
 * This is not a whole-town natural trajectory or wire-replay proof. */
it("shows direct credit only after the actual covered hour completes and its Run receipt is accepted, preserving later help", () => {
	const runtime = createRuntime(42, 6);
	runtime.intervene({ kind: "player-move", placeId: "workshop" });
	function advanceTo(at: number) {
		runtime.s.owner.advance(nativeMilliseconds(at));
		runtime.s.now = runtime.s.owner.at / MINUTE;
		playerRound(runtime);
	}
	const travel = required(runtime.s.player?.job, "Missing actual walk");
	advanceTo(travel.arriveAt);
	expect(runtime.s.player?.job).toBeUndefined();
	expect(runtime.s.player?.place).toBe("workshop");
	const before = runtime.actor("ada").wealth;
	runtime.intervene({ kind: "player-help", actorId: "ada" });
	const render = () =>
		renderToStaticMarkup(
			createElement(SpeakPanel, {
				session: { town: runtime.view() } as ReturnType<
					typeof useVisitorSession
				>,
				personId: "ada",
				showAction: false,
			}),
		);
	expect(render()).not.toContain("You covered that hour for me.");
	const work = required(runtime.s.player?.job, "Missing actual covered hour");
	expect(work.kind).toBe("work");
	advanceTo(work.endsAt);
	expect(runtime.actor("ada").wealth).toBe(before + 2);
	expect(runtime.s.player?.job).toBeUndefined();
	expect(runtime.view().player?.pledges[0]?.status).toBe("kept");
	expect(render()).not.toContain("You covered that hour for me.");
	runtime.s.owner.advance(runtime.s.owner.at + 1);
	runtime.s.now = runtime.s.owner.at / MINUTE;
	playerRound(runtime);
	expect(runtime.view().player?.pledges[0]?.remembered).toBe(true);
	expect(render()).toContain(
		"You covered that hour for me. I received the two coins.",
	);
	const wealth = runtime.actor("ada").wealth;
	playerRound(runtime);
	expect(runtime.actor("ada").wealth).toBe(wealth);
	const html = render();
	expect(html).toContain("Nora remembers");
	expect(html).toContain("Cover an hour for Nora");
}, 60000);
