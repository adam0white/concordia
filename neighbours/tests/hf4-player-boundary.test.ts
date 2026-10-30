import { expect, it } from "vitest";
import { nativeMilliseconds } from "../src/core/hf4-run.ts";
import { createRuntime, restoreRuntime } from "./current-town.ts";

it("settles the actual speech-selected physical boundary at its exact ingress and cold replays the accepted control", () => {
	const runtime = createRuntime(42, 6);
	runtime.intervene({
		kind: "player-speak",
		actorId: "elin",
		affordanceId: "rest",
		mode: "ask",
	});
	const packet = runtime.export();
	expect(packet.physical.pending).toEqual([]);
	expect(packet.owner.run.current.pending).toEqual([]);
	expect(nativeMilliseconds(packet.physical.now)).toBe(
		packet.owner.run.current.at,
	);
	for (const person of packet.physical.people)
		if (person.job) {
			const activity = packet.owner.run.current.people[person.id]?.activity;
			expect(activity).toBeDefined();
			expect(person.job.startedAt).toBe(activity?.startedAt);
			expect(nativeMilliseconds(person.job.end)).toBe(activity?.endsAt);
		}
	expect(restoreRuntime(JSON.parse(JSON.stringify(packet))).export()).toEqual(
		packet,
	);
});
