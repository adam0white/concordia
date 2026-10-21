import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { createRuntime, restoreRuntime, stateHash } from "../src/core/index";
import QueuedWalkNotice from "../src/ui/QueuedWalkNotice";

it("acknowledges only an accepted paused walk without advancing time", () => {
	const runtime = createRuntime(42, 8);
	const render = (playing = false, advancing = false) =>
		renderToStaticMarkup(
			createElement(QueuedWalkNotice, {
				town: runtime.view(),
				playing,
				advancing,
			}),
		);
	expect(render()).toBe("");
	const before = runtime.view().now;
	runtime.intervene({ kind: "player-move", placeId: "hall" });
	expect(runtime.view().now).toBe(before);
	expect(render()).toContain("You set off automatically");
	expect(render(true)).toContain("automatically");
	expect(render(false, true)).toBe("");
	runtime.step();
	expect(render()).toContain("You keep walking automatically");
	for (let i = 0; i < 12; i++) runtime.step();
	expect(render()).toBe("");
});

it("acknowledges accepted stopped work and clears on resumed playback", () => {
	const town = createRuntime(42, 8).view();
	if (!town.player) throw Error("Missing player");
	town.player.job = {
		kind: "work",
		fromId: "market",
		toId: "market",
		departedAt: town.now,
		arriveAt: town.now,
		endsAt: town.now + 60,
		work: "carry-meals",
	};
	const render = (playing = false) =>
		renderToStaticMarkup(
			createElement(QueuedWalkNotice, { town, playing, advancing: false }),
		);
	expect(render()).toContain("Your hour starts automatically");
	expect(render(true)).toContain("automatically");
	town.now += 15;
	expect(render()).toContain("Your hour continues automatically");
});

it("restores stopped travel from accepted state without changing exact continuation", () => {
	const runtime = createRuntime(42, 8);
	runtime.intervene({ kind: "player-move", placeId: "hall" });
	const restored = restoreRuntime(runtime.export());
	const before = stateHash(restored.export());
	expect(
		renderToStaticMarkup(
			createElement(QueuedWalkNotice, {
				town: restored.view(),
				playing: false,
				advancing: false,
			}),
		),
	).toContain("You set off automatically");
	expect(stateHash(restored.export())).toBe(before);
	for (let i = 0; i < 8; i++) {
		runtime.step();
		restored.step();
	}
	expect(stateHash(restored.export())).toBe(stateHash(runtime.export()));
	expect(
		renderToStaticMarkup(
			createElement(QueuedWalkNotice, {
				town: createRuntime(73, 8).view(),
				playing: false,
				advancing: false,
			}),
		),
	).toBe("");
});

it("shows an honest pending action before any accepted host job", () => {
	const town = createRuntime(42, 8).view();
	const html = renderToStaticMarkup(
		createElement(QueuedWalkNotice, {
			town,
			playing: false,
			advancing: false,
			pending: true,
		}),
	);
	expect(html).toContain("Requesting your action…");
	expect(html).not.toContain("Press Play");
	expect(html).toContain('aria-busy="true"');
});
