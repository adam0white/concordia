import { useEffect, useState } from "react";
import Comparison from "./ui/Comparison";
import DayComparison from "./ui/DayComparison";
import ErrorMessage from "./ui/ErrorMessage";
import EveningBoard from "./ui/EveningBoard";
import { clock, initial, metricLabel, number, placeName } from "./ui/format";
import HandcartCard from "./ui/HandcartCard";
import { groupStories } from "./ui/observations";
import PersonPanel from "./ui/PersonPanel";
import { activityLabel, canAct } from "./ui/person-status";
import SessionFooter from "./ui/SessionFooter";
import Stories from "./ui/Stories";
import StoryHeadline, { storyAnchor } from "./ui/StoryHeadline";
import TownHealth from "./ui/TownHealth";
import TownMap from "./ui/TownMap";
import { useStoryWatch } from "./ui/useStoryWatch";
import { useVisitorSession } from "./ui/useVisitorSession";

export default function App() {
	const session = useVisitorSession();
	const {
		town,
		healthHistory,
		progress,
		error,
		playing,
		comparing,
		saveConflict,
		branchReport,
		branchProgress,
		branchError,
		speed,
		setSpeed,
		selected,
		setSelected,
		observed,
		seedInput,
		setSeedInput,
		interventionNotice,
		trends,
		send,
		compare,
		intervene,
		pause,
		play,
		startTown,
	} = session;
	const [tab, setTab] = useState<"town" | "stories" | "inspector">("town");
	const [storyFocus, setStoryFocus] = useState<{ id: string }>();
	const [storyPersonFocus, setStoryPersonFocus] = useState<{ id: string }>();
	useEffect(() => {
		if (!storyPersonFocus || selected !== storyPersonFocus.id) return;
		const panel = document.querySelector<HTMLElement>(".person-panel");
		panel?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
		panel?.scrollIntoView({ block: "start", behavior: "instant" });
		setStoryPersonFocus(undefined);
	}, [storyPersonFocus, selected]);
	useEffect(() => {
		if (tab !== "stories" || !storyFocus) return;
		const target = document.getElementById(storyAnchor(storyFocus.id));
		target?.focus({ preventScroll: true });
		target?.scrollIntoView({ block: "start", behavior: "instant" });
		setStoryFocus(undefined);
	}, [tab, storyFocus]);

	const person = town?.people.find((p) => p.id === selected);
	const selectedPlace = town?.places.find((p) => p.id === person?.placeId);
	const hallOpen = town?.places.some(
		(p) => (p.id.includes("hall") || p.kind.includes("hall")) && p.open,
	);
	const stories = town ? groupStories(town, observed) : [];
	const storyWatch = useStoryWatch(
		{ playing, seed: town?.seed, now: town?.now, storyId: stories[0]?.id },
		pause,
	);
	const familiarEvents = observed?.events ?? [];
	const followedEvents = selected
		? familiarEvents.filter(
				(e) => e.actorId === selected || e.targetId === selected,
			)
		: familiarEvents;
	const recentEvents = (
		followedEvents.length
			? followedEvents
			: familiarEvents.length
				? familiarEvents
				: (town?.events ?? [])
	)
		.slice(-3)
		.reverse();
	return (
		<div className="app">
			<header className="masthead">
				<a className="brand" href="./">
					<span className="brand-mark">n.</span>
					<div>
						<h1>Neighbours</h1>
						<span>A L D E R &nbsp; Q U A Y</span>
					</div>
				</a>
				<div className="runtime-label">
					<span className={town ? "status-dot" : "status-dot loading"} />
					{town ? "Browser live · Concordia + HF" : "Starting browser runtime"}
				</div>
				<button
					type="button"
					className="icon-button theme-toggle"
					onClick={() =>
						document.documentElement.classList.toggle("alternate-theme")
					}
					aria-label="Switch colour theme"
				>
					◐
				</button>
			</header>
			{!town ? (
				<main className="loading-screen">
					<div className="loading-house">⌂</div>
					<span className="eyebrow">A town, coming to life</span>
					<h2>
						Ordinary lives.
						<br />
						Shared possibilities.
					</h2>
					<p>
						Eight neighbours. Two hundred other lives.
						<br />
						One community hall waiting to reopen.
					</p>
					<div className="loading-progress">
						<span className="status-dot loading" />
						{progress}
					</div>
					<p className="muted tiny">
						Python Concordia and Human Framework run here in your browser.
						<br />
						The first visit downloads the Python runtime.
					</p>
					{error && (
						<div className="error" role="alert">
							<strong>The town could not start.</strong>
							<ErrorMessage message={error} />
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
							<span className="eyebrow">Day {town.day} in Alder Quay</span>
							<strong>{clock(town.now)}</strong>
							<span className="weather">{town.weather}</span>
						</div>
						<div className="playback">
							<button
								type="button"
								className="play-button"
								onClick={() => {
									if (playing) pause();
									else {
										play();
									}
								}}
								disabled={comparing || saveConflict}
								aria-label={playing ? "Pause town" : "Play town"}
							>
								{playing ? "Ⅱ" : "▶"} <span>{playing ? "Pause" : "Play"}</span>
							</button>
							<button
								type="button"
								onClick={() => {
									storyWatch.resetBaseline();
									pause();
									send({ type: "step" });
								}}
								disabled={comparing || saveConflict}
								aria-label="Advance one round"
							>
								Step →
							</button>
							<label className="speed">
								<span className="sr-only">Playback speed</span>
								<select
									value={speed}
									onChange={(e) => setSpeed(Number(e.target.value))}
								>
									<option value={2400}>½×</option>
									<option value={1200}>1×</option>
									<option value={400}>3×</option>
									<option value={120}>10×</option>
								</select>
							</label>
						</div>
					</div>
					<StoryHeadline
						story={stories[0]}
						watch={storyWatch}
						open={(id) => {
							setTab("stories");
							setStoryFocus({ id });
						}}
					/>
					<main className="town-layout">
						<section className="map-section" aria-label="Town overview">
							<div className="map-heading">
								<div>
									<span className="eyebrow">Life beside the river</span>
									<h2>Alder Quay, after the flood.</h2>
								</div>
								<span className="population">
									{town.people.filter((p) => p.lifeState !== "dead").length}{" "}
									living residents
								</span>
							</div>
							<div className="map-frame">
								<TownMap town={town} selected={selected} select={setSelected} />
								<div className="map-caption">
									<span>
										<i className="legend-dot" /> Background neighbours · actual
										locations
									</span>
									<span>
										{person
											? `Following ${person.name} · ${!canAct(person) ? activityLabel(person) : selectedPlace ? placeName(selectedPlace) : person.placeId}`
											: "Select a neighbour to follow their day"}
									</span>
								</div>
							</div>
							<nav className="neighbour-strip" aria-label="Familiar neighbours">
								{town.people
									.filter((p) => p.known)
									.map((p) => (
										<button
											type="button"
											key={p.id}
											className={`neighbour life-${p.lifeState ?? "awake"} ${selected === p.id ? "active" : ""}`}
											onClick={() => setSelected(selected === p.id ? "" : p.id)}
										>
											<span
												className="mini-avatar"
												style={{ background: p.color }}
											>
												{initial(p.name)}
											</span>
											<span>
												<strong>{p.name.split(" ")[0]}</strong>
												<small>{activityLabel(p)}</small>
											</span>
										</button>
									))}
							</nav>
							<HandcartCard town={town} select={setSelected} />
							<EveningBoard town={town} select={setSelected} />
						</section>
						{person ? (
							<PersonPanel
								person={person}
								observed={observed}
								town={town}
								close={() => setSelected("")}
							/>
						) : (
							<aside className="town-notes">
								<span className="eyebrow">The shared work</span>
								<h2>
									{hallOpen ? "The doors are open." : "The hall is quiet."}
									<br />
									{hallOpen ? "Life carries on." : "The town isn’t."}
								</h2>
								<p>
									The flood closed a place for evening classes and shared meals.
									Life carried on elsewhere. Reopening it has to fit around
									people’s own lives.
								</p>
								{town.places
									.filter(
										(p) => p.id.includes("hall") || p.kind.includes("hall"),
									)
									.map((p) => (
										<div key={p.id} className="hall-state">
											<span className="eyebrow">{placeName(p)}</span>
											<strong>
												{p.open
													? "Safely inspected"
													: (town.stats.hallRepairs ?? 0) >= 12
														? "Ready for inspection"
														: "Still waiting for repair"}
											</strong>
											<p>{p.description}</p>
											<span className="tiny muted">
												{p.occupants} here · {p.reserved ?? p.occupants}{" "}
												activity places reserved
											</span>
										</div>
									))}
							</aside>
						)}
					</main>
					<section className="lower-section">
						<div
							className="section-tabs"
							role="tablist"
							aria-label="Town information"
						>
							{(["town", "stories", "inspector"] as const).map((t) => (
								<button
									type="button"
									key={t}
									role="tab"
									aria-selected={tab === t}
									aria-controls="town-info-panel"
									tabIndex={tab === t ? 0 : -1}
									onKeyDown={(e) => {
										const tabs = ["town", "stories", "inspector"] as const;
										const index = tabs.indexOf(t);
										const next =
											e.key === "ArrowRight"
												? (index + 1) % 3
												: e.key === "ArrowLeft"
													? (index + 2) % 3
													: e.key === "Home"
														? 0
														: e.key === "End"
															? 2
															: -1;
										const target = tabs[next];
										if (target) {
											e.preventDefault();
											setTab(target);
											e.currentTarget.parentElement
												?.querySelectorAll<HTMLButtonElement>("[role=tab]")
												[next]?.focus();
										}
									}}
									onClick={() => setTab(t)}
								>
									{t === "town"
										? person
											? `${person.name}’s day`
											: "Happening now"
										: t === "stories"
											? "Stories"
											: "Inspector"}
									{t === "inspector" &&
										town.diagnostics.some((d) => d.severity === "error") &&
										" •"}
								</button>
							))}
						</div>
						{tab === "town" && (
							<div
								className="event-grid"
								role="tabpanel"
								id="town-info-panel"
								aria-label="Town information"
							>
								{recentEvents.map((e) => (
									<article className="event" key={e.id}>
										<span className="eyebrow">
											Day {Math.floor(e.at / 1440) + 1} · {clock(e.at)} ·{" "}
											{e.kind.replaceAll("-", " ")}
										</span>
										<p>{e.text}</p>
										{e.actorId && (
											<button
												type="button"
												className="text-button"
												onClick={() => setSelected(e.actorId || "")}
											>
												Follow neighbour ↗
											</button>
										)}
									</article>
								))}
								{!recentEvents.length && (
									<p className="muted">No recent events to show.</p>
								)}
							</div>
						)}
						{tab === "stories" && (
							<div
								className="event-grid"
								role="tabpanel"
								id="town-info-panel"
								aria-label="Town information"
							>
								<Stories
									stories={stories}
									town={town}
									select={(id) => {
										setSelected(id);
										setStoryPersonFocus({ id });
									}}
								/>
								{!stories.length && (
									<p className="muted">
										Stories will appear when the town’s recorded events form a
										pattern.
									</p>
								)}
							</div>
						)}
						{tab === "inspector" && (
							<div
								className="inspector"
								role="tabpanel"
								id="town-info-panel"
								aria-label="Town inspector"
							>
								<TownHealth history={healthHistory} />
								<DayComparison
									report={branchReport}
									busy={comparing}
									disabled={saveConflict}
									progress={branchProgress}
									error={branchError}
									selected={selected}
									onRun={compare}
								/>
								<Comparison />
								<div>
									<form
										className="seed-form"
										onSubmit={(e) => {
											e.preventDefault();
											storyWatch.resetBaseline();
											startTown();
										}}
									>
										<label htmlFor="town-seed">New town seed</label>
										<div>
											<input
												disabled={comparing || saveConflict}
												id="town-seed"
												type="number"
												min="0"
												max="2147483647"
												step="1"
												value={seedInput}
												onChange={(e) => setSeedInput(e.target.value)}
												required
											/>
											<button
												type="submit"
												disabled={comparing || saveConflict}
											>
												Start town
											</button>
										</div>
										<p className="tiny muted">
											Same seed, same starting circumstances. Your current town
											is saved before replacing it.
										</p>
									</form>
									<h3>Shared resources</h3>
									{town.places.map((p) => (
										<div className="resource" key={p.id}>
											<span>{placeName(p)}</span>
											<span>
												{p.occupants} here
												{p.reserved !== undefined
													? ` · ${p.reserved}/${p.capacity} reserved`
													: ""}{" "}
												· {number(p.stock)} stock
											</span>
										</div>
									))}
								</div>
								<div>
									<h3>Observed trends</h3>
									{Object.entries(trends)
										.slice(0, 5)
										.map(([key, values]) => {
											const min = Math.min(...values),
												range = Math.max(...values) - min || 1;
											return (
												<div className="trend" key={key}>
													<span>{metricLabel(key)}</span>
													<svg
														viewBox="0 0 160 30"
														role="img"
														aria-label={`${metricLabel(key)}: ${values.map(number).join(", ")}`}
													>
														<polyline
															points={values
																.map(
																	(v, i) =>
																		`${(i / Math.max(values.length - 1, 1)) * 160},${27 - ((v - min) / range) * 24}`,
																)
																.join(" ")}
															fill="none"
															stroke="currentColor"
															strokeWidth="2"
														/>
													</svg>
													<strong>{number(values.at(-1) || 0)}</strong>
												</div>
											);
										})}
								</div>
								<div>
									<h3>Runtime evidence</h3>
									<p className="tiny muted">
										Live Python Concordia orchestration · published Human
										Framework decisions. Background residents use their labelled
										policy. Device-local world, not a shared server.
									</p>
									<div className="resource">
										<span>Seed</span>
										<strong>{town.seed}</strong>
									</div>
									{Object.entries(town.metrics).map(([k, v]) => (
										<div className="resource" key={k}>
											<span>{metricLabel(k)}</span>
											<strong>{number(v)}</strong>
										</div>
									))}
									{town.diagnostics.map((d) => (
										<p
											className={`diagnostic ${d.severity}`}
											key={`${d.code}-${d.message}`}
										>
											<strong>{d.code}</strong> {d.message}
										</p>
									))}
									{!town.diagnostics.length && (
										<p className="tiny muted">No runtime anomalies reported.</p>
									)}
								</div>
							</div>
						)}
					</section>
					<section className="interventions">
						<div>
							<span className="eyebrow">Change a circumstance</span>
							<p>A little help. Their own decisions.</p>
						</div>
						<div className="intervention-buttons">
							<div className="intervention-option">
								<button
									type="button"
									disabled={
										!town.controlsRemaining || comparing || saveConflict
									}
									onClick={() => intervene({ kind: "restore-bus" })}
								>
									Restore the bus
								</button>
								<small>Faster future trips. No instant arrivals.</small>
							</div>
							<div className="intervention-option">
								<button
									type="button"
									disabled={
										!town.controlsRemaining || comparing || saveConflict
									}
									onClick={() => intervene({ kind: "lend-tools" })}
								>
									Lend tools
								</button>
								<small>Add 3 tools to the shared supply.</small>
							</div>
							<div className="intervention-option">
								<button
									type="button"
									disabled={
										!town.controlsRemaining || comparing || saveConflict
									}
									onClick={() => intervene({ kind: "share-news" })}
								>
									Share hall news
								</button>
								<small>
									Tell awake neighbours. Repair remains their choice.
								</small>
							</div>
						</div>
						<span className="tiny muted">
							{town.controlsRemaining} interventions left
						</span>
					</section>
					{interventionNotice && (
						<p className="intervention-result" role="status">
							{interventionNotice}
						</p>
					)}
					{error && (
						<div className="error" role="alert">
							<ErrorMessage message={error} />
						</div>
					)}
					{saveConflict && (
						<div className="error" role="status">
							<p>
								Another tab saved the device town. This tab is paused and cannot
								save. Export to keep this version, or load the device town.
							</p>
							<button type="button" onClick={() => location.reload()}>
								Load device town
							</button>
						</div>
					)}
					<SessionFooter
						{...session}
						importSave={(file) => {
							storyWatch.resetBaseline();
							return session.importSave(file);
						}}
						restoreSave={(slot) => {
							storyWatch.resetBaseline();
							session.restoreSave(slot);
						}}
					/>
				</>
			)}
		</div>
	);
}
