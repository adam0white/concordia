import { describe, expect, it } from "vitest";
import type { PlayerView, TownEvent } from "../src/contracts.ts";
import { moodRead } from "../src/core/impression.ts";
import type { Runtime } from "../src/core/runtime.ts";
import { collapseRepeats } from "../src/core/stories.ts";
import { jobLine } from "../src/core/voicing.ts";
import { FRESH_REPLY, freshReply } from "../src/ui/SpeakPanel.tsx";
import { createRuntime } from "./historical-runtime.ts";

const T = 60_000;

function event(id: number, kind: string, at: number, text = kind): TownEvent {
	return { id, at, kind, text, causes: [], importance: 0.8 };
}
function story(e: TownEvent) {
	return {
		id: `story-${e.id}`,
		at: e.at,
		groupId: `${e.kind}:${e.id}`,
		title:
			e.kind === "inspection-failed"
				? "An opening attempt found unsafe timber"
				: e.kind,
		summary: e.text,
		eventIds: [e.id],
		missingEventIds: [],
		kind: e.kind,
	};
}

describe("Phase C reads and text", () => {
	it(
		"the mood read is worded from HF state and differs between people and over time",
		() => {
			const r = createRuntime(42, 24) as Runtime;
			const reads = new Set<string>();
			while (r.s.now < 2 * 1440) {
				r.step();
				for (const p of r.view().people) if (p.read) reads.add(p.read);
			}
			expect(reads.size).toBeGreaterThan(4);
			expect([...reads]).not.toContain("They look calm. No need seems urgent.");
			// A real need shows: lower one person's HF belonging reservoir.
			const sam = r.actor("sam");
			sam.person.body.asleep = false;
			sam.person.needs.belonging = 0.02;
			expect(moodRead(r.s, sam)).toMatch(/lonely/);
		},
		T,
	);

	it("repeated stories between hall milestones collapse into one with a count and range", () => {
		const events = [
			event(1, "hall-repaired", 1500),
			event(2, "inspection-failed", 1600, "Ada found wet timber."),
			event(3, "lesson", 1700),
			event(4, "inspection-failed", 3000, "Ada found wet timber again."),
			event(5, "inspection-failed", 4500, "Lea found wet timber."),
			event(6, "hall-open", 6000),
			event(7, "inspection-failed", 7000),
		];
		const stories = events.toSorted((a, b) => b.at - a.at).map((e) => story(e));
		const out = collapseRepeats(events, stories);
		const failed = out.filter((s) => s.kind === "inspection-failed");
		expect(failed).toHaveLength(2);
		const run = failed[1];
		expect(run?.title).toMatch(/\(3 times\)$/);
		expect(run?.summary).toMatch(/^Lea found wet timber\./);
		expect(run?.summary).toMatch(
			/3 times between Day 2, 02:40 and Day 4, 03:00/,
		);
		expect(run?.eventIds).toEqual([2, 4, 5]);
		expect(out.map((s) => s.kind)).toEqual([
			"inspection-failed",
			"hall-open",
			"inspection-failed",
			"lesson",
			"hall-repaired",
		]);
	});

	it("job lines are voiced, not menu labels", () => {
		expect(jobLine("Ada", "Open this section", true)).toBe(
			"Ada could not finish opening this section.",
		);
		expect(jobLine("Sam", "Repair the flood-damaged hall", false)).not.toMatch(
			/finished repair the/,
		);
	});

	it("a reply stays on the panel only while it is current", () => {
		const request = {
			id: 9,
			at: 600,
			placeId: "hall",
			targetId: "ada",
			targetName: "Ada",
			affordanceId: "rest",
			label: "Rest at home",
			mode: "ask" as const,
			verdict: "refused" as const,
			says: "No.",
			status: "refused",
		};
		const player = {
			placeId: "hall",
			requests: [request],
		} as unknown as PlayerView;
		expect(freshReply(player, "ada", 600 + FRESH_REPLY)).toBe(request);
		expect(freshReply(player, "ada", 601 + FRESH_REPLY)).toBeUndefined();
		expect(
			freshReply({ ...player, placeId: "quay" }, "ada", 620),
		).toBeUndefined();
		expect(
			freshReply(
				{ ...player, requests: [{ ...request, status: "held" }] },
				"ada",
				9999,
			)?.id,
		).toBe(9);
		expect(freshReply(player, "noor", 600)).toBeUndefined();
	});
});
