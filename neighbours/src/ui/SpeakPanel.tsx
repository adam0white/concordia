import { useEffect, useState } from "react";
import type {
	PlayerView,
	PlayerWorkKind,
	SpeechAnswer,
	TownView,
} from "../contracts";
import { clock, datedClock } from "./format";
import type { useVisitorSession } from "./useVisitorSession";

type Session = ReturnType<typeof useVisitorSession>;
type Mode = "ask" | "urge" | "promise";
const MODES: { id: Mode; label: string }[] = [
	{ id: "ask", label: "Ask" },
	{ id: "urge", label: "Urge" },
	{ id: "promise", label: "Promise an hour" },
];
const SAID: Record<Mode, string> = {
	ask: "asked",
	urge: "urged",
	promise: "made a promise and asked",
};
const WORK: { id: PlayerWorkKind; label: string }[] = [
	{ id: "carry-meals", label: "Carry food up from the quay" },
	{ id: "help-repair", label: "Help repair the hall" },
	{ id: "cover-shift", label: "Cover one hour of their shift" },
];

function placeLabel(town: TownView, id: string | undefined): string {
	return town.places.find((place) => place.id === id)?.name ?? id ?? "";
}
function telegraph(answer: SpeechAnswer): string {
	const counter = answer.counterOffer
		? ` They might offer: ${answer.counterOffer.label}.`
		: "";
	return `Likely “${answer.says}”${counter}`;
}

/** The player's own journal: recorded lines only, each traceable to its source events. */
export function PlayerJournal({ player }: { player: PlayerView }) {
	if (player.journal.length === 0)
		return <p>Nothing recorded yet. Your own steps will appear here.</p>;
	return (
		<ol className="player-journal">
			{[...player.journal].reverse().map((entry) => (
				<li key={entry.id} data-events={entry.sourceEventIds.join(" ")}>
					<small>
						{datedClock(entry.at)} · {entry.label}
					</small>{" "}
					{entry.text}
				</li>
			))}
		</ol>
	);
}

