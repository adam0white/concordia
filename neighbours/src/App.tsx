import { useEffect, useRef, useState } from "react";
import type {
	Intervention,
	PersonView,
	PlaceView,
	TownComparison,
	TownView,
	UiCommand,
	UiReply,
} from "./contracts";
import { RuntimeClient } from "./runtime-client";
import Comparison from "./ui/Comparison";
import DayComparison from "./ui/DayComparison";
import { groupStories, type ObservedFeed, observe } from "./ui/observations";
import { localSave } from "./ui/persistence";
import { activityLabel, canAct, lifeMarker } from "./ui/person-status";
import TownHealth, { type HealthHistory, sampleHealth } from "./ui/TownHealth";

const clock = (minutes: number) =>
	`${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(Math.floor(minutes % 60)).padStart(2, "0")}`;
const datedClock = (minutes: number) =>
	`Day ${Math.floor(minutes / 1440) + 1} · ${clock(minutes)}`;
const placeName = (place: PlaceView) =>
	place.id === "hall" && place.open ? "Community hall" : place.name;
const initial = (name: string) =>
	name
		.split(" ")
		.map((word) => word[0])
		.slice(0, 2)
		.join("");
const number = (value: number) =>
	Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1);
const metricLabel = (key: string) =>
	({
		hallRepairs: "Hall repairs",
		hallSafe: "Hall open",
		tools: "Available tools",
		totalTools: "All shared tools",
		methodLearners: "People with inspection methods",
		active: "People doing an activity",
		hfPeople: "HF-controlled residents",
		persistentPeople: "Persistent residents",
	})[key] ?? key.replaceAll("_", " ").replace(/([a-z])([A-Z])/g, "$1 $2");
