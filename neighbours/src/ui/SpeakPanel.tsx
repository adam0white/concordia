import { useEffect, useState } from "react";
import type { PlayerView, PlayerWorkKind, TownView } from "../contracts";
import { actionWords, counterWords, voicedLine } from "../core/voicing";
import { clock, datedClock } from "./format";
import { InkPortrait } from "./Notebook";
import type { useVisitorSession } from "./useVisitorSession";

type Session = ReturnType<typeof useVisitorSession>;
type Mode = "ask" | "urge" | "promise";
/** What each way of putting it means. Never a forecast of the answer: asking is how you find out. */
const MODES: { id: Mode; label: string; note: string }[] = [
	{ id: "ask", label: "Ask", note: "Put it to them. They may say no." },
	{
		id: "urge",
		label: "Urge",
		note: "Insist. They may give in under protest, and being pushed wears on their trust.",
	},
	{
		id: "promise",
		label: "Promise an hour",
		note: "Offer an hour of your own work. It binds you only if they take it up.",
	},
];
/** A reply stays on the panel while it is this fresh (minutes) and you are still where it was given. */
export const FRESH_REPLY = 180;
const SAID: Record<Mode, string> = {
	ask: "asked",
	urge: "urged",
	promise: "made a promise and asked",
};
const WORK: { id: PlayerWorkKind; label: string }[] = [
	{ id: "carry-meals", label: "Carry food up from the quay" },
	{ id: "help-repair", label: "Help repair the hall" },
	{ id: "cover-shift", label: "Cover one hour of their shift" },
	{ id: "dry-timber", label: "Prop and air the hall timber" },
];
/** Work the host would accept now: airing the hall timber only while there is damp timber left to air. */
export function offeredWork(player: Pick<PlayerView, "canAirTimber">) {
	return WORK.filter((w) => w.id !== "dry-timber" || player.canAirTimber);
}

