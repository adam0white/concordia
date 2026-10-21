import { useCallback, useEffect, useState } from "react";
import type { Intervention } from "./contracts";
import ErrorMessage from "./ui/ErrorMessage";
import { clock } from "./ui/format";
import HelpPanel from "./ui/HelpPanel";
import { LabPrivacy, lab } from "./ui/lab";
import {
	HubMark,
	InkStamp,
	type Milestone,
	OtherNotebooks,
} from "./ui/Notebook";
import { groupStories } from "./ui/observations";
import PersonPanel from "./ui/PersonPanel";
import PlacePanel from "./ui/PlacePanel";
import QueuedWalkNotice from "./ui/QueuedWalkNotice";
import SessionMenu from "./ui/SessionMenu";
import { PlayerAction, SpeakPanel } from "./ui/SpeakPanel";
import Stories from "./ui/Stories";
import StoryHeadline, { storyAnchor } from "./ui/StoryHeadline";
import TownGoal from "./ui/TownGoal";
import TownInspector from "./ui/TownInspector";
import TownNavigation, {
	MoreNavigation,
	type MoreTab,
	type TownTab,
} from "./ui/TownNavigation";
import TownOverview, { NeighbourStrip } from "./ui/TownOverview";
import { useVisitorSession } from "./ui/useVisitorSession";
import Welcome from "./ui/Welcome";

