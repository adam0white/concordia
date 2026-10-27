import { useEffect, useRef, useState } from "react";
import type { Intervention } from "./contracts";
import { HF_VERSION } from "./core/hf-version";
import { hasHallChoice } from "./hall-choice";
import ErrorMessage from "./ui/ErrorMessage";
import { clock, placeName } from "./ui/format";
import HelpPanel from "./ui/HelpPanel";
import { LabNotice, lab } from "./ui/lab";
import { InkStamp, type Milestone } from "./ui/Notebook";
import { groupStories } from "./ui/observations";
import PersonPanel from "./ui/PersonPanel";
import PlacePanel from "./ui/PlacePanel";
import { plainText } from "./ui/plain-english";
import QueuedWalkNotice from "./ui/QueuedWalkNotice";
import SendWord from "./ui/SendWord";
import SessionMenu from "./ui/SessionMenu";
import { OwnWork, PlayerJournal, SpeakPanel } from "./ui/SpeakPanel";
import Stories from "./ui/Stories";
import StoryHeadline, { storyAnchor } from "./ui/StoryHeadline";
import { decodeSave } from "./ui/save-codec";
import { RepairTally } from "./ui/TownGoal";
import TownInspector from "./ui/TownInspector";
import TownOverview, { NeighbourStrip } from "./ui/TownOverview";
import { useVisitorSession } from "./ui/useVisitorSession";
import Welcome from "./ui/Welcome";

type Sheet =
	| "town"
	| "help"
	| "walk"
	| "journal"
	| "compare"
	| "studies"
	| "feedback";
type Entry =
	| { kind: "seed"; seed: string }
	| { kind: "restore"; slot: "previous" | "latest" }
	| { kind: "import"; file: File };

