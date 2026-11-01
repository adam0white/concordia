import type { TownView } from "../contracts";
import { PRIVATE_DISCOVERIES } from "../core/private-discoveries";
import { datedClock } from "./format";
import { activityLabel } from "./person-status";
import { plainText } from "./plain-english";
import type { useVisitorSession } from "./useVisitorSession";

/** Bind notice provenance only when its actual source event remains public. */
export function PlayerNotice({
	town,
	personId,
}: {
	town: TownView;
	personId?: string;
}) {
	const notice = town.player?.latestNotice;
	if (!notice) return null;
	const event = town.events?.find((item) => item.id === notice.eventId);
	const target =
		event?.targetId && town.people.find((item) => item.id === event.targetId);
	return (
		<details
			className="global-player-notice"
			open={!!personId && event?.targetId === personId}
		>
			<summary>
				Latest notice for you · {datedClock(notice.at)}
				{target ? ` · about ${target.name}` : ""}
			</summary>
			<p>
				This is a notice for you, separate from the selected person’s request
				answers.
			</p>
			{!event && <p>The notice’s source event is no longer in this view.</p>}
			<p>{plainText(notice.text)}</p>
		</details>
	);
}

/** Public location and current activity only. An end time is never an appointment. */
export default function ConversationRoute({
	session,
	personId,
	leave,
}: {
	session: ReturnType<typeof useVisitorSession>;
	personId: string;
	leave?: () => void;
}) {
	const town = session.town;
	const player = town?.player;
	const person = town?.people.find((item) => item.id === personId);
	if (!town || !player || !person) return null;
	const here = player.present.some((item) => item.id === personId);
	const toId = person.journey?.toId ?? person.placeId;
	const place = town.places.find((item) => item.id === toId);
	const destination = player.destinations.find((item) => item.id === toId);
	const busy =
		session.playerPending ||
		session.advancing ||
		session.comparing ||
		session.saveConflict ||
		session.intervening ||
		session.commandPending;
	const clue = person.known ? PRIVATE_DISCOVERIES[personId] : undefined;
	return (
		<section
			className="conversation-route"
			aria-label={`Meeting ${person.name}`}
		>
			<PlayerNotice town={town} personId={personId} />
			{person.journey ? (
				<>
					<p>
						{person.name} is walking to {place?.name ?? toId}, arriving about{" "}
						{datedClock(person.journey.arriveAt)}.
					</p>
					{destination ? (
						<button
							type="button"
							disabled={busy || !player.canMove}
							onClick={() => session.movePlayer(destination.id)}
						>
							Walk to {destination.name} · ~{destination.minutes} min
						</button>
					) : player.placeId === toId && !player.job ? (
						<p>You are already at that destination.</p>
					) : null}
					<p>
						This is a destination, not an appointment. {person.name} may leave
						again or be busy when you arrive.
					</p>
				</>
			) : (
				<p>
					{person.name} is at {place?.name ?? toId}. Current activity:{" "}
					{activityLabel(person)}.
					{person.until > town.now &&
						` Its recorded end is ${datedClock(person.until)}. That does not promise a break or a conversation.`}
				</p>
			)}
			{!here && !person.journey && (
				<p>
					Use the walk action to visit this location. {person.name} may move
					before you arrive. Only an awake person at the same place can hear
					you.
				</p>
			)}
			{clue && (
				<>
					<p>
						You can ask a personal question without asking {person.name} to
						change activities. During work, the question can be refused. Try
						after the current activity or during a break. {person.name} can
						still keep the matter private.
					</p>
					{here && (
						<button
							type="button"
							disabled={busy || !!player.job}
							onClick={() => session.askPrivate(personId)}
						>
							{clue.cue}
						</button>
					)}
				</>
			)}
			{player.job && <p>Finish your walk or work before talking.</p>}
			{leave && (
				<button type="button" onClick={leave}>
					Return to town and let time move
				</button>
			)}
			{session.playerError && (
				<p role="alert">{plainText(session.playerError)}</p>
			)}
		</section>
	);
}
