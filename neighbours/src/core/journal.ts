/**
 * SCOPE: a deterministic narrator for the player's journal. It turns the player's retained record (their own
 * events plus the linked actions and results of the people they spoke to) into short past-tense entries. Each
 * entry is labelled "recorded" and carries the ids of the events it rephrases. It never adds an outcome, a
 * motive or blame: a lapsed deadline is reported as a deadline that passed, nothing more. The back story is
 * alluded to only through the recorded return event and what the player actually observed on arrival.
 */
import type { JournalEntry, TownEvent } from "../contracts.ts";
import type { Save } from "./state.ts";
import { actionWords, counterWords } from "./voicing.ts";

const LIMIT = 40;
function verdictNote(verdict: string, counter?: { label: string }): string {
	if (verdict === "refused") return " It was a refusal.";
	if (counter && (verdict === "deferred" || verdict === "modified"))
		return ` They offered to ${counterWords(counter)}.`;
	if (verdict === "complied") return " They agreed under protest.";
	return "";
}
export function journalEntries(s: Save): JournalEntry[] {
	const p = s.player;
	if (!p) return [];
	const used = new Set<number>();
	const out: JournalEntry[] = [];
	const byId = new Map(p.log.map((e) => [e.id, e]));
	const entry = (e: TownEvent, text: string, ids: number[]) => {
		for (const id of ids) used.add(id);
		out.push({
			id: `journal-${e.id}`,
			at: e.at,
			day: Math.floor(e.at / 1440) + 1,
			text,
			label: "recorded",
			sourceEventIds: ids,
		});
	};
	for (const e of p.log) {
		if (used.has(e.id)) continue;
		const request = p.requests.find((q) => q.id === e.id);
		if (e.kind === "player-request" && request) {
			const answer = byId.get(request.answerEvent);
			entry(
				e,
				answer
					? `${e.text} ${answer.text}${verdictNote(request.answer.verdict, request.answer.counterOffer)}`
					: e.text,
				answer ? [e.id, answer.id] : [e.id],
			);
			continue;
		}
		const started = p.requests.find((q) => q.startedEvent === e.id);
		if (started?.decision && e.kind === "started") {
			const name =
				s.people.find((r) => r.person.id === started.targetId)?.person.name ??
				started.targetId;
			entry(
				e,
				`${name} began to ${actionWords(started.decision.chosenLabel)}.`,
				[e.id],
			);
			continue;
		}
		entry(e, e.text, [e.id]);
	}
	return out.slice(-LIMIT);
}
