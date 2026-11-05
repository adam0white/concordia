import { type ReactNode, useEffect, useRef, useState } from "react";
import type { PlayerView, PlayerWorkKind, TownView } from "../contracts";
import { actionWords, counterWords } from "../core/voicing";
import ConversationRoute, { PlayerNotice } from "./ConversationRoute";
import { currentGuide, pledgePresentation } from "./current-promises";
import FirstSteps from "./FirstSteps";
import { type FirstStep, requestOutcome } from "./first-steps";
import { clock, datedClock } from "./format";
import { InkPortrait } from "./Notebook";
import { personRead, plainText } from "./plain-english";
import RequestRecord from "./RequestRecord";
import { recordedAcceptance } from "./recorded-acceptance";
import type { useVisitorSession } from "./useVisitorSession";
import "./conversation.css";

type Session = ReturnType<typeof useVisitorSession>;
type Mode = "ask" | "urge" | "promise";
/** A reply offers its alternative only while this fresh (minutes) and at its original place. */
export const FRESH_REPLY = 180;
const WORK: { id: PlayerWorkKind; label: string }[] = [
	{ id: "carry-meals", label: "Carry food up from the quay" },
	{ id: "help-repair", label: "Help repair the hall" },
	{ id: "cover-shift", label: "Cover a paid shift" },
	{ id: "dry-timber", label: "Support the hall timber and let it dry" },
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

/** Current public promise status and retained exchanges precede the unchanged historical log. */
export function PlayerJournal({
	player,
	session,
}: {
	player: PlayerView;
	session?: Session;
}) {
	return (
		<>
			<section aria-label="Current promises">
				<h4>Your promises now</h4>
				{session?.playerError && (
					<p role="alert">{plainText(session.playerError)}</p>
				)}
				{player.pledges.length === 0 ? (
					<p>You have no recorded promise to keep.</p>
				) : (
					<ul>
						{player.pledges.map((pledge) => (
							<li key={pledge.id}>
								<p>{pledgePresentation(pledge).detail}</p>
								{session && <PledgeStart session={session} pledge={pledge} />}
							</li>
						))}
					</ul>
				)}
			</section>
			{player.requests.length > 0 && (
				<details>
					<summary>Your recent conversations</summary>
					{[...player.requests].reverse().map((request) => (
						<RequestRecord
							key={request.id}
							request={request}
							pledges={player.pledges}
							journal={player.journal}
						/>
					))}
				</details>
			)}
			{player.journal.length === 0 ? (
				<p>
					{plainText(
						"You have not taken any actions yet. Your actions will appear here.",
					)}
				</p>
			) : (
				<ol className="player-journal">
					{[...player.journal].reverse().map((entry) => (
						<li key={entry.id} data-events={entry.sourceEventIds.join(" ")}>
							<small>
								{datedClock(entry.at)} · {entry.label}
							</small>{" "}
							{plainText(entry.text)}
						</li>
					))}
				</ol>
			)}
		</>
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
						: "You kept your promise about that hour."}
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
	const goal = currentGuide(player);
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
		? `${person.name} is on the way to ${placeLabel(town, person.journey.toId)}. You can talk after ${person.name} arrives.`
		: person?.lifeState === "asleep"
			? `${person.name} is asleep. You can talk after ${person.name} wakes up.`
			: person
				? `${person.name} cannot talk here now.`
				: "";
	const location = (
		<>
			{walkNotice}
			<p className="player-place">
				{player.job?.kind === "travel"
					? `You are walking to ${placeLabel(town, player.job.toId)}, arriving about ${clock(player.job.arriveAt)}.`
					: player.job?.kind === "work"
						? `You are working at ${placeLabel(town, player.job.toId)} until ${clock(player.job.endsAt)}.`
						: `You are at ${placeLabel(town, player.placeId)}. ${player.presentCount} ${player.presentCount === 1 ? "person is" : "people are"} awake here.`}
			</p>
			{person && (
				<p className="person-place">
					{person.name}:{" "}
					{person.journey
						? `travelling to ${placeLabel(town, person.journey.toId)}`
						: placeLabel(town, person.placeId)}
					.{" "}
					{!here && destination
						? `This is ${person.name}’s current location. ${person.name} may move.`
						: ""}
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
		<section
			className="player-action"
			aria-label="Your next action and location"
		>
			{!person && goal && (
				<strong>
					{goal.id === "arrive" ? "Choose a place to walk" : goal.title}
				</strong>
			)}

			{location}
		</section>
	);
}

/** Start only the host's open pledge; own work never substitutes for this command. */
function PledgeStart({
	session,
	pledge,
}: {
	session: Session;
	pledge: PlayerView["pledges"][number];
}) {
	if (pledge.status !== "open") return null;
	const busy =
		session.playerPending ||
		session.advancing ||
		session.comparing ||
		session.saveConflict ||
		session.intervening ||
		session.commandPending;
	return (
		<>
			<button
				type="button"
				disabled={busy || !pledge.canStart}
				onClick={() => session.playerWork(pledge.id)}
			>
				Start the hour
			</button>
			<p className="hand">
				{busy
					? "The town is finishing another action. Wait for it to finish."
					: (pledge.blocked ??
						(pledge.canStart
							? "Start this promised hour now, including the walk to the work."
							: "The current view does not say this hour can start. Check again when the town updates."))}
			</p>
		</>
	);
}

/** The same promises and host start controls on the hall and walking sheets. */
export function PromisedWork({ session }: { session: Session }) {
	const player = session.town?.player;
	if (!player?.pledges.some((pledge) => pledge.status === "open")) return null;
	return (
		<section className="pledges" aria-label="Your promised work">
			<h3>Your promised work</h3>
			{player.pledges
				.filter((pledge) => pledge.status === "open")
				.map((pledge) => (
					<div key={pledge.id}>
						<p>{pledgePresentation(pledge).detail}</p>
						<PledgeStart session={session} pledge={pledge} />
					</div>
				))}
		</section>
	);
}

/** Work controls shared by the conversation and the walking sheet. */
export function OwnWork({
	session,
	open = false,
}: {
	session: Session;
	open?: boolean;
}) {
	const player = session.town?.player;
	if (!player) return null;
	const busy =
		session.playerPending ||
		session.advancing ||
		session.comparing ||
		session.saveConflict ||
		session.intervening ||
		session.commandPending;
	return (
		<>
			{session.playerError && (
				<p role="alert">{plainText(session.playerError)}</p>
			)}
			{player.workHoursLeft <= 0 && (
				<p>You have no working hours left today.</p>
			)}
			{player.workHoursLeft > 0 && (
				<details className="own-work" open={open}>
					<summary>Your work ▸</summary>
					<p>
						Start an hour yourself. You ask for nothing in return. This does not
						keep a separately promised hour.
						{player.pledges.some((pledge) => pledge.status === "open") &&
							" Use Start the hour for that promise."}
					</p>
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
										<span>Start your own hour: {w.label.toLowerCase()}</span>
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
		</>
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
	formId,
	onReadyChange,
	recordOnly = false,
	guideStep,
	skipGuide,
}: {
	session: Session;
	personId?: string;
	select?: (id: string) => void;
	journalOpen?: boolean;
	showAction?: boolean;
	/** Connect the conversation to the pinned submit in the action bar. */
	formId?: string;
	onReadyChange?: (ready: boolean) => void;
	/** Preserve recorded exchanges after work or travel ends the conversation. */
	recordOnly?: boolean;
	guideStep?: FirstStep;
	skipGuide?: () => void;
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
	const [mode, setMode] = useState<Mode>("promise");
	const [submissionError, setSubmissionError] = useState("");
	const [offerId, setOfferId] = useState("");
	const [work, setWork] = useState<PlayerWorkKind | "">("");
	const [by, setBy] = useState<number | "">("");
	const here =
		personId !== undefined &&
		player?.present.some((person) => person.id === personId);
	const { predictSpeech } = session;
	useEffect(() => {
		if (!recordOnly && here && personId) predictSpeech(personId);
	}, [personId, here, predictSpeech, recordOnly]);
	const busy =
		session.playerPending ||
		session.advancing ||
		session.comparing ||
		session.saveConflict ||
		session.intervening ||
		session.commandPending;
	const prediction =
		session.speechPrediction?.actorId === personId
			? session.speechPrediction
			: undefined;
	const offers = prediction?.prediction?.offers ?? [];
	const offer = offers.find((item) => item.affordanceId === offerId);
	const deadlines = player?.pledgeDeadlines ?? [];
	const deadline =
		by !== "" && deadlines.includes(by)
			? by
			: (deadlines.find((time) => time % 1440 === 1080) ?? deadlines.at(-1));
	const validWork =
		!!player && offeredWork(player).some((item) => item.id === work);
	const ready =
		!recordOnly &&
		!!here &&
		!busy &&
		!player?.job &&
		!!offer &&
		(mode !== "promise" || (validWork && deadline !== undefined));
	useEffect(() => {
		onReadyChange?.(ready);
	}, [onReadyChange, ready]);
	if (!town || !player) return null;
	const person = town.people.find((p) => p.id === personId);
	const name = person?.name ?? personId ?? "";
	const help = player.helpOffers?.find((offer) => offer.toId === personId);
	const question = person?.history.findLast(
		(event) => event.kind === "question",
	);
	const inspector =
		person?.activity?.includes("question for an inspector") &&
		person.placeId === "hall";
	const latest = recordedAnswer;
	const currentReply = freshReply(player, personId, town.now);
	const company = player.present.filter((p) => p.known && p.id !== personId);
	const counter =
		currentReply &&
		currentReply.mode === "ask" &&
		(currentReply.verdict === "deferred" || currentReply.verdict === "modified")
			? currentReply.counterOffer
			: undefined;
	const counterId = counter?.affordanceId;
	const acceptance =
		currentReply && recordedAcceptance(currentReply, player.journal);
	const receipt =
		personId &&
		player.pledges.findLast(
			(p) => p.toId === personId && p.status === "kept" && p.remembered,
		);
	const pledges = player.pledges;
	const contextBeforeForm = (
		<>
			{receipt && <HelpReceipt key={receipt.id} pledge={receipt} />}
			{!recordOnly && showAction && <h3>You</h3>}
			{!recordOnly && showAction && (
				<PlayerAction
					session={session}
					openWalking={!player.active && !personId}
				/>
			)}
			{!recordOnly && (showAction || personId) && (
				<>
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
					{!personId && <PlayerNotice town={town} />}
				</>
			)}
			{!recordOnly && !personId && session.playerError && (
				<p className="player-error" role="alert">
					{plainText(session.playerError)}
				</p>
			)}

			{latest && (
				<div className="latest-answer" ref={answerPanel}>
					<h4>Your latest recorded request to {latest.targetName}</h4>
					{guideStep === "answer" && skipGuide && (
						<FirstSteps text={requestOutcome(latest.status)} skip={skipGuide} />
					)}
					<RequestRecord
						request={latest}
						pledges={player.pledges}
						journal={player.journal}
					/>
					{counter && !acceptance && (
						<p>
							{name} offered to {counterWords(counter)}.{" "}
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
									Accept {name}’s suggested alternative
								</button>
							)}
						</p>
					)}
				</div>
			)}
			{pledges.length > 0 && (
				<div className="pledges">
					<h4>Your promises now</h4>
					<ul>
						{pledges.map((pledge) => (
							<li key={pledge.id}>
								<p>{pledgePresentation(pledge).detail}</p>
								<PledgeStart session={session} pledge={pledge} />
							</li>
						))}
					</ul>
				</div>
			)}
			{!recordOnly && !journalOpen && <OwnWork session={session} />}
			{!recordOnly && personId && (
				<ConversationRoute session={session} personId={personId} />
			)}
		</>
	);
	return (
		<section className="speak-panel" aria-label="You">
			{guideStep !== "request" && contextBeforeForm}
			{recordOnly || !personId ? null : !here ? (
				<p>
					{name} is not with you. Only people at the same place, and awake, can
					hear you.
				</p>
			) : (
				<form
					id={formId}
					className="conversation-request speech"
					aria-label={`Ask ${name} to do something`}
					onFocusCapture={() => session.setConversationPerson?.(personId)}
					onSubmit={(event) => {
						event.preventDefault();
						if (busy || player.job) return;
						if (!offer) {
							setSubmissionError("Choose what to ask first.");
							return;
						}
						if (mode === "promise" && (!validWork || deadline === undefined)) {
							setSubmissionError(
								"Choose the work for your hour and a deadline first.",
							);
							return;
						}
						setSubmissionError("");
						if (mode === "promise") {
							if (!work || deadline === undefined) return;
							session.speak({
								actorId: personId,
								affordanceId: offer.affordanceId,
								mode,
								pledge: { work, by: deadline },
							});
						} else {
							session.speak({
								actorId: personId,
								affordanceId: offer.affordanceId,
								mode,
							});
						}
					}}
				>
					{guideStep === "request" && skipGuide && (
						<FirstSteps
							text="👆 Choose how to ask, then choose a request. They may say no."
							skip={skipGuide}
						/>
					)}
					<fieldset
						className="conversation-choices request-mode"
						disabled={busy || !!player.job}
					>
						<legend>How</legend>
						<div className="conversation-modes">
							{(
								[
									{ id: "promise", label: "Offer an hour" },
									{ id: "ask", label: "Ask" },
									{ id: "urge", label: "Urge" },
								] as const
							).map((item) => (
								<button
									type="button"
									key={item.id}
									aria-pressed={mode === item.id}
									onClick={() => setMode(item.id)}
								>
									{item.label}
								</button>
							))}
						</div>
					</fieldset>
					<fieldset
						className="conversation-choices request-options"
						disabled={busy || !!player.job}
					>
						<legend>Ask {name} to</legend>
						<div className="conversation-chips">
							{offers.map((item) => (
								<button
									type="button"
									key={item.affordanceId}
									data-affordance-id={item.affordanceId}
									aria-pressed={offer?.affordanceId === item.affordanceId}
									onClick={() => setOfferId(item.affordanceId)}
								>
									{item.label}
								</button>
							))}
							{!offers.length && (
								<p>
									{prediction?.prediction
										? "No request is available now."
										: `Checking ${name}’s available choices…`}
								</p>
							)}
						</div>
					</fieldset>
					{mode === "promise" && (
						<>
							<fieldset
								className="conversation-choices"
								disabled={busy || !!player.job}
							>
								<legend>Your hour</legend>
								<div className="conversation-chips">
									{offeredWork(player).map((item) => (
										<button
											type="button"
											key={item.id}
											data-work-id={item.id}
											aria-pressed={work === item.id}
											onClick={() => setWork(item.id)}
										>
											{item.label}
										</button>
									))}
								</div>
							</fieldset>
							<fieldset
								className="conversation-choices"
								disabled={busy || !!player.job}
							>
								<legend>Done by</legend>
								<div className="conversation-chips">
									{deadlines.map((time) => (
										<button
											type="button"
											key={time}
											data-deadline={time}
											aria-pressed={deadline === time}
											onClick={() => setBy(time)}
										>
											{datedClock(time)}
										</button>
									))}
								</div>
							</fieldset>
							<p className="promise-meaning">
								{offer && work
									? `Ask ${name} to ${actionWords(offer.label)}. You offer one hour to ${WORK.find((item) => item.id === work)?.label.toLowerCase()}, by ${datedClock(deadline ?? town.now)}. If ${name} agrees now, or later acts on your request, you must do this work.`
									: `Offer your own work. If ${name} agrees now, or later acts on your request, you must do it.`}
							</p>
						</>
					)}
					{mode === "ask" && (
						<p className="hand">
							Ask {name}. {name} may say no.
						</p>
					)}
					{mode === "urge" && (
						<p className="hand">
							Press {name} to agree despite objections. This can reduce {name}’s
							trust in you.
						</p>
					)}
					{prediction?.error && <p role="alert">{prediction.error}</p>}
					{prediction?.prediction && (
						<p className="speech-read">
							{prediction.prediction.read
								.map((text) => personRead(name, text))
								.join(" ")}
						</p>
					)}
					{submissionError && <p role="alert">{submissionError}</p>}
					{!formId && (
						<button
							type="submit"
							className="current-action"
							disabled={
								busy ||
								!!player.job ||
								!offer ||
								(mode === "promise" && (!validWork || deadline === undefined))
							}
						>
							Ask {name}
						</button>
					)}
				</form>
			)}
			{guideStep === "request" && contextBeforeForm}
			{!recordOnly && personId && here && help && (
				<details className="resident-help" aria-label={`Help ${name}`}>
					<summary>Cover an hour for {name} ▸</summary>
					<p>
						You could cover a paid hour at {help.placeName} for {name}. {name}{" "}
						would receive the two-coin wage.
					</p>
					<button
						type="button"
						disabled={busy || !!help.blocked}
						onClick={() => session.offerHelp(personId)}
					>
						Start the covered hour
					</button>
					<p className="hand">
						{help.blocked ??
							`${help.minutes} min including the walk · ends ${datedClock(help.endsAt)}. You start work now. You ask for nothing in return.`}
					</p>
				</details>
			)}
			{!recordOnly && inspector && (
				<p className="inspector-context">
					{name} is waiting for an inspector. {question?.text} You can help with
					an hour of work while {name} waits.
				</p>
			)}
			{!recordOnly && journalOpen ? (
				<section className="your-journal" aria-label="Your journal">
					<h4>Your actions</h4>
					<PlayerJournal player={player} session={session} />
				</section>
			) : null}
		</section>
	);
}