/** Plain controls for the player: goal, place, movement, speech to one person, pledges, journal. */
export function SpeakPanel({
	session,
	personId,
}: {
	session: Session;
	personId: string;
}) {
	const town = session.town;
	const player = town?.player;
	const [offerId, setOfferId] = useState("");
	const [work, setWork] = useState<PlayerWorkKind>("carry-meals");
	const here = player?.present.some((person) => person.id === personId);
	const now = town?.now;
	const { predictSpeech } = session;
	// biome-ignore lint/correctness/useExhaustiveDependencies: refresh the telegraph when time or company changes.
	useEffect(() => {
		if (here && !session.playing) predictSpeech(personId);
	}, [personId, here, now, session.playing]);
	if (!town || !player) return null;
	const person = town.people.find((p) => p.id === personId);
	const name = person?.name ?? personId;
	const goal = player.goals.find((g) => g.status === "current");
	const done = player.goals.filter((g) => g.status === "done");
	const prediction =
		session.speechPrediction?.actorId === personId
			? session.speechPrediction
			: undefined;
	const offers = prediction?.prediction?.offers ?? [];
	const offer = offers.find((o) => o.affordanceId === offerId) ?? offers[0];
	const latest = [...player.requests]
		.reverse()
		.find((request) => request.targetId === personId);
	const counter =
		latest &&
		latest.mode === "ask" &&
		(latest.verdict === "deferred" || latest.verdict === "modified")
			? latest.counterOffer
			: undefined;
	const counterId = counter?.affordanceId;
	const pledges = player.pledges.filter((pledge) => pledge.status === "open");
	const busy = session.advancing || session.comparing || session.saveConflict;
	return (
		<section className="speak-panel" aria-label="You">
			<h3>You</h3>
			{goal && (
				<div className="player-goal">
					<strong>{goal.title}</strong>
					<p>{goal.hint}</p>
					{done.length > 0 && (
						<small>Done: {done.map((g) => g.title).join(", ")}</small>
					)}
				</div>
			)}
			{!goal && done.length > 0 && (
				<p>Every goal so far is done: {done.map((g) => g.title).join(", ")}.</p>
			)}
			<p className="player-place">
				{player.job?.kind === "travel"
					? `Walking to ${placeLabel(town, player.job.toId)}, arriving about ${clock(player.job.arriveAt)}.`
					: player.job?.kind === "work"
						? `Working at ${placeLabel(town, player.job.toId)} until ${clock(player.job.endsAt)}.`
						: `You are at ${placeLabel(town, player.placeId)}. ${player.presentCount} awake here.`}
			</p>
			{player.latestNotice && <p>{player.latestNotice.text}</p>}
			{session.playerError && (
				<p className="player-error" role="alert">
					{session.playerError}
				</p>
			)}
			<details>
				<summary>Walk somewhere</summary>
				<ul>
					{player.destinations.map((place) => (
						<li key={place.id}>
							<button
								type="button"
								disabled={!player.canMove || busy}
								onClick={() => session.movePlayer(place.id)}
							>
								{place.name}, about {place.minutes} min
							</button>
						</li>
					))}
				</ul>
			</details>
			{!here ? (
				<p>
					{name} is not with you. Only people at the same place, and awake, can
					hear you.
				</p>
			) : (
				<div className="speech">
					<h4>Speak to {name}</h4>
					{prediction?.error && <p role="alert">{prediction.error}</p>}
					{!prediction?.prediction && !prediction?.error && (
						<p>Considering what {name} could do now…</p>
					)}
					{offers.length > 0 && offer && (
						<>
							<label>
								Ask them to{" "}
								<select
									value={offer.affordanceId}
									onChange={(event) => setOfferId(event.target.value)}
								>
									{offers.map((o) => (
										<option key={o.affordanceId} value={o.affordanceId}>
											{o.label}
										</option>
									))}
								</select>
							</label>
							<label>
								Your hour{" "}
								<select
									value={work}
									onChange={(event) =>
										setWork(event.target.value as PlayerWorkKind)
									}
								>
									{WORK.map((w) => (
										<option key={w.id} value={w.id}>
											{w.label}
										</option>
									))}
								</select>
							</label>
							<ul className="speech-modes">
								{MODES.map((mode) => (
									<li key={mode.id}>
										<button
											type="button"
											disabled={busy || player.job !== undefined}
											onClick={() =>
												session.speak({
													actorId: personId,
													affordanceId: offer.affordanceId,
													mode: mode.id,
													...(mode.id === "promise"
														? { pledge: { work } }
														: {}),
												})
											}
										>
											{mode.label}
										</button>{" "}
										<small>{telegraph(offer[mode.id])}</small>
									</li>
								))}
							</ul>
						</>
					)}
				</div>
			)}
			{latest && (
				<div className="latest-answer">
					<p>
						You {SAID[latest.mode]}: {latest.label}. {name} said “{latest.says}”
						{latest.decision
							? ` Later: “${latest.decision.says}” and chose to ${latest.decision.chosenLabel.toLowerCase()}.`
							: ""}
					</p>
					{counter && (
						<p>
							They offered instead: {counter.label}.{" "}
							{counterId && here && (
								<button
									type="button"
									disabled={busy || player.job !== undefined}
									onClick={() =>
										session.speak({
											actorId: personId,
											affordanceId: counterId,
											mode: "ask",
											acceptCounter: true,
										})
									}
								>
									Accept their counter-offer
								</button>
							)}
						</p>
					)}
				</div>
			)}
			{pledges.length > 0 && (
				<div className="pledges">
					<h4>Your promises</h4>
					<ul>
						{pledges.map((pledge) => (
							<li key={pledge.id}>
								To {pledge.toName}: {pledge.label}, by{" "}
								{datedClock(pledge.dueBy)}.{" "}
								{pledge.canStart ? (
									<button
										type="button"
										disabled={busy}
										onClick={() => session.playerWork(pledge.id)}
									>
										Start the hour
									</button>
								) : (
									pledge.blocked && <small>{pledge.blocked}</small>
								)}
							</li>
						))}
					</ul>
				</div>
			)}
			<details>
				<summary>Your journal</summary>
				<PlayerJournal player={player} />
			</details>
		</section>
	);
}
