import assert from "node:assert/strict";
import { expect, it } from "vitest";
import { Runtime } from "../src/core/runtime.ts";
import type { Save } from "../src/core/state.ts";
import { createRuntime, restoreRuntime } from "./historical-runtime.ts";

it("retains attended bulletin evidence once under its host event ID and explicit source", () => {
	const r = new Runtime(createRuntime(42, 8).export() as Save);
	r.intervene({ kind: "share-news" });
	const host = r.s.events.at(-1);
	assert(host);
	const ada = r.actor("ada");
	expect(ada.received?.find((e) => e.id === host.id)).toMatchObject({
		source: "town-bulletin",
		targetId: "ada",
	});
	expect(
		ada.person.memory.episodes.filter((e) => e.action === "hall-news"),
	).toHaveLength(1);
	expect(() => restoreRuntime(r.export())).not.toThrow();
});
it("does not deliver a spoken bulletin to sleeping or dead recipients", () => {
	const r = new Runtime(createRuntime(42, 8).export() as Save);
	r.actor("ada").person.body.asleep = true;
	r.actor("musa").person.body.alive = false;
	r.intervene({ kind: "share-news" });
	// Delivery is a host fact. HF decides attention only after an audible message arrives.
	expect(
		r
			.actor("ada")
			.person.memory.episodes.filter((e) => e.action === "hall-news"),
	).toHaveLength(0);
	expect(
		r.actor("ada").received?.some((e) => e.source === "town-bulletin"),
	).toBeUndefined();
	expect(r.actor("musa").received).toBeUndefined();
	expect(
		r
			.actor("musa")
			.person.memory.episodes.filter((e) => e.action === "hall-news"),
	).toHaveLength(0);
});