export default function App() {
	const [hasEnteredTown, setHasEnteredTown] = useState(false);
	useEffect(() => {
		lab.screen(hasEnteredTown ? "play" : "title");
		if (hasEnteredTown) lab.milestone("run started");
	}, [hasEnteredTown]);
	const focusLoading = useCallback((heading: HTMLHeadingElement | null) => {
		heading?.focus();
	}, []);
	const session = useVisitorSession({ enabled: hasEnteredTown });
	const {
		town,
		playing,
		comparing,
		advancing,
		saveConflict,
		selected,
		setSelected,
		observed,
	} = session;
	const [tab, setTab] = useState<TownTab>("town");
	const [moreTab, setMoreTab] = useState<MoreTab>("help");
	const { menuOpen } = session;
	const [storyFocus, setStoryFocus] = useState<string>();
	const [personFocus, setPersonFocus] = useState<string>();
	const [selectedPlace, setSelectedPlace] = useState("");
	const [placeFocus, setPlaceFocus] = useState(false);
	const [comparisonFocus, setComparisonFocus] = useState(false);
	const [hallExpanded, setHallExpanded] = useState(false);
	const person = town?.people.find((resident) => resident.id === selected);
	const place = town?.places.find((p) => p.id === selectedPlace);
	const drawer =
		tab === "town" ? (person ? "person" : place ? "place" : undefined) : tab;
	const stories = town ? groupStories(town, observed) : [];
	const milestones: Milestone[] = [];
	if (town?.places.some((place) => place.id === "hall" && place.open))
		milestones.push({ id: "hall-open", text: "The hall reopened" });
	for (const goal of town?.player?.goals ?? [])
		if (goal.status === "done")
			milestones.push({ id: `goal-${goal.id}`, text: goal.title });
	if (town?.handcart?.returned)
		milestones.push({ id: "cart-returned", text: "Jo has the handcart back" });
	useEffect(() => {
		if (!comparisonFocus || tab !== "more" || moreTab !== "compare") return;
		const panel = document.getElementById("town-info-panel");
		panel?.focus({ preventScroll: true });
		panel?.scrollTo({ top: 0, behavior: "instant" });
		setComparisonFocus(false);
	}, [comparisonFocus, tab, moreTab]);
	useEffect(() => {
		if (!personFocus || selected !== personFocus || tab !== "town") return;
		const panel = document.querySelector<HTMLElement>(".person-panel");
		panel?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
		document
			.getElementById("town-info-panel")
			?.scrollTo({ top: 0, behavior: "instant" });
		setPersonFocus(undefined);
	}, [personFocus, selected, tab]);
	useEffect(() => {
		if (tab !== "journal" || !storyFocus) return;
		const target = document.getElementById(storyAnchor(storyFocus));
		target?.focus({ preventScroll: true });
		target?.scrollIntoView({ block: "start", behavior: "instant" });
		setStoryFocus(undefined);
	}, [tab, storyFocus]);
	useEffect(() => {
		if (!placeFocus || !place || tab !== "town") return;
		document
			.getElementById("selected-place-name")
			?.focus({ preventScroll: true });
		document
			.getElementById("town-info-panel")
			?.scrollTo({ top: 0, behavior: "instant" });
		setPlaceFocus(false);
	}, [placeFocus, place, tab]);
	const inspectPlace = (id: string) => {
		setSelected("");
		setSelectedPlace(id);
		setTab("town");
		setPlaceFocus(true);
	};
	const closePlace = () => {
		const previous = selectedPlace;
		setSelectedPlace("");
		requestAnimationFrame(() => {
			const target = document.querySelector<HTMLElement>(
				`[data-map-place="${CSS.escape(previous)}"]`,
			);
			target?.focus({ preventScroll: true });
		});
	};
	const follow = (id: string) => {
		setSelectedPlace("");
		setSelected(id);
		setTab("town");
		setPersonFocus(id);
	};
	const closePerson = () => {
		const previous = selected;
		setSelected("");
		requestAnimationFrame(() => {
			// Closing removes the focused button. A newer deliberate focus takes
			// precedence over returning to the neighbour whose drawer just closed.
			if (document.activeElement !== document.body) return;
			const button = [
				...document.querySelectorAll<HTMLButtonElement>(".neighbour"),
			].find((candidate) => candidate.dataset.personId === previous);
			(button ?? document.getElementById("tab-town"))?.focus({
				preventScroll: true,
			});
		});
	};
	const changeTab = (next: TownTab) => {
		if (next === "town") {
			setSelected("");
			setSelectedPlace("");
		}
		setTab(next);
		requestAnimationFrame(() =>
			document
				.getElementById("town-info-panel")
				?.scrollTo({ top: 0, behavior: "instant" }),
		);
	};
	const openMore = (section: MoreTab) => {
		setMoreTab(section);
		changeTab("more");
	};
	const compare = (input: Intervention, rounds: 96 | 672) => {
		setTab("more");
		setMoreTab("compare");
		setComparisonFocus(true);
		session.compare(input, rounds);
	};
	const readStory = (id: string) => {
		setTab("journal");
		setStoryFocus(id);
	};
	const busy = advancing || comparing || saveConflict || session.playerPending;
	return (
		<div
			className={`app ${hasEnteredTown ? "town-entered" : ""} ${town ? "town-ready" : ""}`}
			data-drawer={town ? (drawer ?? "none") : undefined}
		>
			{!town && <LabPrivacy />}
			<header className="masthead">
				<HubMark />
				<a className="brand" href="./">
					<h1>Neighbours</h1>
					<span>Alder Quay</span>
				</a>
				{!town && (
					<div className="runtime-label">
						<span
							className={hasEnteredTown ? "status-dot loading" : "status-dot"}
						/>
						{hasEnteredTown ? "Starting town" : "A town on your device"}
					</div>
				)}
				{town && (
					<button
						type="button"
						className="save-menu-trigger"
						aria-label="Game menu"
						aria-haspopup="dialog"
						aria-expanded={menuOpen}
						disabled={session.menuPausing}
						onClick={() => session.openMenu()}
					>
						{session.menuPausing ? "Pausing…" : "Game menu"}{" "}
						<span aria-hidden="true">⋯</span>
					</button>
				)}
				<button
					type="button"
					className="icon-button theme-toggle"
					aria-label="Switch colour theme"
					onClick={() =>
						document.documentElement.classList.toggle("alternate-theme")
					}
				>
					◐
				</button>
			</header>
			{!hasEnteredTown ? (
				<>
					<Welcome onEnter={() => setHasEnteredTown(true)} />
					<footer className="page-footer">
						<OtherNotebooks />
					</footer>
				</>
			) : !town ? (
				<main className="loading-screen">
					<div className="loading-house" aria-hidden="true">
						⌂
					</div>
					<h2 tabIndex={-1} ref={focusLoading}>
						Bringing Alder Quay to life.
					</h2>
					<div className="loading-progress">
						<span className="status-dot loading" />
						{session.progress}
					</div>
					<p className="tiny muted">
						The first visit downloads the Python runtime.
					</p>
					{session.error && (
						<div className="error" role="alert">
							<strong>The town could not start.</strong>
							<ErrorMessage message={session.error} />
							<button type="button" onClick={() => location.reload()}>
								Try again
							</button>
						</div>
					)}
				</main>
			) : (
				<>
					<main className="scene">
						<TownOverview
							town={town}
							selected={selected}
							select={follow}
							selectedPlace={selectedPlace}
							selectPlace={inspectPlace}
							notes={
								<>
									<div className="town-time">
										<span className="eyebrow">Day {town.day}</span>
										<strong>{clock(town.now)}</strong>
										<span className="weather">{town.weather}</span>
									</div>
									<TownGoal
										town={town}
										help={() => {
											if (
												town.places.some(
													(place) => place.id === "hall" && place.open,
												)
											)
												setHallExpanded(true);
											openMore("help");
										}}
										openJournal={() => changeTab("journal")}
									/>
									<InkStamp reached={milestones} />
								</>
							}
						/>
						{drawer && (
							<section
								key={drawer}
								className={`drawer drawer-${drawer}`}
								id="town-info-panel"
								role="tabpanel"
								aria-labelledby={`tab-${tab}`}
								tabIndex={-1}
							>
								{drawer === "place" && place && (
									<PlacePanel
										town={town}
										place={place}
										close={closePlace}
										select={(id, talk) => {
											follow(id);
											if (talk) session.setConversationPerson(id);
										}}
										move={session.movePlayer}
										walkNotice={
											<QueuedWalkNotice
												town={town}
												playing={playing}
												advancing={advancing}
												pending={session.playerPending}
											/>
										}
										busy={
											session.advancing ||
											session.comparing ||
											session.saveConflict ||
											session.intervening ||
											session.playerPending
										}
									/>
								)}
								{drawer === "person" && person && (
									<PersonPanel
										person={person}
										town={town}
										observed={observed}
										close={closePerson}
										playerAction={
											<PlayerAction
												key={`${person.id}:${session.townEpoch}`}
												session={session}
												personId={person.id}
												walkNotice={
													<QueuedWalkNotice
														town={town}
														playing={playing}
														advancing={advancing}
														pending={session.playerPending}
													/>
												}
												conversation={
													<SpeakPanel
														session={session}
														personId={person.id}
														showAction={false}
													/>
												}
											/>
										}
									/>
								)}
								{drawer === "journal" && (
									<section className="journal stories-view">
										<div className="drawer-heading">
											<h2>Journal</h2>
											<button
												type="button"
												className="drawer-close"
												aria-label="Close journal"
												onClick={() => changeTab("town")}
											>
												×
											</button>
										</div>
										<SpeakPanel session={session} select={follow} journalOpen />
										<h3 className="journal-town">The town's record</h3>
										<p className="journal-lede">
											What the town recorded, newest first. Each entry rephrases
											recorded events.
										</p>
										<div className="event-grid">
											<Stories stories={stories} town={town} select={follow} />
											{!stories.length && (
												<p className="muted">
													Nothing written yet. Play or step to see what happens
													next.
												</p>
											)}
										</div>
									</section>
								)}
								{drawer === "more" && (
									<section className="more-sheet">
										<div className="drawer-heading">
											<h2>More</h2>
											<button
												type="button"
												className="drawer-close"
												aria-label="Close more"
												onClick={() => changeTab("town")}
											>
												×
											</button>
										</div>
										<MoreNavigation active={moreTab} change={setMoreTab} />
										<div
											id="more-panel"
											role="tabpanel"
											aria-labelledby={`more-tab-${moreTab}`}
										>
											{moreTab === "help" && (
												<>
													<HelpPanel
														hallExpanded={hallExpanded}
														setHallExpanded={setHallExpanded}
														town={town}
														disabled={busy || session.intervening}
														action={session.intervene}
														compare={compare}
														select={follow}
													/>
													{session.interventionNotice && (
														<p className="intervention-result" role="status">
															{session.interventionNotice}
														</p>
													)}
												</>
											)}
											{moreTab === "compare" && (
												<TownInspector session={session} />
											)}
										</div>
										<div className="more-footer">
											<p className="provenance">
												This town runs live in this browser tab. Every
												resident’s choices are computed on your device as time
												passes; nothing is played back from a recording.
											</p>

											<button
												type="button"
												className="text-button theme-toggle-more"
												aria-label="Switch colour theme"
												onClick={() =>
													document.documentElement.classList.toggle(
														"alternate-theme",
													)
												}
											>
												<span aria-hidden="true">◐</span> Paper or lamplight
											</button>
											<OtherNotebooks />
										</div>
									</section>
								)}
							</section>
						)}
					</main>
					<div className="dock">
						{(advancing || session.advanceNotice) && (
							<div
								className="advance-feedback"
								role="status"
								aria-live="polite"
							>
								{advancing ? (
									<span>{session.advanceProgress}</span>
								) : (
									<>
										<span className="advance-notice">
											{session.advanceNotice}
										</span>
										<button
											type="button"
											className="text-button"
											aria-label="Dismiss advance result"
											onClick={session.clearAdvanceNotice}
										>
											Dismiss
										</button>
									</>
								)}
							</div>
						)}
						{session.error && !menuOpen && (
							<div className="error" role="alert">
								<ErrorMessage message={session.error} />
							</div>
						)}
						{saveConflict && !menuOpen && (
							<div className="error" role="status">
								<p>
									Another tab saved the device town. This tab is paused.
									Download this run to keep this version, or load the device
									town.
								</p>
								<button type="button" onClick={() => session.openMenu()}>
									Open Game menu
								</button>
								<button type="button" onClick={() => location.reload()}>
									Load device town
								</button>
							</div>
						)}
						{!drawer && <StoryHeadline story={stories[0]} open={readStory} />}
						<NeighbourStrip
							town={town}
							selected={selected}
							select={follow}
							selectedPlace={selectedPlace}
							selectPlace={inspectPlace}
						/>
						<div className="town-toolbar">
							<div className="playback">
								<div className="playback-status">
									<span className="clock-rate" role="status">
										{session.clockRate}
									</span>
									<span className="playback-job-notice">
										<QueuedWalkNotice
											town={town}
											playing={playing}
											advancing={advancing}
											pending={session.playerPending}
										/>
									</span>
								</div>
							</div>
							<TownNavigation active={tab} change={changeTab} />
						</div>
					</div>
					<SessionMenu
						session={session}
						open={menuOpen}
						close={session.closeMenu}
					/>
				</>
			)}
		</div>
	);
}
