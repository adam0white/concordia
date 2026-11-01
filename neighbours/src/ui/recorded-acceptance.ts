import type { PlayerView } from "../contracts";

/** journalEntries groups the actual player-request event first, then its answer.
 * Require that event's identity and time, not a button click or an action label.
 * Pruned history supplies no confirmation. Never write this projection back.
 */
export function recordedAcceptance(
	request: PlayerView["requests"][number],
	journal: PlayerView["journal"],
) {
	return journal.find(
		(entry) =>
			entry.label === "recorded" &&
			entry.at === request.at &&
			entry.sourceEventIds[0] === request.id &&
			entry.text.startsWith(`You accepted ${request.targetName}’s offer to `),
	);
}
