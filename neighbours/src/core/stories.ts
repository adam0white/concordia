import type { TownEvent, TownView } from "../contracts.ts";
import { nameOf } from "./cast.ts";
import { allEvenings } from "./evenings.ts";
import { cartCast } from "./handcart.ts";
import { isHfSource } from "./hf-version.ts";
import type { Save } from "./state.ts";
import { CHRONICLE_KINDS } from "./town-chronicle.ts";

function storyTitle(s: Save, e: TownEvent): string {
	if (e.kind === "annex-inspected")
		return s.assistance?.opened && s.assistance.result?.id === e.id
			? "Four extra hall places opened after annex inspection"
			: "The annex inspection left extra places closed";
	const evening = allEvenings(s).find(
		(candidate) =>
			candidate.notice?.id === e.id || candidate.result?.id === e.id,
	);
	if (evening) {
		const host = nameOf(s, evening.organiserId);
		if (e.kind === "evening-proposed")
			return evening.kind === "class"
				? `${host} invited neighbours to a class`
				: `${host} invited neighbours to supper`;
		const delivered = Object.entries(evening.replies).some(
			([id, reply]) => id !== evening.organiserId && reply.delivered,
		);
		return evening.kind === "class"
			? delivered
				? `Neighbours received ${host}’s class`
				: `${host}’s class did not happen`
			: delivered
				? `Neighbours shared ${host}’s supper`
				: `${host}’s supper did not happen`;
	}
	const titles: Record<string, string> = {
		"annex-observed": "The annex timber was observed",
		"hall-open": "The hall opened after inspection",
		"hall-closed": "The hall stayed closed after inspection",
		"inspection-failed": "An opening attempt found unsafe timber",
		"hall-repaired": "Repairs finished; inspection remains",
		"repair-slipped": "A repair did not hold on damp timber",
		"hall-explanation": "A question became a shared method",
		"missed-encounter": "The explanation missed its listener",
		lesson: "The displaced class passed on a method",
		"shared-meal": "A shared meal returned",
	};
	if (e.kind === "cart-returned")
		return `${cartCast(s).owner.person.name}’s repaired handcart returned to the quay`;
	return titles[e.kind] ?? "A town event";
}
/** Kinds that can recur unchanged; repeats between two hall milestones read as one story. */
const REPEATING = new Set([
	"inspection-failed",
	"hall-closed",
	"repair-slipped",
]);
const MILESTONES = new Set(["hall-open", "hall-repaired"]);
function when(at: number): string {
	const minute = ((at % 1440) + 1440) % 1440;
	return `Day ${Math.floor(at / 1440) + 1}, ${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}
type Story = TownView["stories"][number];
/**
 * Collapse repeats: stories of a repeating kind between the same two hall milestones become one story, titled
 * with the count and summarised by the latest text plus the first and last time. Every source event is kept.
 */
export function collapseRepeats(
	events: TownEvent[],
	stories: Story[],
): Story[] {
	const era = new Map<number, number>();
	let n = 0;
	for (const e of events.toSorted((a, b) => a.at - b.at || a.id - b.id)) {
		if (MILESTONES.has(e.kind)) n++;
		era.set(e.id, n);
	}
	const runs = new Map<string, Story[]>();
	const out: (Story | string)[] = [];
	for (const story of stories) {
		const id = story.eventIds.at(-1);
		if (!REPEATING.has(story.kind) || id === undefined) {
			out.push(story);
			continue;
		}
		const key = `${story.kind}:era${era.get(id) ?? 0}`;
		const run = runs.get(key);
		if (run) run.push(story);
		else {
			runs.set(key, [story]);
			out.push(key);
		}
	}
	return out.map((item) => {
		if (typeof item !== "string") return item;
		const run = runs.get(item) ?? [];
		const latest = run[0] as Story;
		if (run.length === 1) return latest;
		const first = run.at(-1) as Story;
		const ids = [...new Set(run.flatMap((x) => x.eventIds))].sort(
			(a, b) => a - b,
		);
		const missing = [...new Set(run.flatMap((x) => x.missingEventIds ?? []))];
		return {
			...latest,
			title: `${latest.title} (${run.length} times)`,
			summary: `${latest.summary} The same happened ${run.length} times between ${when(first.at ?? 0)} and ${when(latest.at ?? 0)}.`,
			groupId: `${latest.kind}:${first.id}`,
			eventIds: ids,
			missingEventIds: missing,
		};
	});
}
export function townStories(s: Save): TownView["stories"] {
	const latestInspections = s.people
		.filter((r) => r.known && r.inspection?.event)
		.map((r) => r.inspection?.event)
		.filter((event): event is TownEvent => !!event);
	const events = new Map<number, TownEvent>(
		[
			...(s.townChronicle?.events ?? []),
			...s.events.filter((e) => CHRONICLE_KINDS.has(e.kind)),
		].map((e) => [e.id, e]),
	);
	for (const evening of allEvenings(s)) {
		const retained = evening.result ?? evening.notice;
		if (retained) events.set(retained.id, retained);
	}
	for (const retained of [s.assistance?.visit, s.assistance?.result])
		if (retained) events.set(retained.id, retained);
	if (s.handcart?.handover)
		events.set(s.handcart.handover.id, s.handcart.handover);
	for (const event of latestInspections) events.set(event.id, event);
	const visible = new Set(s.events.slice(-100).map((e) => e.id));
	const ordered = [...events.values()].sort(
		(a, b) => b.at - a.at || b.id - a.id,
	);
	const stories = ordered.map((e) => {
		const inspection = s.people.find(
			(r) => r.inspection?.event?.id === e.id,
		)?.inspection;
		const methodValue =
			inspection?.methodTerms?.reduce((sum, t) => sum + t.value, 0) ?? 0;
		const who = e.actorId ? nameOf(s, e.actorId) : "They";
		// A choice with no learned-method term says nothing extra; the journal is not a debug log.
		const explanation = isHfSource(inspection?.source)
			? methodValue > 0
				? ` ${who} went by a method they had learned.`
				: methodValue < 0
					? ` What ${who} had learned pointed against this choice.`
					: ""
			: `${inspection ? ` Decision source: ${inspection.source}.` : ""}`;
		return {
			id: `story-${e.id}`,
			...(e.actorId ? { actorId: e.actorId } : {}),
			at: e.at,
			groupId:
				e.kind === "lesson"
					? `lesson:${e.at}:${e.placeId}`
					: `${e.kind}:${e.id}`,
			title: storyTitle(s, e),
			summary: e.text + explanation,
			eventIds: [...e.causes, e.id],
			missingEventIds: [...e.causes, e.id].filter((id) => !visible.has(id)),
			kind: e.kind,
		};
	});
	return collapseRepeats(ordered, stories).slice(0, 64);
}