function PlaceBuilding({ place, town }: { place: PlaceView; town: TownView }) {
	const is = (kind: string) =>
		place.id.includes(kind) || place.kind.includes(kind);
	if (is("garden"))
		return (
			<g className="garden-building">
				<rect
					x="-58"
					y="-38"
					width="116"
					height="72"
					rx="12"
					className="garden-soil"
				/>
				{[-31, -7, 17].map((y) => (
					<g key={y}>
						<rect
							x="-49"
							y={y}
							width="98"
							height="15"
							rx="3"
							className="garden-bed"
						/>
						{[-37, -15, 7, 29].map((x) => (
							<path
								key={x}
								d={`M${x} ${y + 12}v-8m0 4l-5-4m5 4l5-4`}
								className="garden-leaf"
							/>
						))}
					</g>
				))}
				<path
					d="M-23-40V-58L0-70L23-58V-40ZM0-70V-40M-23-58H23"
					className="glasshouse"
				/>
			</g>
		);
	if (is("quay"))
		return (
			<g>
				<ellipse cx="0" cy="2" rx="76" ry="43" className="quay-water" />
				<rect x="-61" y="-29" width="91" height="59" rx="3" className="jetty" />
				{[-49, -31, -13, 5, 23].map((x) => (
					<path key={x} d={`M${x}-26V27`} className="jetty-plank" />
				))}
				<path d="M41-23Q70-5 41 24Q27 0 41-23Z" className="boat" />
				<path d="M41-12V12" className="jetty-plank" />
				<circle cx="-56" cy="-24" r="4" className="jetty-post" />
				<circle cx="-56" cy="25" r="4" className="jetty-post" />
			</g>
		);
	return (
		<g>
			<rect
				x="-59"
				y="-38"
				width="118"
				height="77"
				rx="8"
				className="building-shadow"
			/>
			<rect
				x="-53"
				y="-43"
				width="106"
				height="69"
				rx="5"
				className="building"
			/>
			{is("workshop") ? (
				<>
					<path d="M-60-43V-65L-20-49V-65L20-49V-65L60-43Z" className="roof" />
					<rect x="35" y="-75" width="13" height="25" className="chimney" />
				</>
			) : is("clinic") ? (
				<rect x="-59" y="-50" width="118" height="10" rx="2" className="roof" />
			) : (
				<path d="M-60-43L0-66L60-43Z" className="roof" />
			)}
			{[-31, -6, 19].map((x) => (
				<rect
					key={x}
					x={x}
					y="-29"
					width="13"
					height="18"
					rx="2"
					className="window"
				/>
			))}
			<rect x="-9" y="5" width="18" height="22" rx="2" className="door" />
			{is("clinic") && (
				<path
					d="M-6-38H6V-27H17V-15H6V-4H-6V-15H-17V-27H-6Z"
					className="clinic-cross"
				/>
			)}
			{is("school") && (
				<g>
					<rect
						x="-12"
						y="-76"
						width="24"
						height="24"
						rx="2"
						className="building"
					/>
					<path d="M-17-76L0-88L17-76Z" className="roof" />
					<path d="M-6-58Q-6-71 0-71Q6-71 6-58Z" className="school-bell" />
					<path d="M-36 7H-17V22H-36Z" className="school-board" />
				</g>
			)}
			{is("market") && (
				<g>
					<path d="M-58-8H58L65 6H-65Z" className="awning" />
					{[-52, -26, 0, 26, 52].map((x) => (
						<path
							key={x}
							d={`M${x}-8l-3 14h13l-2-14Z`}
							className="awning-stripe"
						/>
					))}
					<path d="M-59 6V28M59 6V28" className="market-post" />
				</g>
			)}
			{is("workshop") && (
				<path
					d="M-36 3l16 18m-16 0l16-18M-39 2l7-3m9 24l6-4"
					className="workshop-tools"
				/>
			)}
			{is("hall") && (
				<g>
					{Array.from(
						{
							length: Math.max(
								0,
								Math.ceil((12 - (town.stats.hallRepairs ?? 0)) / 3),
							),
						},
						(_, i) => i,
					).map((i) => (
						<path
							key={`board-${i}`}
							d={`M${-42 + i * 23}-5l15 23`}
							className="repair-board"
						/>
					))}
					{Array.from({ length: 12 }, (_, i) => i).map((i) => (
						<rect
							key={`progress-${i}`}
							x={-47 + i * 8}
							y="32"
							width="5"
							height="5"
							rx="1"
							className={
								i < (town.stats.hallRepairs ?? 0)
									? "repair-done"
									: "repair-pending"
							}
						/>
					))}
					{!place.open && (
						<path d="M22-41h22v15H22Z" className="inspection-sign" />
					)}
				</g>
			)}
		</g>
	);
}
function TownMap({
	town,
	selected,
	select,
}: {
	town: TownView;
	selected: string;
	select: (id: string) => void;
}) {
	const maxX = Math.max(...town.places.map((p) => p.x));
	const maxY = Math.max(...town.places.map((p) => p.y));
	const point = (x: number, y: number) => ({
		x: 100 + (x / Math.max(maxX, 1)) * 780,
		y: 95 + (y / Math.max(maxY, 1)) * 480,
	});
	const personPoint = (person: PersonView) => {
		const place = town.places.find((p) => p.id === person.placeId);
		if (!place) return undefined;
		const start = point(place.x, place.y);
		const journey = person.journey;
		if (!journey || !canAct(person)) return start;
		const from = town.places.find((p) => p.id === journey.fromId);
		const to = town.places.find((p) => p.id === journey.toId);
		if (!from || !to) return start;
		const a = point(from.x, from.y),
			b = point(to.x, to.y);
		const fraction = Math.max(
			0,
			Math.min(
				1,
				(town.now - journey.departedAt) /
					Math.max(1, journey.arriveAt - journey.departedAt),
			),
		);
		return { x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction };
	};
	return (
		<svg
			className="town-map"
			viewBox="0 0 1080 700"
			role="img"
			aria-labelledby="map-title map-description"
		>
			<title id="map-title">Alder Quay town map</title>
			<desc id="map-description">
				Live residents at their actual locations. Select a named neighbour to
				see their activity and decisions. Dots show background residents, offset
				within their current location for visibility. Travel is projected
				between places using actual departure and arrival times. Named markers
				use z for sleep, ! for incapacity or a mental break, and × for death.{" "}
				{town.people.filter((p) => p.lifeState === "dead").length} deaths
				recorded; {town.people.filter((p) => p.lifeState === "downed").length}{" "}
				people currently unable to act.
			</desc>
			<defs>
				<pattern
					id="grass"
					width="26"
					height="26"
					patternUnits="userSpaceOnUse"
				>
					<path
						d="M5 9l2-3m12 14l2-3"
						stroke="currentColor"
						strokeWidth=".7"
						opacity=".1"
					/>
				</pattern>
				<pattern
					id="water"
					width="35"
					height="22"
					patternUnits="userSpaceOnUse"
				>
					<path
						d="M0 11q9-5 18 0t18 0"
						fill="none"
						stroke="currentColor"
						strokeWidth="1"
						opacity=".18"
					/>
				</pattern>
				<filter id="shadow">
					<feDropShadow dx="0" dy="4" stdDeviation="5" floodOpacity=".08" />
				</filter>
			</defs>
			<rect width="1080" height="700" className="map-ground" />
			<rect width="1080" height="700" fill="url(#grass)" />
			<path
				d="M0 580 Q210 535 370 600T710 615T1080 570V700H0Z"
				className="river"
			/>
			<path
				d="M0 580 Q210 535 370 600T710 615T1080 570V700H0Z"
				fill="url(#water)"
			/>
			<text x="110" y="651" className="river-label">
				THE ALDER
			</text>
			<path d="M80 325H1000M320 60V572M740 60V575" className="road-edge" />
			<path d="M80 325H1000M320 60V572M740 60V575" className="road" />
			{[
				[70, 110],
				[170, 455],
				[460, 90],
				[990, 410],
				[960, 120],
				[430, 505],
				[70, 390],
				[570, 540],
			].map(([x, y]) => (
				<g
					key={`${x}-${y}`}
					transform={`translate(${x},${y})`}
					className="tree"
				>
					<path d="M0 14V31" />
					<circle r="17" />
					<circle cx="-9" cy="6" r="12" />
				</g>
			))}
			{town.places.map((place) => {
				const p = point(place.x, place.y);
				const hall = place.kind.includes("hall") || place.id.includes("hall");
				return (
					<g
						key={place.id}
						transform={`translate(${p.x},${p.y})`}
						className={`place ${place.open ? "" : "closed"} ${hall ? "hall" : ""}`}
					>
						<title>
							{placeName(place)}: {place.description}. {place.occupants}{" "}
							present. {place.open ? "Open" : "Closed"}
						</title>
						<path d="M0 0V35" className="connecting-path" />
						<PlaceBuilding place={place} town={town} />
						<rect
							x="-79"
							y="47"
							width="158"
							height="39"
							rx="8"
							className="place-sign"
						/>
						<text
							y="63"
							textAnchor="middle"
							className="place-name desktop-place-name"
						>
							{placeName(place)}
						</text>
						<text
							y="68"
							textAnchor="middle"
							className="place-name mobile-place-name"
						>
							{placeName(place)
								.replace("Community garden", "Garden")
								.replace("Riverside homes", "Homes")
								.replace("Market kitchen", "Market")
								.replace("Flooded hall", "Hall")
								.replace("Community hall", "Hall")}
						</text>
						<text y="78" textAnchor="middle" className="place-status">
							{place.open
								? `${place.occupants} here`
								: (town.stats.hallRepairs ?? 0) >= 12
									? "Awaiting inspection"
									: "Awaiting repair"}
						</text>
					</g>
				);
			})}
			{town.people
				.filter((p) => !p.known)
				.map((person, i) => {
					const p = personPoint(person);
					if (!p) return null;
					const angle = i * 2.399;
					const radius = person.journey ? 5 : 40 + (i % 5) * 5;
					return (
						<circle
							key={person.id}
							cx={p.x + Math.cos(angle) * radius}
							cy={p.y + Math.sin(angle) * radius}
							r="2.6"
							className={`background-person life-${person.lifeState ?? "awake"}`}
						>
							<title>
								{person.name}: {activityLabel(person)}
							</title>
						</circle>
					);
				})}
			{town.people
				.filter((p) => p.known)
				.map((person, i) => {
					const p = personPoint(person);
					if (!p) return null;
					const x = p.x - 48 + (i % 4) * 32;
					const y = p.y + 27 + Math.floor(i / 4) * 4;
					return (
						// biome-ignore lint/a11y/useSemanticElements: SVG groups cannot contain HTML buttons; equivalent native buttons follow the map.
						<g
							key={person.id}
							transform={`translate(${x},${y})`}
							className={`map-person life-${person.lifeState ?? "awake"} ${selected === person.id ? "selected" : ""}`}
							role="button"
							tabIndex={0}
							aria-label={`${person.name}: ${activityLabel(person)}`}
							onClick={() => select(person.id)}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									select(person.id);
								}
							}}
						>
							<circle r="17" className="person-halo" />
							<circle
								className="person-disc"
								r="13"
								fill={person.color || "#a26745"}
							/>
							<text textAnchor="middle" dy="4">
								{initial(person.name)}
							</text>
							{lifeMarker(person) && (
								<g className="life-badge">
									<circle cx="13" cy="-13" r="8" />
									<text x="13" y="-10" textAnchor="middle">
										{lifeMarker(person)}
									</text>
								</g>
							)}
							<title>
								{person.name}: {activityLabel(person)}
								{person.journey && canAct(person)
									? ` → ${person.journey.toId}`
									: ""}
							</title>
						</g>
					);
				})}
			<g transform="translate(982 632)" className="compass">
				<path d="M0-20L6 0L0-5L-6 0Z" />
				<text y="-28" textAnchor="middle">
					N
				</text>
			</g>
		</svg>
	);
}
function PersonPanel({
	person,
	town,
	close,
	observed,
}: {
	person: PersonView;
	town: TownView;
	close: () => void;
	observed: ObservedFeed | undefined;
}) {
	const panel = useRef<HTMLElement>(null);
	useEffect(() => {
		if (person.id && window.matchMedia("(max-width: 760px)").matches) {
			panel.current?.scrollIntoView({
				block: "start",
				behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
					? "instant"
					: "smooth",
			});
		}
	}, [person.id]);
	const place = town.places.find((p) => p.id === person.placeId);
	const destination = town.places.find((p) => p.id === person.journey?.toId);
	const next = person.commitments.find(
		(c) => c.at >= town.now && c.status === "pending",
	);
	return (
		<aside
			ref={panel}
			className="person-panel"
			aria-label={`${person.name}'s details`}
		>
			<button
				type="button"
				className="close-panel"
				onClick={close}
				aria-label="Close person details"
			>
				×
			</button>
			<div className="eyebrow">A neighbour · {person.policy.toUpperCase()}</div>
			<div className="person-heading">
				<span
					className={`avatar life-${person.lifeState ?? "awake"}`}
					style={{ background: person.color }}
				>
					{initial(person.name)}
				</span>
				<div>
					<h2>{person.name}</h2>
					<p>{person.role}</p>
				</div>
			</div>
			<p className="description">{person.description}</p>
			<div className="activity-card">
				<span className="eyebrow">
					Right now ·{" "}
					{person.journey && canAct(person)
						? "In transit"
						: place
							? placeName(place)
							: person.placeId}
				</span>
				<h3 aria-live="polite">{activityLabel(person)}</h3>
				{person.journey && canAct(person) && (
					<p>
						On the way to{" "}
						{destination ? placeName(destination) : person.journey.toId}
					</p>
				)}
				{(canAct(person) || person.lifeState === "asleep") &&
					person.until > town.now && (
						<p className="muted">Until {clock(person.until)}</p>
					)}
			</div>
			{person.lifeEvent && (
				<p className="life-event">
					<span className="eyebrow">
						Last condition change · {datedClock(person.lifeEvent.at)}
					</span>
					<br />
					{person.lifeEvent.text}
				</p>
			)}
			{person.inspection && (
				<section className="inspection-card" aria-label="Last timber decision">
					<span className="eyebrow">
						Last timber decision · {datedClock(person.inspection.at)}
					</span>
					<h3>{person.inspection.result.replaceAll("-", " ")}</h3>
					<p>
						Observed timber: {person.inspection.observations.moisture}. Support:{" "}
						{person.inspection.observations.support}.
					</p>
					<p>Chose to {person.inspection.action.replaceAll("-", " ")}.</p>
					<details>
						<summary>Decision evidence</summary>
						<p className="tiny muted">{person.inspection.source}</p>
						{person.inspection.methodTerms.length ? (
							person.inspection.methodTerms.map((term) => (
								<p className="tiny" key={term.source}>
									{term.source}: {number(term.value)}
								</p>
							))
						) : (
							<p className="tiny muted">
								No acquired method matched this decision.
							</p>
						)}
					</details>
				</section>
			)}
			{next &&
				person.lifeState !== "dead" &&
				person.lifeState !== "downed" &&
				person.lifeState !== "break" && (
					<div className="commitment">
						<span className="eyebrow">Promise · by {clock(next.at)}</span>
						<p>{next.label}</p>
					</div>
				)}
			{person.decision && (
				<div className="reason">
					<span className="eyebrow">
						Last choice
						{person.decision.decidedAt === undefined
							? ""
							: ` · ${datedClock(person.decision.decidedAt)}`}
					</span>
					<p>{person.decision.reason}</p>
					<span className="muted tiny">{person.decision.source}</span>
				</div>
			)}
			{person.observations && (
				<details>
					<summary>
						Received observations <span>{person.observations.length}</span>
					</summary>
					<div className="received">
						{person.observations
							.slice(-8)
							.reverse()
							.map((e) => (
								<p key={e.id}>
									<time>
										Day {Math.floor(e.at / 1440) + 1} · {clock(e.at)}
									</time>{" "}
									{e.text}
								</p>
							))}
						{!person.observations.length && (
							<p>No observations received yet.</p>
						)}
					</div>
				</details>
			)}
			<details open>
				<summary>Observed actions</summary>
				<div className="received">
					{observed?.events
						.filter((e) => e.actorId === person.id)
						.slice(-6)
						.reverse()
						.map((e) => (
							<p key={e.id}>
								<time>
									Day {Math.floor(e.at / 1440) + 1} · {clock(e.at)}
								</time>{" "}
								{e.text}
							</p>
						))}
					<p className="tiny muted">
						Recorded events received while watching this town.
					</p>
				</div>
			</details>
			<details>
				<summary>
					Recorded history for {person.name.split(" ")[0]}{" "}
					<span>{person.history.length}</span>
				</summary>
				<div className="received">
					{person.history
						.slice(-8)
						.reverse()
						.map((e) => (
							<p key={e.id}>
								<time>{clock(e.at)}</time> {e.text}
							</p>
						))}
					{!person.history.length && <p>No recorded history yet.</p>}
				</div>
			</details>
			<details>
				<summary>
					Relationships <span>{person.relationships.length}</span>
				</summary>
				{person.relationships.map((r) => (
					<div className="relationship" key={r.id}>
						<strong>{r.name}</strong>
						<p>{r.summary}</p>
						{r.origin && (
							<p className="tiny muted">
								{r.origin === "initial"
									? "Initial relationship in this town’s starting state."
									: "Relationship recorded through an encounter."}
							</p>
						)}
						<span className="muted tiny">Current trust {number(r.trust)}</span>
					</div>
				))}
			</details>
			<details>
				<summary>Need urgency & decision evidence</summary>
				{person.paidWork && (
					<div className="resource">
						<span>Paid shifts started today</span>
						<strong>{person.paidWork.starts}/2</strong>
					</div>
				)}
				{person.paidWork && (
					<p className="tiny muted">Paid shifts run between 08:00 and 18:00.</p>
				)}
				{Object.entries(person.needs).map(([key, value]) => (
					<div className="resource" key={key}>
						<span>{key.replaceAll("_", " ")}</span>
						<strong>{(value * 100).toFixed(1)}%</strong>
					</div>
				))}
				{person.decision?.options.map((option) => (
					<div className="resource" key={option.id}>
						<span>{option.label}</span>
						<strong>{option.utility.toFixed(3)}</strong>
					</div>
				))}
			</details>
		</aside>
	);
}
export default function App() {
	const [town, setTown] = useState<TownView>();
	const [healthHistory, setHealthHistory] = useState<HealthHistory>();
	const [progress, setProgress] = useState("Preparing the live town…");
	const [error, setError] = useState("");
	const [playing, setPlaying] = useState(false);
	const [comparing, setComparing] = useState(false);
	const [branchReport, setBranchReport] = useState<TownComparison>();
	const [branchProgress, setBranchProgress] = useState("");
	const [branchError, setBranchError] = useState("");
	const comparisonPending = useRef(false);
	const [speed, setSpeed] = useState(1200);
	const [selected, setSelected] = useState(() => {
		try {
			return localStorage.getItem("alder-follow") || "";
		} catch {
			return "";
		}
	});
	const [observed, setObserved] = useState<ObservedFeed>();
	const [seedInput, setSeedInput] = useState("42");
	const [downloadUrl, setDownloadUrl] = useState("");
	const [downloadLabel, setDownloadLabel] = useState("");
	const replaceAfterSave = useRef<UiCommand | null>(null);
	const [tab, setTab] = useState<"town" | "stories" | "inspector">("town");
	const [saved, setSaved] = useState("");
	const [interventionNotice, setInterventionNotice] = useState("");
	const interventionPending = useRef<{
		kind: Intervention["kind"];
		remaining: number;
	} | null>(null);
	const [hasSave, setHasSave] = useState(false);
	const [hasPrevious, setHasPrevious] = useState(false);
	const [trends, setTrends] = useState<Record<string, number[]>>({});
	const client = useRef<RuntimeClient | null>(null);
	const pending = useRef(false);
	const exportNext = useRef(false);
	const rounds = useRef(0);
	const file = useRef<HTMLInputElement>(null);
	useEffect(() => {
		let active = true;
		const receive = (reply: UiReply) => {
			if (!active) return;
			if (reply.type === "progress") {
				setProgress(reply.message);
				if (comparisonPending.current) setBranchProgress(reply.message);
			}
			if (reply.type === "comparison") {
				comparisonPending.current = false;
				setComparing(false);
				setBranchReport(reply.report);
				setBranchProgress("");
			}
			if (reply.type === "error") {
				if (comparisonPending.current) {
					comparisonPending.current = false;
					setComparing(false);
					setBranchError(reply.message);
					return;
				}
				setError(reply.message);
				setPlaying(false);
				pending.current = false;
			}
			if (reply.type === "ready" || reply.type === "state") {
				setTown(reply.view);
				setHealthHistory((previous) => sampleHealth(previous, reply.view));
				const intervention = interventionPending.current;
				if (
					intervention &&
					reply.view.controlsRemaining < intervention.remaining
				) {
					setInterventionNotice(
						intervention.kind === "lend-tools"
							? `Tools added. ${reply.view.stats.tools ?? "Updated"} tools now available.`
							: intervention.kind === "restore-bus"
								? "Bus restored. Future trips can use it; current activities keep their durations."
								: "Hall news broadcast to awake neighbours. Each decides whether to act on it.",
					);
					interventionPending.current = null;
				}
				setObserved((old) => observe(old, reply.view));
				setError("");
				pending.current = false;
				setTrends((old) => {
					const next = { ...old };
					for (const [key, value] of Object.entries(reply.view.stats))
						next[key] = [...(old[key] || []), value].slice(-40);
					return next;
				});
				if (reply.type === "ready") setPlaying(true);
				if (++rounds.current % 6 === 0) client.current?.send({ type: "save" });
			}
			if (reply.type === "save") {
				void localSave(
					reply.save,
					replaceAfterSave.current ? "previous" : "latest",
				)
					.then(() => {
						setSaved("Saved on this device");
						const replace = replaceAfterSave.current;
						replaceAfterSave.current = null;
						if (replace) {
							setHasPrevious(true);
							setObserved(undefined);
							setTrends({});
							setHealthHistory(undefined);
							client.current?.send(replace);
						}
						setHasSave(true);
					})
					.catch(() => {
						setSaved("Device save unavailable");
						const replace = replaceAfterSave.current;
						replaceAfterSave.current = null;
						if (
							replace &&
							window.confirm(
								"The current town could not be saved on this device. Replace it with a new town anyway?",
							)
						) {
							setObserved(undefined);
							setTrends({});
							setHealthHistory(undefined);
							client.current?.send(replace);
						}
					});
				if (exportNext.current) {
					setDownloadUrl(
						URL.createObjectURL(
							new Blob([JSON.stringify(reply.save)], {
								type: "application/json",
							}),
						),
					);
					exportNext.current = false;
				}
			}
		};
		client.current = new RuntimeClient(receive);
		void localSave()
			.then((value) => {
				if (active) setHasSave(value !== undefined);
			})
			.catch(() => {});
		void localSave(undefined, "previous")
			.then((value) => {
				if (active) setHasPrevious(value !== undefined);
			})
			.catch(() => {});
		return () => {
			active = false;
			client.current?.close();
			client.current = null;
		};
	}, []);
	useEffect(() => {
		try {
			localStorage.setItem("alder-follow", selected);
		} catch {}
	}, [selected]);
	useEffect(
		() => () => {
			if (downloadUrl) URL.revokeObjectURL(downloadUrl);
		},
		[downloadUrl],
	);
	const hasTown = town !== undefined;
	useEffect(() => {
		if (!playing || !hasTown) return;
		const timer = setInterval(() => {
			if (!pending.current && !comparisonPending.current) {
				pending.current = true;
				client.current?.send({ type: "step" });
			}
		}, speed);
		return () => clearInterval(timer);
	}, [playing, speed, hasTown]);
	const send = (command: UiCommand) => {
		if (!comparisonPending.current) client.current?.send(command);
	};
	const compare = (intervention: Intervention, rounds: 24 | 96) => {
		if (comparisonPending.current) return;
		if (replaceAfterSave.current) {
			setBranchError("Wait for the new town to finish starting, then compare.");
			return;
		}
		setPlaying(false);
		setComparing(true);
		setBranchError("");
		setBranchProgress("Pausing the live town and taking its checkpoint…");
		comparisonPending.current = true;
		client.current?.send({ type: "compare", intervention, rounds });
	};
	const intervene = (intervention: Intervention) => {
		if (!town || comparisonPending.current) return;
		interventionPending.current = {
			kind: intervention.kind,
			remaining: town.controlsRemaining,
		};
		setInterventionNotice("Changing the circumstance…");
		send({ type: "intervene", intervention });
	};
	const pause = () => {
		setPlaying(false);
		send({ type: "save" });
	};
	const person = town?.people.find((p) => p.id === selected);
	const selectedPlace = town?.places.find((p) => p.id === person?.placeId);
	const hallOpen = town?.places.some(
		(p) => (p.id.includes("hall") || p.kind.includes("hall")) && p.open,
	);
	const stories = town ? groupStories(town, observed) : [];
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
							<p>{error}</p>
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
								onClick={() => (playing ? pause() : setPlaying(true))}
								disabled={comparing}
								aria-label={playing ? "Pause town" : "Play town"}
							>
								{playing ? "Ⅱ" : "▶"} <span>{playing ? "Pause" : "Play"}</span>
							</button>
							<button
								type="button"
								onClick={() => {
									pause();
									send({ type: "step" });
								}}
								disabled={comparing}
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
								{stories.map((s) => (
									<article className="event" key={s.id}>
										<span className="eyebrow">{s.kind}</span>
										<h3>{s.title}</h3>
										<p>
											{s.summaries.length === 1
												? s.summaries[0]
												: `${s.summaries.length} recorded outcomes from the same class.`}
										</p>
										{s.summaries.length > 1 && (
											<details>
												<summary>Recorded outcomes</summary>
												{s.summaries.map((summary) => (
													<p key={summary}>{summary}</p>
												))}
											</details>
										)}
										<span className="tiny muted">
											{s.eventIds.length} linked events
											{s.missingEventIds.length
												? ` · ${s.missingEventIds.length} older details pruned`
												: ""}
										</span>
									</article>
								))}
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
											const seed = Number(seedInput);
											if (
												!Number.isSafeInteger(seed) ||
												seed < 0 ||
												seed > 2147483647
											) {
												setError(
													"Choose a whole-number seed from 0 to 2147483647.",
												);
												return;
											}
											setPlaying(false);
											replaceAfterSave.current = { type: "new", seed };
											send({ type: "save" });
										}}
									>
										<label htmlFor="town-seed">New town seed</label>
										<div>
											<input
												disabled={comparing}
												id="town-seed"
												type="number"
												min="0"
												max="2147483647"
												step="1"
												value={seedInput}
												onChange={(e) => setSeedInput(e.target.value)}
												required
											/>
											<button type="submit" disabled={comparing}>
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
									disabled={!town.controlsRemaining || comparing}
									onClick={() => intervene({ kind: "restore-bus" })}
								>
									Restore the bus
								</button>
								<small>Faster future trips. No instant arrivals.</small>
							</div>
							<div className="intervention-option">
								<button
									type="button"
									disabled={!town.controlsRemaining || comparing}
									onClick={() => intervene({ kind: "lend-tools" })}
								>
									Lend tools
								</button>
								<small>Add 3 tools to the shared supply.</small>
							</div>
							<div className="intervention-option">
								<button
									type="button"
									disabled={!town.controlsRemaining || comparing}
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
							{error}
						</div>
					)}
					<footer>
						<span>Neighbours · A live town, on your device.</span>
						<div>
							<span className="save-status">{saved}</span>
							{hasPrevious && (
								<button
									type="button"
									disabled={comparing}
									onClick={() => {
										setPlaying(false);
										void localSave(undefined, "previous")
											.then((save) => {
												if (save !== undefined) {
													setObserved(undefined);
													setTrends({});
													setHealthHistory(undefined);
													send({ type: "restore", save });
												}
											})
											.catch(() =>
												setError("Could not read the previous town."),
											);
									}}
								>
									Restore previous town
								</button>
							)}
							{hasSave && (
								<button
									type="button"
									disabled={comparing}
									onClick={() => {
										setPlaying(false);
										void localSave()
											.then((save) => {
												if (save !== undefined) {
													setObserved(undefined);
													setTrends({});
													setHealthHistory(undefined);
													send({ type: "restore", save });
												}
											})
											.catch(() => setError("Could not read the device save."));
									}}
								>
									Restore autosave
								</button>
							)}
							<button
								type="button"
								disabled={comparing}
								onClick={() => {
									setDownloadUrl("");
									setDownloadLabel(`Day ${town.day} · ${clock(town.now)}`);
									exportNext.current = true;
									send({ type: "save" });
								}}
							>
								Export
							</button>
							<button
								type="button"
								disabled={comparing}
								onClick={() => file.current?.click()}
							>
								Import
							</button>
							{downloadUrl && (
								<a
									className="download-save"
									href={downloadUrl}
									download="alder-quay-save.json"
								>
									Download save ↓{" "}
									<span className="tiny">({downloadLabel})</span>
								</a>
							)}
							<input
								ref={file}
								disabled={comparing}
								type="file"
								accept="application/json,.json"
								className="sr-only"
								aria-label="Import town save"
								onChange={async (e) => {
									const f = e.target.files?.[0];
									if (!f) return;
									if (f.size > 50 * 1024 * 1024) {
										setError(
											"This save is larger than the 50 MiB import limit. The current town is unchanged.",
										);
										e.target.value = "";
										return;
									}
									setPlaying(false);
									try {
										const save = JSON.parse(await f.text());
										setObserved(undefined);
										setTrends({});
										setHealthHistory(undefined);
										send({ type: "restore", save });
									} catch {
										setError(
											"This file is not valid JSON. The current town is unchanged.",
										);
									}
									e.target.value = "";
								}}
							/>
						</div>
					</footer>
				</>
			)}
		</div>
	);
}