function placeLabel(town: TownView, id: string | undefined): string {
	return town.places.find((place) => place.id === id)?.name ?? id ?? "";
}
/** The latest exchange with this person, only while it is current: same place, recent or still pending. */
export function freshReply(
	player: PlayerView,
	personId: string | undefined,
	now: number,
): PlayerView["requests"][number] | undefined {
	if (!personId) return undefined;
	const latest = player.requests.findLast((r) => r.targetId === personId);
	if (!latest) return undefined;
	if (latest.status === "held") return latest;
	const last = Math.max(latest.at, latest.decision?.at ?? latest.at);
	const samePlace =
		latest.placeId === undefined || latest.placeId === player.placeId;
	return samePlace && now - last <= FRESH_REPLY ? latest : undefined;
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

/**
 * The player's one drawer surface: current step, place, company, walking,
 * pledges and journal. With `personId` (the selected resident's drawer) it also
 * offers speech to that resident; without it (the journal drawer) it lists who
 * is here so the player can choose someone to speak to.
 */
export function SpeakPanel({
	session,
	personId,
	select,
	journalOpen = false,
}: {
	session: Session;
	personId?: string;
	select?: (id: string) => void;
	journalOpen?: boolean;
}) {
	const town = session.town;
	const player = town?.player;
	const [offerId, setOfferId] = useState("");
	const [work, setWork] = useState<PlayerWorkKind | "">("");
	const [by, setBy] = useState<number | "">("");
	const here =
		personId !== undefined &&
		player?.present.some((person) => person.id === personId);
	const now = town?.now;
	const { predictSpeech } = session;
	// biome-ignore lint/correctness/useExhaustiveDependencies: refresh the telegraph when time or company changes.
	useEffect(() => {
		if (here && personId && !session.playing) predictSpeech(personId);
	}, [personId, here, now, session.playing]);
	if (!town || !player) return null;
	const person = town.people.find((p) => p.id === personId);
	const name = person?.name ?? personId ?? "";
	const goal = player.goals.find((g) => g.status === "current");
	const done = player.goals.filter((g) => g.status === "done");
	const prediction =
		session.speechPrediction?.actorId === personId
			? session.speechPrediction
			: undefined;
	const offers = prediction?.prediction?.offers ?? [];
	const offer = offers.find((o) => o.affordanceId === offerId) ?? offers[0];
	const latest = freshReply(player, personId, town.now);
	const deadlines = player.pledgeDeadlines ?? [];
	const deadline =
		by !== "" && deadlines.includes(by)
			? by
			: (deadlines.find((t) => t % 1440 === 1080) ?? deadlines.at(-1));
	const company = player.present.filter((p) => p.known && p.id !== personId);
	const counter =
		latest &&
		latest.mode === "ask" &&
		(latest.verdict === "deferred" || latest.verdict === "modified")
			? latest.counterOffer
			: undefined;
	const counterId = counter?.affordanceId;
	const pledges = player.pledges.filter(
		(pledge) => pledge.status === "open" || pledge.status === "offered",
	);
	const busy =
		session.advancing ||
		session.comparing ||
		session.saveConflict ||
		session.intervening;
	return (
		<section className="speak-panel" aria-label="You">
			<h3>You</h3>
			{goal && (
				<div className="player-goal">
					<span className="eyebrow">Your next step</span>
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
			{select && !player.job && company.length > 0 && (
				<div className="your-company">
					<span className="hand">
						{personId ? "Also here:" : "Here with you:"}
					</span>
					<ul>
						{company.map((p) => (
							<li key={p.id}>
								<button
									type="button"
									className="neighbour"
									data-person-id={p.id}
									aria-label={`Speak to ${p.name}`}
									onClick={() => select(p.id)}
								>
									<InkPortrait
										id={p.id}
										label={p.name.slice(0, 1)}
										className="mini-avatar"
									/>
									<span>{p.name.split(" ")[0]}</span>
								</button>
							</li>
						))}
					</ul>
				</div>
			)}
			{player.latestNotice && <p>{player.latestNotice.text}</p>}
			{session.playerError && (
				<p className="player-error" role="alert">
					{session.playerError}
				</p>
			)}
			<details className="walk" open={!player.active && !personId}>
				<summary>Walk somewhere</summary>
				<ul className="walk-list">
					{player.destinations.map((place) => (
						<li key={place.id}>
							<button
								type="button"
								disabled={!player.canMove || busy}
								onClick={() => session.movePlayer(place.id)}
							>
								<span>{place.name}</span>
								<span className="hand">about {place.minutes} min</span>
							</button>
						</li>
					))}
				</ul>
			</details>
			{!personId && player.workHoursLeft > 0 && (
				<details className="own-work">
					<summary>Do an hour of your own work</summary>
					<p className="hand">
						{player.workHoursLeft} working hour
						{player.workHoursLeft === 1 ? "" : "s"} left today, 08:00–18:00
						including the walk.
					</p>
					<ul className="walk-list">
						{offeredWork(player)
							.filter((w) => w.id !== "cover-shift")
							.map((w) => (
								<li key={w.id}>
									<button
										type="button"
										disabled={!player.canMove || busy}
										onClick={() => session.playerWork({ work: w.id })}
									>
										<span>{w.label}</span>
									</button>
								</li>
							))}
					</ul>
				</details>
			)}
			{!personId ? null : !here ? (
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
					{prediction?.prediction && (
						<p className="speech-read">
							<span className="eyebrow">You can tell</span>{" "}
							{prediction.prediction.read.join(". ")}.
						</p>
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
										setWork(event.target.value as PlayerWorkKind | "")
									}
								>
									<option value="">Choose the work you would offer</option>
									{offeredWork(player).map((w) => (
										<option key={w.id} value={w.id}>
											{w.label}
										</option>
									))}
								</select>
							</label>
							{deadline !== undefined && (
								<label>
									Done by{" "}
									<select
										value={deadline}
										onChange={(event) => setBy(Number(event.target.value))}
									>
										{deadlines.map((t) => (
											<option key={t} value={t}>
												{datedClock(t)}
											</option>
										))}
									</select>
								</label>
							)}
							<ul className="speech-modes">
								{MODES.map((mode) => (
									<li key={mode.id}>
										<button
											type="button"
											disabled={
												busy ||
												player.job !== undefined ||
												(mode.id === "promise" &&
													(work === "" || deadline === undefined))
											}
											onClick={() =>
												work !== "" || mode.id !== "promise"
													? session.speak({
															actorId: personId,
															affordanceId: offer.affordanceId,
															mode: mode.id,
															...(mode.id === "promise" && work !== ""
																? {
																		pledge: {
																			work,
																			...(deadline !== undefined
																				? { by: deadline }
																				: {}),
																		},
																	}
																: {}),
														})
													: undefined
											}
										>
											{mode.label}
										</button>{" "}
										<small>{mode.note}</small>
									</li>
								))}
							</ul>
						</>
					)}
				</div>
			)}
			{latest && (
				<div className="latest-answer">
					<p className="said">
						You {SAID[latest.mode]}: {latest.label}.
					</p>
					<p>
						<q
							className={`voice ${latest.verdict === "refused" ? "refusal" : ""}`}
						>
							{voicedLine(latest)}
						</q>{" "}
						<span className="voice-by">{name}</span>
					</p>
					{latest.decision && (
						<p>
							Later: <q className="voice">{voicedLine(latest.decision)}</q>{" "}
							{name} chose to {actionWords(latest.decision.chosenLabel)}.
						</p>
					)}
					{latest.result && <p className="said">{latest.result}</p>}
					{counter && (
						<p>
							They offered to {counterWords(counter)}.{" "}
							{counterId && here && personId && (
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
								{pledge.status === "offered" ? (
									<small>
										Offered; it binds you only if {pledge.toName} takes up your
										request.
									</small>
								) : pledge.canStart ? (
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
			{journalOpen ? (
				<section className="your-journal" aria-label="Your journal">
					<h4>Your own lines</h4>
					<PlayerJournal player={player} />
				</section>
			) : (
				<details>
					<summary>Your journal</summary>
					<PlayerJournal player={player} />
				</details>
			)}
		</section>
	);
}
