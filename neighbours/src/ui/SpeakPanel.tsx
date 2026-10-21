import { type ReactNode, useEffect, useRef, useState } from "react";
import type { PlayerView, PlayerWorkKind, TownView } from "../contracts";
import { actionWords, counterWords, voicedLine } from "../core/voicing";
import { clock, datedClock } from "./format";
import { InkPortrait } from "./Notebook";
import type { useVisitorSession } from "./useVisitorSession";

type Session = ReturnType<typeof useVisitorSession>;
type Mode = "ask" | "urge" | "promise";
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

/** A recorded HF receipt, brought into view when the completed hour arrives. */
function HelpReceipt({ pledge }: { pledge: PlayerView["pledges"][number] }) {
	const panel = useRef<HTMLDivElement>(null);
	useEffect(() => {
		panel.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
	}, []);
	return (
		<div ref={panel} className="pledge-receipt" role="status">
			<p>
				<strong>{pledge.toName} remembers</strong>
			</p>
			<p>
				<q className="voice">
					{pledge.direct
						? "You covered that hour for me. I received the two coins."
						: "You kept your word about that hour."}
				</q>
			</p>
			<p>{pledge.result}</p>
		</div>
	);
}

/** The immediate action stays separate so the resident sheet can pin it while scrolling. */
export function PlayerAction({
	session,
	openWalking = false,
	personId,
	conversation,
	walkNotice,
}: {
	session: Session;
	openWalking?: boolean;
	personId?: string;
	conversation?: ReactNode;
	walkNotice?: ReactNode;
}) {
	const [conversationOpen, setConversationOpen] = useState(
		session.conversationPerson === personId && personId !== undefined,
	);
	useEffect(
		() => () => session.clearConversationPerson?.(personId),
		[session.clearConversationPerson, personId],
	);
	const town = session.town;
	const player = town?.player;
	if (!town || !player) return null;
	const goal = player.goals.find((g) => g.status === "current");
	const busy =
		session.playerPending ||
		session.advancing ||
		session.comparing ||
		session.saveConflict ||
		session.intervening;
	const person = town.people.find((p) => p.id === personId);
	const here = player.present.some((p) => p.id === personId);
	const destination = player.destinations.find((p) => p.id === person?.placeId);
	const unavailable = person?.journey
		? `${person.name} is on the way to ${placeLabel(town, person.journey.toId)}. Meet them after they arrive.`
		: person?.lifeState === "asleep"
			? `${person.name} is asleep. Talk when they are awake.`
			: person
				? `${person.name} cannot talk here now.`
				: "";
	const location = (
		<>
			{walkNotice}
			<p className="player-place">
				{player.job?.kind === "travel"
					? `Walking to ${placeLabel(town, player.job.toId)}, arriving about ${clock(player.job.arriveAt)}.`
					: player.job?.kind === "work"
						? `Working at ${placeLabel(town, player.job.toId)} until ${clock(player.job.endsAt)}.`
						: `You are at ${placeLabel(town, player.placeId)}. ${player.presentCount} awake here.`}
			</p>
			{person && (
				<p className="person-place">
					{person.name}:{" "}
					{person.journey
						? `travelling to ${placeLabel(town, person.journey.toId)}`
						: placeLabel(town, person.placeId)}
					. {!here && destination ? "Current location; they may move." : ""}
				</p>
			)}
			{player.job && person && (
				<p className="hand">
					You can talk after your{" "}
					{player.job.kind === "travel" ? "walk" : "work"} ends.
				</p>
			)}
			<details className="walk" open={openWalking}>
				<summary
					className={
						!person && goal?.id === "arrive" && player.canMove && !busy
							? "current-action"
							: undefined
					}
				>
					Walk somewhere
				</summary>
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
		</>
	);
	return person ? (
		<>
			<section className="player-action" aria-label="Your next step">
				{!here &&
					(destination &&
					!person.journey &&
					(person.lifeState === undefined || person.lifeState === "awake") ? (
						<button
							type="button"
							className="resident-response current-action"
							disabled={!player.canMove || busy}
							onClick={() => session.movePlayer(destination.id)}
						>
							Walk to {destination.name} to talk · ~{destination.minutes} min
						</button>
					) : (
						<p className="resident-response">{unavailable}</p>
					))}
				<details
					className="resident-talk"
					hidden={
						!here &&
						!conversationOpen &&
						!player.requests.some((r) => r.targetId === personId) &&
						!player.pledges.some((p) => p.toId === personId)
					}
					open={
						conversationOpen ||
						(!here &&
							(player.requests.some((r) => r.targetId === personId) ||
								player.pledges.some((p) => p.toId === personId)))
					}
					onToggle={(event) => {
						const open = event.currentTarget.open;
						setConversationOpen(open);
						if (!open) session.setConversationPerson?.(undefined);
					}}
				>
					{/* biome-ignore lint/a11y/noStaticElementInteractions: Native summary supports pointer and keyboard activation. */}
					<summary
						className="current-action"
						onClick={() =>
							session.setConversationPerson?.(
								conversationOpen ? undefined : person.id,
							)
						}
					>
						Talk to {person.name}
					</summary>
					{conversation}
				</details>
			</section>
			<div className="resident-location">{location}</div>
		</>
	) : (
		<section className="player-action" aria-label="Your next step and location">
			{!person && goal && (
				<strong>
					{goal.id === "arrive" ? "Choose a place to walk" : goal.title}
				</strong>
			)}

			{location}
		</section>
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
	showAction = true,
}: {
	session: Session;
	personId?: string;
	select?: (id: string) => void;
	journalOpen?: boolean;
	showAction?: boolean;
}) {
	const town = session.town;
	const player = town?.player;
	const answerPanel = useRef<HTMLDivElement>(null);
	const recordedAnswer = player?.requests.findLast(
		(request) => request.targetId === personId,
	);
	const answerKey = recordedAnswer
		? `${personId}:${recordedAnswer.id}:${recordedAnswer.decision?.at ?? recordedAnswer.at}`
		: "";
	useEffect(() => {
		if (!answerKey) return;
		answerPanel.current?.scrollIntoView({
			block: "nearest",
			behavior: "instant",
		});
	}, [answerKey]);
	const [offerId, setOfferId] = useState("");
	const [work, setWork] = useState<PlayerWorkKind | "">("");
	const [by, setBy] = useState<number | "">("");
	const here =
		personId !== undefined &&
		player?.present.some((person) => person.id === personId);
	const { predictSpeech } = session;
	useEffect(() => {
		if (here && personId) predictSpeech(personId);
	}, [personId, here, predictSpeech]);
	if (!town || !player) return null;
	const person = town.people.find((p) => p.id === personId);
	const name = person?.name ?? personId ?? "";
	const goal = player.goals.find((g) => g.status === "current");
	const done = player.goals.filter((g) => g.status === "done");
	const prediction =
		session.speechPrediction?.actorId === personId
			? session.speechPrediction
			: undefined;
	const help = player.helpOffers?.find((offer) => offer.toId === personId);
	const question = person?.history.findLast(
		(event) => event.kind === "question",
	);
	const inspector =
		person?.activity?.includes("question for an inspector") &&
		person.placeId === "hall";
	const offers = prediction?.prediction?.offers ?? [];
	const offer = offers.find((o) => o.affordanceId === offerId);
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
	const receipt =
		personId &&
		player.pledges.findLast(
			(p) => p.toId === personId && p.status === "kept" && p.remembered,
		);
	const pledges = player.pledges.filter(
		(pledge) => pledge.status === "open" || pledge.status === "offered",
	);
	const busy =
		session.playerPending ||
		session.advancing ||
		session.comparing ||
		session.saveConflict ||
		session.intervening;
	return (
		<section className="speak-panel" aria-label="You">
			{receipt && <HelpReceipt key={receipt.id} pledge={receipt} />}
			{showAction && <h3>You</h3>}
			{showAction && (
				<PlayerAction
					session={session}
					openWalking={!player.active && !personId}
				/>
			)}
			{showAction && (
				<>
					{goal && <p className="speak-context">{goal.hint}</p>}
					{done.length > 0 && (
						<small>Done: {done.map((g) => g.title).join(", ")}</small>
					)}
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
				</>
			)}
			{session.playerError && (
				<p className="player-error" role="alert">
					{session.playerError}
				</p>
			)}
			{!personId && player.workHoursLeft > 0 && (
				<details className="own-work">
					<summary>Do an hour of your own work</summary>
					<p className="hand">
						You can still give {player.workHoursLeft} hour
						{player.workHoursLeft === 1 ? "" : "s"} of work today, between 08:00
						and 18:00 including the walk.
					</p>
					<ul className="walk-list">
						{offeredWork(player)
							.filter((w) => w.id !== "cover-shift")
							.map((w) => (
								<li key={w.id}>
									<button
										type="button"
										disabled={
											!player.canMove ||
											busy ||
											!!player.workBlocked?.[
												w.id as keyof NonNullable<PlayerView["workBlocked"]>
											]
										}
										onClick={() => session.playerWork({ work: w.id })}
									>
										<span>{w.label}</span>
									</button>
									{player.workBlocked?.[
										w.id as keyof NonNullable<PlayerView["workBlocked"]>
									] && (
										<small className="hand">
											{
												player.workBlocked[
													w.id as keyof NonNullable<PlayerView["workBlocked"]>
												]
											}
										</small>
									)}
								</li>
							))}
					</ul>
				</details>
			)}
			{latest && (
				<div className="latest-answer" ref={answerPanel}>
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
					{latest.why && <p className="refusal-why">{latest.why}</p>}
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
			{personId && here && help && (
				<section className="resident-help" aria-label={`Help ${name}`}>
					<p>
						You could cover a paid hour at {help.placeName} for {name}. {name}{" "}
						would receive the two-coin wage.
					</p>
					<button
						type="button"
						className="current-action"
						disabled={busy || !!help.blocked}
						onClick={() => session.offerHelp(personId)}
					>
						Cover an hour for {name}
					</button>
					<p className="hand">
						{help.blocked ??
							`${help.minutes} min including the walk · ends ${datedClock(help.endsAt)}. Starts your work now; no request in return.`}
					</p>
				</section>
			)}
			{inspector && (
				<p className="inspector-context">
					{name} is waiting for an inspector. {question?.text} You can help with
					an hour of work while they wait.
				</p>
			)}
			{!personId ? null : !here ? (
				<p>
					{name} is not with you. Only people at the same place, and awake, can
					hear you.
				</p>
			) : (
				<details className="conversation-request">
					{/* biome-ignore lint/a11y/noStaticElementInteractions: Native summary already handles pointer and keyboard activation. */}
					<summary
						onClick={(event) => {
							event.preventDefault();
							const details = event.currentTarget
								.parentElement as HTMLDetailsElement;
							details.open = !details.open;
							if (details.open)
								details.scrollIntoView({ block: "start", behavior: "instant" });
						}}
					>
						Ask {name} to do something
					</summary>
					<div
						className="speech"
						onFocusCapture={() => session.setConversationPerson?.(personId)}
					>
						<div className="promise-choice">
							<label>
								Ask them to
								<select
									value={offer?.affordanceId ?? ""}
									disabled={!offers.length}
									onChange={(event) => setOfferId(event.target.value)}
								>
									<option value="">
										{offers.length
											? "Choose what to ask"
											: prediction?.prediction
												? "No request available now"
												: "Considering their choices…"}
									</option>
									{offers.map((o) => (
										<option key={o.affordanceId} value={o.affordanceId}>
											{o.label}
										</option>
									))}
								</select>
							</label>
							<label>
								Your hour
								<select
									value={work}
									onChange={(event) =>
										setWork(event.target.value as PlayerWorkKind | "")
									}
								>
									<option value="">Choose your work</option>
									{offeredWork(player).map((w) => (
										<option key={w.id} value={w.id}>
											{w.label}
										</option>
									))}
								</select>
							</label>
							<label>
								Done by
								<select
									value={deadline ?? ""}
									onChange={(event) =>
										setBy(
											event.target.value === ""
												? ""
												: Number(event.target.value),
										)
									}
								>
									<option value="">Choose a deadline</option>
									{deadlines.map((t) => (
										<option key={t} value={t}>
											{datedClock(t)}
										</option>
									))}
								</select>
							</label>
							<button
								type="button"
								className="current-action"
								disabled={
									busy ||
									!!player.job ||
									!offer ||
									!work ||
									deadline === undefined
								}
								onClick={() => {
									if (offer && work && deadline !== undefined)
										session.speak({
											actorId: personId,
											affordanceId: offer.affordanceId,
											mode: "promise",
											pledge: { work, by: deadline },
										});
								}}
							>
								Promise an hour
							</button>
							<p className="promise-meaning">
								{offer && work
									? `Ask ${name} to ${actionWords(offer.label)}. You offer one hour to ${WORK.find((item) => item.id === work)?.label.toLowerCase()}, by ${datedClock(deadline ?? town.now)}. It binds you only if they take it up.`
									: "Offer your work. It binds you only if they take it up."}
							</p>
						</div>
						<details className="speech-alternatives">
							<summary>Ask or urge instead</summary>
							<button
								type="button"
								disabled={busy || !!player.job || !offer}
								onClick={() => {
									if (offer)
										session.speak({
											actorId: personId,
											affordanceId: offer.affordanceId,
											mode: "ask",
										});
								}}
							>
								Ask
							</button>
							<p className="hand">Put it to them. They may say no.</p>
							<button
								type="button"
								disabled={busy || !!player.job || !offer}
								onClick={() => {
									if (offer)
										session.speak({
											actorId: personId,
											affordanceId: offer.affordanceId,
											mode: "urge",
										});
								}}
							>
								Urge
							</button>
							<p className="hand">
								Insist. They may give in under protest, and being pushed wears
								on their trust.
							</p>
						</details>
						{prediction?.error && <p role="alert">{prediction.error}</p>}
						{prediction?.prediction && (
							<p className="speech-read">
								<span className="eyebrow">You can tell</span>{" "}
								{prediction.prediction.read.join(". ")}.
							</p>
						)}
					</div>
				</details>
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
