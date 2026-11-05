import { expect, it } from "vitest";
import type { NativeTownArchive } from "../src/core/runtime.ts";
import { createRuntime } from "../src/core/scenario.ts";

it("reveals only the actual chosen private answer after its physical conversation completes", () => {
	const runtime = createRuntime(42, 6);
	runtime.intervene({ kind: "player-private", actorId: "elin" });
	const save = runtime.export() as NativeTownArchive;
	const elin = save.physical.people.find((person) => person.id === "elin");
	expect(elin?.privateConversation).toBeUndefined();
	const decision = save.owner.run.current.people.elin?.trace.findLast(
		(record) =>
			["private-share", "private-decline"].includes(
				record.chosenAffordanceId ?? "",
			),
	);
	expect(decision).toBeDefined();
	const answer = save.physical.events.findLast(
		(event) => event.kind === "player-answer",
	);
	expect(answer).toBeDefined();
	expect(save.physical.now).toBeGreaterThan(481);
	if (decision?.chosenAffordanceId === "private-share")
		expect(elin?.disclosures?.at(-1)?.text).toBe(answer?.text);
	else {
		expect(elin?.disclosures).toBeUndefined();
		expect(answer?.text).toContain("keeps the matter private");
	}
});