export default function App() {
	const [fileSession] = useState(
		() => new URL(location.href).searchParams.get("file") === "1",
	);
	const [filePacket, setFilePacket] = useState<unknown>();
	const [fileError, setFileError] = useState("");
	const fileIntent = useRef(0);
	const [booted, setBooted] = useState(false);
	const [inTown, setInTown] = useState(false);
	const [localStart, setLocalStart] = useState<{
		seed: number;
		revision: number;
	}>();
	const session = useVisitorSession({
		enabled: booted,
		localStart,
		fileSession,
		filePacket,
	});
	const closeFile = () => {
		fileIntent.current++;
		setBooted(false);
		setInTown(false);
		setFilePacket(undefined);
		setFileError("");
	};
	const openFile = async (file: File) => {
		const intent = ++fileIntent.current;
		try {
			const packet = await decodeSave(file);
			if (intent !== fileIntent.current) return;
			setFilePacket(packet);
			setFileError("");
			setBooted(true);
			setInTown(true);
		} catch (error) {
			if (intent === fileIntent.current)
				setFileError(
					error instanceof Error
						? error.message
						: "This file could not be opened.",
				);
		}
	};
	useEffect(
		() => () => {
			fileIntent.current++;
		},
		[],
	);
	const [sheet, setSheet] = useState<Sheet>("town");
	const [selectedPlace, setSelectedPlace] = useState("");
	const [info, setInfo] = useState(false);
	const [conversationReady, setConversationReady] = useState(false);
	const [titleMenu, setTitleMenu] = useState(false);
	const [hallExpanded, setHallExpanded] = useState(false);
	const pendingEntry = useRef<Entry | null>(null);
	const [storyFocus, setStoryFocus] = useState<string>();
	const { town, selected, setSelected, observed } = session;
	const person = town?.people.find((p) => p.id === selected);
	const place = town?.places.find((p) => p.id === selectedPlace);
	const conversation = Boolean(
		person && session.conversationPerson === person.id && sheet === "town",
	);
	const study = sheet === "compare" || sheet === "studies";
	const context = sheet === "town" && Boolean(person || place);
	const stories = town ? groupStories(town, observed) : [];
	const goal = town?.player?.goals.find((g) => g.status === "current");
	const busy =
		session.advancing ||
		session.comparing ||
		session.saveConflict ||
		session.playerPending ||
		session.intervening ||
		session.commandPending;
	const enter = () => {
		setBooted(true);
		setInTown(true);
		setTitleMenu(false);
		session.closeMenu();
	};
	const begin = (entry: Entry) => {
		pendingEntry.current = entry;
		if (entry.kind === "seed") session.setSeedInput(entry.seed);
		enter();
	};
	useEffect(() => {
		if (!town || !pendingEntry.current) return;
		const entry = pendingEntry.current;
		pendingEntry.current = null;
		if (entry.kind === "seed") session.startTown();
		else if (entry.kind === "restore") session.restoreSave(entry.slot);
		else void session.importSave(entry.file);
	}, [town, session.startTown, session.restoreSave, session.importSave]);
	useEffect(() => {
		session.setInspectionOpen(context);
	}, [context, session.setInspectionOpen]);
	useEffect(() => {
		session.setReadingOpen(info || study || sheet === "feedback" || !inTown);
	}, [info, study, sheet, inTown, session.setReadingOpen]);
	useEffect(() => {
		lab.screen(inTown ? sheet : "title");
	}, [inTown, sheet]);
	useEffect(() => {
		if (!storyFocus || sheet !== "journal") return;
		const target = document.getElementById(storyAnchor(storyFocus));
		target?.scrollIntoView({ block: "nearest" });
		target?.focus({ preventScroll: true });
		setStoryFocus(undefined);
	}, [sheet, storyFocus]);
	useEffect(() => {
		const close = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			if (session.menuOpen || session.menuPausing || titleMenu) return;
			if (info) setInfo(false);
			else if (sheet !== "town") {
				if (sheet === "compare" || sheet === "studies")
					session.cancelComparison();
				setSheet("town");
			}
		};
		window.addEventListener("keydown", close);
		return () => window.removeEventListener("keydown", close);
	}, [
		info,
		sheet,
		session.cancelComparison,
		session.menuOpen,
		session.menuPausing,
		titleMenu,
	]);
	useEffect(() => {
		if (!info) return;
		const outside = (event: PointerEvent) => {
			if (
				event.target instanceof Element &&
				!event.target.closest('.game-info, [aria-label="Information"]')
			)
				setInfo(false);
		};
		document.addEventListener("pointerdown", outside);
		return () => document.removeEventListener("pointerdown", outside);
	}, [info]);

	const follow = (id: string, talk = false) => {
		session.setConversationPerson(talk ? id : undefined);
		setSelected(id);
		setSelectedPlace("");
		setSheet("town");
	};
	const inspectPlace = (id: string) => {
		session.setConversationPerson(undefined);
		setSelected("");
		setSelectedPlace(id);
		setSheet("town");
	};
	const closeSelection = () => {
		const previousPerson = selected;
		const previousPlace = selectedPlace;
		requestAnimationFrame(() => {
			// Closing removes the focused control. Preserve any newer deliberate focus.
			if (document.activeElement !== document.body) return;
			const target = previousPerson
				? document.querySelector<HTMLElement>(
						`.neighbour-strip [data-person-id="${CSS.escape(previousPerson)}"]`,
					)
				: document.querySelector<HTMLElement>(
						`[data-map-place="${CSS.escape(previousPlace)}"]`,
					);
			target?.focus({ preventScroll: true });
		});
		session.setConversationPerson(undefined);
		setSelected("");
		setSelectedPlace("");
	};
	const navigate = (
		next: "journal" | "compare" | "studies" | "feedback" | "title",
	) => {
		session.closeMenu();
		setTitleMenu(false);
		if (next === "title") {
			session.setConversationPerson(undefined);
			setInTown(false);
			setSheet("town");
		} else {
			if (next !== "feedback" && town) setInTown(true);
			setSheet(next);
		}
	};
	const compare = (input: Intervention, rounds: 96 | 672) => {
		setSheet("compare");
		session.compare(input, rounds);
	};
	const milestones: Milestone[] = town
		? [
				...(town.places.some((p) => p.id === "hall" && p.open)
					? [{ id: "hall-open", text: "The hall reopened" }]
					: []),
				...(town.player?.goals
					.filter((g) => g.status === "done")
					.map((g) => ({ id: `goal-${g.id}`, text: g.title })) ?? []),
				...(town.handcart?.returned
					? [{ id: "cart-returned", text: "Bilal has the handcart back" }]
					: []),
			]
		: [];
	const here = town?.player?.present.some((p) => p.id === person?.id);
	const destination = town?.player?.destinations.find(
		(p) => p.id === (person?.placeId ?? place?.id),
	);
	const menuOpen = session.menuOpen || titleMenu;
	const openMenu = () => {
		setInfo(false);
		if (town) session.openMenu();
		else setTitleMenu(true);
	};
	const readStory = (id: string) => {
		setSheet("journal");
		setStoryFocus(id);
	};
	const skipAvailable =
		!session.conversationPerson &&
		!session.saveConflict &&
		!session.playerPending &&
		!session.commandPending &&
		!session.intervening &&
		!session.comparing &&
		!town?.player?.requests.some((r) => r.status === "held");
	const actions = town && (
		<footer className="game-actions">
			{conversation && person ? (
				<button
					type="submit"
					form="town-conversation"
					className="primary"
					disabled={
						busy || !here || !conversationReady || Boolean(town.player?.job)
					}
				>
					Ask {person.name}
				</button>
			) : context && person ? (
				here && person.lifeState !== "asleep" ? (
					<button
						type="button"
						className="primary"
						disabled={busy || Boolean(town.player?.job)}
						onClick={() => session.setConversationPerson(person.id)}
					>
						Talk to {person.name}
					</button>
				) : destination && !person.journey && person.lifeState !== "asleep" ? (
					<button
						type="button"
						className="primary"
						disabled={busy || !town.player?.canMove}
						onClick={() => session.movePlayer(destination.id)}
					>
						Walk to {destination.name} to talk · ~{destination.minutes} min
					</button>
				) : (
					<p>
						{person.name}{" "}
						{person.lifeState === "asleep"
							? "is asleep."
							: `is travelling. You can talk after ${person.name} arrives.`}
					</p>
				)
			) : context && place ? (
				destination ? (
					<button
						type="button"
						className="primary"
						disabled={busy || !town.player?.canMove}
						onClick={() => session.movePlayer(place.id)}
					>
						Walk to {placeName(place)} · ~{destination.minutes} min
					</button>
				) : (
					<p>You are here.</p>
				)
			) : (
				<>
					{(skipAvailable || session.advancing) && (
						<button
							type="button"
							className="skip-action"
							aria-label={
								session.advancing ? "Stop advancing" : "Skip to the next event"
							}
							onClick={() =>
								session.advancing
									? session.stopAdvancing()
									: session.advanceUntil()
							}
						>
							{session.advancing ? "Stop" : "Skip ⏩"}
						</button>
					)}
					<nav className="town-verbs" aria-label="Town navigation">
						{(
							[
								["walk", "Walk somewhere"],
								["help", "Help the town"],
								["journal", "Journal"],
							] as const
						).map(([id, label]) => (
							<button
								key={id}
								type="button"
								aria-pressed={sheet === id}
								onClick={() => {
									session.setConversationPerson(undefined);
									setSheet(id);
								}}
							>
								{label}
							</button>
						))}
					</nav>
				</>
			)}
		</footer>
	);
	return (
		<div
			className={`app game-frame ${booted ? "town-entered" : ""} ${town ? "town-ready" : ""}`}
			data-screen={
				!inTown
					? "title"
					: !town
						? "loading"
						: conversation
							? "talk"
							: context
								? "selection"
								: sheet
			}
		>
			<header className="game-topbar">
				{!inTown ? (
					<a href="https://human.adamwhite.work/games/" target="_top">
						All games
					</a>
				) : (
					<div className="topbar-words">
						<span className="desktop-town-name">
							Neighbours · Mill Bridge ·{" "}
						</span>
						{town ? (
							<span className="town-time">
								<span className="eyebrow">Day {town.day}</span> ·{" "}
								<strong>{clock(town.now)}</strong> · {town.weather}
							</span>
						) : (
							"Mill Bridge"
						)}
					</div>
				)}
				<button
					type="button"
					aria-label="Information"
					aria-expanded={info}
					onClick={() => {
						setInfo(!info);
						if (!info) session.stopAdvancing();
					}}
				>
					i
				</button>
				<button
					type="button"
					aria-label="Game menu"
					aria-expanded={menuOpen}
					disabled={session.menuPausing}
					onClick={openMenu}
				>
					<span className="phone-menu">≡</span>
					<span className="desktop-menu">Menu</span>
				</button>
			</header>
			{info && (
				<section
					className="game-info"
					role="dialog"
					aria-label="About Mill Bridge"
				>
					<div className="sheet-heading">
						<h2>
							{!inTown
								? "Mill Bridge"
								: context
									? "Talking with a neighbour"
									: study
										? "Studies"
										: "Helping"}
						</h2>
						<button
							type="button"
							aria-label="Close information"
							onClick={() => setInfo(false)}
						>
							×
						</button>
					</div>
					{!inTown ? (
						<>
							<p>
								A riverside town is recovering after a flood. You can get to
								know six neighbours. Two hundred more live here. They decide for
								themselves. This town runs live on this device; nothing is
								played back. Each resident makes decisions independently.
							</p>
							<p>
								Human Framework {HF_VERSION} supplies perceptions, memories and
								decisions for residents using HF. The game and Python Concordia
								control the physical town and what happens in it.
							</p>
							<p>
								Walk to a place. Talk to someone who is there and awake. Offer
								an hour of work, or ask for help. People may refuse.
							</p>
						</>
					) : context ? (
						<p>
							Only people at the same place, and awake, can hear you. A
							counter-offer means they suggest a different action or time. Your
							promise becomes a commitment if they agree now or later act on
							your request.
						</p>
					) : study ? (
						<p>
							A comparison runs two possible versions of the town from this
							moment. Your town stays unchanged.
						</p>
					) : sheet === "help" ? (
						<p>
							Each support action costs one town credit and changes conditions
							in the town. People decide how to respond.
						</p>
					) : (
						<p>
							Walk to a place. Talk to people who are there and awake. Offer an
							hour of work, or ask for help. Pressing someone can reduce their
							trust in you. Circles show town credits. The diamond shows whether
							this week’s hall choice is available. The marks count completed
							hall repairs, out of twelve.
						</p>
					)}
				</section>
			)}
			{fileSession && inTown && (
				<button type="button" onClick={closeFile}>
					Close file session
				</button>
			)}
			{fileSession && !inTown ? (
				<main>
					<h1>Open a saved town file</h1>
					<p>
						This file stays separate from the town and people saved in this
						browser. Changes stay in memory. Download a copy before closing.
					</p>
					<label>
						Town file
						<input
							type="file"
							accept=".json,.gz,application/json,application/gzip"
							onChange={(event) => {
								const file = event.target.files?.[0];
								if (file) void openFile(file);
								event.target.value = "";
							}}
						/>
					</label>
					<button type="button" onClick={closeFile}>
						Cancel file selection
					</button>
					{fileError && <p role="alert">{fileError}</p>}
				</main>
			) : !inTown ? (
				<Welcome
					session={session}
					onEnter={enter}
					onLocal={() => {
						const seed = Number(session.seedInput);
						if (!Number.isSafeInteger(seed) || seed < 0 || seed > 2147483647)
							return;
						setLocalStart((previous) => ({
							seed,
							revision: (previous?.revision ?? 0) + 1,
						}));
						pendingEntry.current = null;
						enter();
					}}
					onStart={() => begin({ kind: "seed", seed: session.seedInput })}
					onRestore={(slot) => begin({ kind: "restore", slot })}
					onImport={(file) => begin({ kind: "import", file })}
				/>
			) : !town ? (
				<main className="game-loading">
					<div className="title-drawing loading-drawing" aria-hidden="true">
						<svg viewBox="0 0 360 240" aria-hidden="true">
							<path
								className="loading-town-outline"
								d="M45 70h55v42H45zM235 50h65v45h-65zM195 145h60v35h-60z"
							/>
							<path
								className="loading-river"
								d="M-10 200 Q100 80 180 170 T380 100"
							/>
						</svg>
					</div>
					<section>
						<h2 tabIndex={-1}>Starting Mill Bridge.</h2>
						<p role="status">{session.progress}</p>
						<p>The first visit takes longer.</p>
					</section>
					<footer>
						{session.error && (
							<>
								<div className="error">
									The town could not start.{" "}
									<ErrorMessage message={session.error} />
								</div>
								<button
									type="button"
									className="primary"
									onClick={() => location.reload()}
								>
									Try again
								</button>
							</>
						)}
					</footer>
				</main>
			) : (
				<>
					<section className="game-state" aria-label="Town state">
						<RepairTally repairs={Math.min(12, town.stats.hallRepairs ?? 0)} />
						<span className="state-words" role="status">
							{conversation ? (
								"Time pauses while you talk"
							) : session.advancing ? (
								session.advanceProgress || "Skipping…"
							) : session.playerPending || town.player?.job ? (
								<QueuedWalkNotice
									town={town}
									playing={session.playing}
									advancing={session.advancing}
									pending={session.playerPending}
								/>
							) : context ? (
								`Time slows while you visit ${person?.name ?? (place ? placeName(place) : "your neighbours")}`
							) : session.clockRate === "Time pauses for a new story" ? (
								stories[0] ? (
									`A story: ${stories[0].title}`
								) : (
									plainText(
										town.player?.latestNotice?.text ?? "The town is waking up.",
									)
								)
							) : town.places.some((p) => p.id === "hall" && p.open) ? (
								"The hall is open"
							) : (
								"Reopen the hall"
							)}
						</span>
						<span
							className="credit-tokens"
							role="img"
							aria-label={`${town.controlsRemaining} town credits left`}
						>
							{[0, 1, 2].map((i) => (
								<span key={i} aria-hidden="true">
									{i < town.controlsRemaining ? "●" : "○"}
								</span>
							))}
						</span>
						<span
							role="img"
							aria-label={
								hasHallChoice(town)
									? "Hall choice available"
									: "No hall choice available"
							}
						>
							{hasHallChoice(town) ? "◆" : "◇"}
						</span>
					</section>
					<main className="game-play" inert={study || sheet === "feedback"}>
						<div className="game-scene">
							<TownOverview
								town={town}
								selected={selected}
								select={follow}
								selectedPlace={selectedPlace}
								selectPlace={inspectPlace}
								notes={
									<>
										<StoryHeadline story={stories[0]} open={readStory} />
										<InkStamp reached={milestones} />
									</>
								}
							/>
						</div>
						<section
							className="game-column"
							aria-label="Your part in Mill Bridge"
						>
							<div className="town-guidance lk-strip">
								<button
									type="button"
									className="next-step"
									onClick={() =>
										setSheet(goal?.id === "arrive" ? "walk" : "journal")
									}
								>
									<strong>
										Your next step:{" "}
										<span>
											{plainText(goal?.title ?? "Help your neighbours")}
										</span>{" "}
										▸
									</strong>
									<small>
										{plainText(goal?.hint ?? "Walk, talk, or help the town.")}
									</small>
								</button>
								<NeighbourStrip
									town={town}
									selected={selected}
									select={follow}
									selectedPlace={selectedPlace}
									selectPlace={inspectPlace}
								/>
							</div>
							<div
								className="game-sheet lk-sheet"
								id="town-info-panel"
								tabIndex={-1}
							>
								{session.saveConflict && (
									<div className="error" role="alert">
										Another tab saved the town on this device. This tab is
										paused.
										<button type="button" onClick={() => location.reload()}>
											Load the saved town
										</button>
									</div>
								)}
								{session.error && sheet !== "feedback" && (
									<div className="error" role="alert">
										<ErrorMessage message={session.error} />
									</div>
								)}
								{context && person ? (
									conversation ? (
										<>
											<div className="sheet-heading">
												<button
													type="button"
													onClick={() =>
														session.setConversationPerson(undefined)
													}
													aria-label="Back to person"
												>
													←
												</button>
												<h2>{person.name}</h2>
												<button
													type="button"
													onClick={() =>
														session.setConversationPerson(undefined)
													}
												>
													Done
												</button>
											</div>
											<SpeakPanel
												key={`${person.id}:${session.townEpoch}`}
												session={session}
												personId={person.id}
												select={follow}
												showAction={false}
												formId="town-conversation"
												onReadyChange={setConversationReady}
											/>
										</>
									) : (
										<PersonPanel
											person={person}
											town={town}
											observed={observed}
											speak={
												<SpeakPanel
													session={session}
													personId={person.id}
													showAction={false}
													recordOnly
												/>
											}
											close={closeSelection}
										/>
									)
								) : context && place ? (
									<PlacePanel
										town={town}
										place={place}
										close={closeSelection}
										select={follow}
										move={session.movePlayer}
										busy={busy}
										showWalkAction={false}
									/>
								) : sheet === "help" ? (
									<>
										<SheetHeading
											title="Help the town"
											close={() => setSheet("town")}
										/>
										<button type="button" onClick={() => setSheet("compare")}>
											Compare possible outcomes
										</button>
										<HelpPanel
											town={town}
											disabled={busy}
											action={session.intervene}
											compare={compare}
											select={follow}
											hallExpanded={hallExpanded}
											setHallExpanded={setHallExpanded}
										/>
										{session.interventionNotice && (
											<p className="intervention-result" role="status">
												{session.interventionNotice}
											</p>
										)}
									</>
								) : sheet === "walk" ? (
									<>
										<SheetHeading
											title="Walk somewhere"
											close={() => setSheet("town")}
										/>
										<p>
											You are at{" "}
											{
												town.places.find((p) => p.id === town.player?.placeId)
													?.name
											}
											.
										</p>
										<ul className="walk-list">
											{town.player?.destinations.map((p) => (
												<li key={p.id}>
													<button
														type="button"
														disabled={busy || !town.player?.canMove}
														onClick={() => {
															session.movePlayer(p.id);
															setSheet("town");
														}}
													>
														<span>{p.name}</span>
														<span>about {p.minutes} min</span>
													</button>
												</li>
											))}
										</ul>
										<OwnWork session={session} />
									</>
								) : sheet === "journal" ? (
									<>
										<SheetHeading
											title="Journal"
											close={() => setSheet("town")}
										/>
										<h3>Your actions</h3>
										{town.player && <PlayerJournal player={town.player} />}
										<h3>The town's record</h3>
										<Stories stories={stories} town={town} select={follow} />
									</>
								) : (
									<div className="latest-stories">
										<h2>The town's record</h2>
										<Stories
											stories={stories.slice(0, 5)}
											town={town}
											select={follow}
										/>
										{!stories.length && (
											<p>Your neighbours are beginning their day.</p>
										)}
									</div>
								)}
							</div>
							{actions}
						</section>
					</main>
				</>
			)}
			<footer className="notice-footer">
				<LabNotice />
			</footer>
			<SessionMenu
				session={session}
				open={menuOpen}
				close={() => {
					session.closeMenu();
					setTitleMenu(false);
				}}
				onNavigate={navigate}
			/>
			{inTown && town && study && (
				<section
					className="game-overlay study-overlay"
					role="dialog"
					aria-modal="true"
					aria-label={
						sheet === "compare"
							? "Compare possible outcomes"
							: "Recorded studies"
					}
				>
					<SheetHeading
						title={
							sheet === "compare"
								? "Compare possible outcomes"
								: "Recorded studies"
						}
						close={() => {
							session.cancelComparison();
							setSheet("town");
						}}
					/>
					<div className="overlay-scroll">
						<TownInspector
							session={session}
							section={sheet === "compare" ? "town" : "recorded"}
						/>
					</div>
				</section>
			)}
			{sheet === "feedback" && (
				<SendWord session={session} onClose={() => setSheet("town")} />
			)}
		</div>
	);
}
function SheetHeading({ title, close }: { title: string; close: () => void }) {
	return (
		<div className="sheet-heading">
			<h2>{title}</h2>
			<button type="button" aria-label={`Close ${title}`} onClick={close}>
				×
			</button>
		</div>
	);
}
