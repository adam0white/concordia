/** Timestamp boundary control using an actual native producer decision.
 * This does not claim a completed annex investigation or learned-method opportunity. */
import { expect, it } from "vitest";
import { assistanceDecision } from "../src/core/assistance.ts";
import { HF_SOURCE } from "../src/core/hf-version.ts";
import { MINUTE } from "../src/core/hf4-run.ts";
import { required } from "../src/core/invariants.ts";
import { createRuntime, restoreRuntime } from "./current-town.ts";

it("keeps native provenance across the host minutes/native milliseconds boundary and cold restore", () => {
	const town = createRuntime(42, 6);
	town.step();
	const event = required(
		town.s.owner.current.events.find((item) => {
			if (!item.person || item.data.kind !== "decision") return false;
			const resident = town.actor(item.person);
			return (
				resident.decision?.decidedAt !== undefined &&
				resident.decision.chosen === item.data.decision.chosenAffordanceId &&
				resident.decision.decidedAt * MINUTE === item.data.decision.at
			);
		}),
		"Missing actual native decision at the host projection boundary",
	);
	if (!event.person || event.data.kind !== "decision")
		throw Error("Wrong native event kind");
	const resident = town.actor(event.person);
	const record = {
		...event.data.decision,
		narration: event.narration.map((line) => line.text).join(" "),
	};
	expect(record.at).toBeGreaterThan(0);
	const projected = assistanceDecision(resident, record);
	expect(projected.source).toBe(HF_SOURCE);
	expect(projected.id).toBe(record.id);
	expect(projected.methodTerms).toEqual(
		record.considered
			.find((choice) => choice.affordanceId === record.chosenAffordanceId)
			?.terms.filter((term) => term.source.startsWith("method:"))
			.map((term) => ({ source: term.source, value: term.value })) ?? [],
	);
	expect(
		assistanceDecision(resident, { ...record, at: record.at + 1 }).source,
	).toBe("Host control");
	expect(
		assistanceDecision(resident, { ...record, id: "host-control" }).source,
	).toBe("Host control");
	const packet = town.export();
	const cold = restoreRuntime(packet);
	expect(cold.export()).toEqual(packet);
	expect(assistanceDecision(cold.actor(event.person), record)).toEqual(
		projected,
	);
});
