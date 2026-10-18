import { useCallback, useEffect, useState } from "react";
import type { Intervention } from "./contracts";
import ErrorMessage from "./ui/ErrorMessage";
import { clock } from "./ui/format";
import HelpPanel from "./ui/HelpPanel";
import { groupStories } from "./ui/observations";
import SessionMenu from "./ui/SessionMenu";
import Stories from "./ui/Stories";
import StoryHeadline, { storyAnchor } from "./ui/StoryHeadline";
import TownInspector from "./ui/TownInspector";
import TownNavigation, { type TownTab } from "./ui/TownNavigation";
import TownOverview from "./ui/TownOverview";
import { useStoryWatch } from "./ui/useStoryWatch";
import { useVisitorSession } from "./ui/useVisitorSession";
import Welcome from "./ui/Welcome";

export default function App() {
	const [hasEnteredTown, setHasEnteredTown] = useState(false);
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
		pause,
		play,
	} = session;
	const [tab, setTab] = useState<TownTab>("town");
	const [menuOpen, setMenuOpen] = useState(false);
	const [storyFocus, setStoryFocus] = useState<string>();
	const [personFocus, setPersonFocus] = useState<string>();
	const [comparisonFocus, setComparisonFocus] = useState(false);
	const [hallExpanded, setHallExpanded] = useState(false);
	const person = town?.people.find((resident) => resident.id === selected);
	const nextPerson = tab === "town" ? person : undefined;
	const stories = town ? groupStories(town, observed) : [];
	const storyWatch = useStoryWatch(
		{ playing, seed: town?.seed, now: town?.now, storyId: stories[0]?.id },
		pause,
	);
	useEffect(() => {
		if (!comparisonFocus || tab !== "inspector") return;
		const panel = document.getElementById("town-info-panel");
		panel?.focus({ preventScroll: true });
		panel?.scrollIntoView({ block: "start", behavior: "instant" });
		setComparisonFocus(false);
	}, [comparisonFocus, tab]);
	useEffect(() => {
		if (!personFocus || selected !== personFocus || tab !== "town") return;
		const panel = document.querySelector<HTMLElement>(".person-panel");
		panel?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
		panel?.scrollIntoView({ block: "start", behavior: "instant" });
		setPersonFocus(undefined);
	}, [personFocus, selected, tab]);
	useEffect(() => {
		if (tab !== "stories" || !storyFocus) return;
		const target = document.getElementById(storyAnchor(storyFocus));
		target?.focus({ preventScroll: true });
		target?.scrollIntoView({ block: "start", behavior: "instant" });
		setStoryFocus(undefined);
	}, [tab, storyFocus]);
	const follow = (id: string) => {
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
			document
				.getElementById("town-info-panel")
				?.scrollIntoView({ block: "start", behavior: "instant" });
		});
	};
	const changeTab = (next: TownTab) => {
		if (next === "town") setSelected("");
		setTab(next);
		requestAnimationFrame(() =>
			document
				.getElementById("town-info-panel")
				?.scrollIntoView({ block: "start", behavior: "instant" }),
		);
	};
	const compare = (input: Intervention, rounds: 96 | 672) => {
		setTab("inspector");
		setComparisonFocus(true);
		session.compare(input, rounds);
	};
	const readStory = (id: string) => {
		setTab("stories");
		setStoryFocus(id);
	};
	return (
		<div
			className={`app ${hasEnteredTown ? "town-entered mobile-focused" : ""}`}
		>
			<header className="masthead">
				<a className="brand" href="./">
					<span className="brand-mark">n.</span>
					<div>
						<h1>Neighbours</h1>
						<span>A L D E R &nbsp; Q U A Y</span>
					</div>
				</a>
				<div className="runtime-label">
					<span
						className={
							hasEnteredTown && !town ? "status-dot loading" : "status-dot"
						}
					/>
					{town
						? "Live on this device"
						: hasEnteredTown
							? "Starting town"
							: "A town on your device"}
				</div>
				{town && (
					<button
						type="button"
						className="save-menu-trigger"
						aria-label="Save and town options"
						onClick={() => setMenuOpen(true)}
					>
						Save <span aria-hidden="true">⋯</span>
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
				<Welcome onEnter={() => setHasEnteredTown(true)} />
			) : !town ? (
				<main className="loading-screen">
					<div className="loading-house">⌂</div>
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
					<div className="town-toolbar">
						<div className="town-time">
							<span className="eyebrow">Day {town.day}</span>
							<strong>{clock(town.now)}</strong>
							<span className="weather">{town.weather}</span>
						</div>
						<div className="playback">
							<button
								type="button"
								className="play-button"
								aria-label={
									advancing
										? "Stop advancing"
										: playing
											? "Pause town"
											: "Play town"
								}
								disabled={!advancing && (comparing || saveConflict)}
								onClick={() =>
									advancing
										? session.stopAdvancing()
										: playing
											? pause()
											: play()
								}
							>
								{advancing ? "■" : playing ? "Ⅱ" : "▶"}{" "}
								<span>{advancing ? "Stop" : playing ? "Pause" : "Play"}</span>
							</button>
							<button
								type="button"
								aria-label="Step: Advance one round"
								disabled={advancing || comparing || saveConflict}
								onClick={() => {
									storyWatch.resetBaseline();
									pause();
									session.send({ type: "step" });
								}}
							>
								Step →
							</button>
							<button
								type="button"
								className="next-story"
								aria-label={
									nextPerson
										? `Next story about ${nextPerson.name}`
										: "Next story"
								}
								title={
									nextPerson
										? `Next story about ${nextPerson.name}; at most seven days.`
										: "Next town story; at most seven days."
								}
								disabled={
									advancing || comparing || saveConflict || session.intervening
								}
								onClick={() => {
									storyWatch.resetBaseline();
									session.advanceUntil(
										nextPerson ? "person-story" : "story",
										nextPerson?.id,
									);
								}}
							>
								Next ›
							</button>
							<label className="speed">
								<span className="sr-only">Playback speed</span>
								<select
									disabled={advancing || comparing || saveConflict}
									value={session.speed}
									onChange={(event) =>
										session.setSpeed(Number(event.target.value))
									}
								>
									<option value={2400}>½×</option>
									<option value={1200}>1×</option>
									<option value={400}>3×</option>
									<option value={120}>10×</option>
								</select>
							</label>
						</div>
					</div>
					{(advancing || session.advanceNotice) && (
						<div className="advance-feedback" role="status" aria-live="polite">
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
					<TownNavigation active={tab} change={changeTab} />
					{storyWatch.paused && (
						<div className="paused-story">
							<span role="status">Paused for a new story</span>
							<button
								type="button"
								className="text-button"
								onClick={() => stories[0] && readStory(stories[0].id)}
							>
								Read story
							</button>
							<button
								type="button"
								className="text-button"
								onClick={() => setMenuOpen(true)}
							>
								Pause settings
							</button>
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
								Another tab saved the device town. This tab is paused. Export to
								keep this version, or load the device town.
							</p>
							<button type="button" onClick={() => setMenuOpen(true)}>
								Save options
							</button>
							<button type="button" onClick={() => location.reload()}>
								Load device town
							</button>
						</div>
					)}
					<div
						className={`active-view view-${tab}`}
						id="town-info-panel"
						role="tabpanel"
						aria-labelledby={`tab-${tab}`}
						tabIndex={-1}
					>
						{tab === "town" && (
							<>
								<TownOverview
									town={town}
									selected={selected}
									person={person}
									observed={observed}
									select={follow}
									close={closePerson}
									help={() => {
										if (
											town.places.some(
												(place) => place.id === "hall" && place.open,
											)
										)
											setHallExpanded(true);
										changeTab("help");
									}}
								/>
								{!person && (
									<StoryHeadline story={stories[0]} open={readStory} />
								)}
							</>
						)}
						{tab === "help" && (
							<>
								<HelpPanel
									hallExpanded={hallExpanded}
									setHallExpanded={setHallExpanded}
									onAdvance={() => {
										storyWatch.resetBaseline();
										session.advanceUntil("hall-choice");
									}}
									town={town}
									disabled={
										advancing ||
										comparing ||
										saveConflict ||
										session.intervening
									}
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
						{tab === "stories" && (
							<section className="stories-view">
								<h2>Stories</h2>
								<div className="event-grid">
									<Stories stories={stories} town={town} select={follow} />
									{!stories.length && (
										<p className="muted">
											Play or step to see what happens next.
										</p>
									)}
								</div>
							</section>
						)}
						{tab === "inspector" && <TownInspector session={session} />}
					</div>
					<SessionMenu
						session={session}
						open={menuOpen}
						close={() => setMenuOpen(false)}
						storyPauses={storyWatch.enabled}
						setStoryPauses={storyWatch.setEnabled}
						resetStory={storyWatch.resetBaseline}
					/>
				</>
			)}
		</div>
	);
}
