import assert from "node:assert/strict";
import { expect, it } from "vitest";
import { createRuntime, restoreRuntime } from "../src/core/index.ts";
import { Runtime } from "../src/core/runtime.ts";
import type { Save } from "../src/core/state.ts";

function round(
	r: Runtime,
	requested: Record<string, string> = {},
	quiet = false,
) {
	for (const id of r.prepareRound()) {
		const actor = r.actor(id);
		const desired = requested[id];
		const choices = r.getChoices(id);
		const action =
			actor.job?.offer.id ??
			(desired && choices.some((c) => c.id === desired)
				? desired
				: quiet && choices.some((c) => c.id === "drink")
					? "drink"
					: r.choose(id));
		r.apply(id, action);
	}
}
function until(
	r: Runtime,
	done: () => boolean,
	requested: Record<string, string> = {},
	quiet = false,
	limit = 384,
) {
	for (let i = 0; i < limit && !done(); i++) round(r, requested, quiet);
	expect(done(), `Scenario did not reach its milestone at ${r.s.now}`).toBe(
		true,
	);
}
function conserved(r: Runtime) {
	expect(
		r.s.places.reduce((n, p) => n + p.stock, 0) +
			r.s.consumed +
			r.s.people.reduce((n, p) => n + (p.job?.food ?? 0), 0),
	).toBe(r.s.initialFood + r.s.produced);
	expect(r.view().diagnostics.filter((d) => d.severity === "error")).toEqual(
		[],
	);
}
function market(r: Runtime) {
	const place = r.s.places.find((p) => p.id === "market");
	assert(place);
	return place.stock;
}
function setup() {
	const r = new Runtime(createRuntime(42, 8).export() as Save);
	// The handcart scenario is not about timber: start from dry timber so repairs hold (timber.ts).
	r.s.timber = { damp: 0 };
	until(r, () => r.s.hall >= 12, {
		ada: "repair",
		lea: "repair",
		ravi: "repair",
	});
	until(r, () => r.s.hallSafe, { lea: "open-section" });
	until(r, () => !!r.s.handcart);
	until(r, () => !!r.s.handcart?.raviGoalId, { ravi: "work" });
	until(r, () => r.s.handcart?.progress === 3, { ravi: "cart-slow" });
	return r;
}
function completeProduction(
	r: Runtime,
	id: string,
	expected: number,
	action = "supply",
) {
	until(
		r,
		() => r.actor(id).job?.offer.action === action,
		{ [id]: action },
		true,
	);
	const job = r.actor(id).job;
	assert(job);
	const eventId = job.event;
	// Finish unrelated production before measurement; this controlled interval has no new jobs that produce food.
	until(
		r,
		() =>
			!r.s.people.some(
				(p) =>
					p.person.id !== id &&
					["grow", "supply"].includes(p.job?.offer.action ?? ""),
			),
		{},
		true,
	);
	const reserved = () => r.s.people.reduce((n, p) => n + (p.job?.food ?? 0), 0);
	const before = r.s.produced,
		stockBefore = market(r),
		foodBefore = r.s.consumed,
		reservedBefore = reserved();
	if (r.actor(id).job?.event !== eventId)
		throw Error("Supply finished before measurement");
	let scheduled = 0;
	for (let i = 0; i < 16 && r.actor(id).job?.event === eventId; i++) {
		const at = r.s.now,
			produced = r.s.produced;
		round(r, {}, true);
		const shipment = r.s.events
			.filter((e) => e.kind === "delivery" && e.at > at && e.at <= r.s.now)
			.reduce((n, e) => n + Number(e.text.split(" ")[0]), 0);
		scheduled += shipment;
		expect(r.s.produced - produced - shipment).toBe(
			r.actor(id).job?.event === eventId ? 0 : expected,
		);
	}
	expect(r.actor(id).job?.event).not.toBe(eventId);
	expect(r.s.produced - before - scheduled).toBe(expected);
	expect(
		market(r) -
			stockBefore +
			r.s.consumed -
			foodBefore +
			reserved() -
			reservedBefore -
			scheduled,
	).toBe(expected);
	conserved(r);
}

it("a returned cart adds one unit only on Jo's completed supply trip and restores exactly", () => {
	const r = setup();
	expect(r.s.handcart?.handover).toBeUndefined();
	expect(r.view().handcart?.completedAt).toBe(
		r.s.handcart?.work.at(-1)?.endedAt,
	);
	expect(r.view().handcart?.returnedAt).toBeUndefined();
	completeProduction(r, "jo", 5);
	until(
		r,
		() => !!r.s.handcart?.handover,
		{ ravi: "cart-handover", jo: "supply" },
		true,
	);
	const returned = r.s.handcart?.handover;
	assert(returned);
	expect(returned.kind).toBe("cart-returned");
	expect(r.view().handcart?.returnedAt).toBe(returned.at);
	expect(r.view().handcart?.completedAt).toBeLessThan(returned.at);
	expect(r.actor("jo").received?.some((e) => e.id === returned.id)).toBe(true);
	conserved(r);
	const copy = restoreRuntime(r.export()) as Runtime;
	for (let i = 0; i < 8; i++) {
		round(r, {}, true);
		round(copy, {}, true);
	}
	expect(copy.export()).toEqual(r.export());
	completeProduction(r, "jo", 6);
	completeProduction(r, "musa", 5);
	completeProduction(r, "jo", 3, "grow");
});
