import { useEffect, useRef, useState } from "react";
import type { PersonView, PlaceView, TownView } from "../contracts";
import { initial, placeName } from "./format";
import { CartGlyph } from "./HandcartCard";
import MapPeopleChooser from "./MapPeopleChooser";
import {
	knownPlaceClusters,
	layoutKnownMarkers,
	type MarkerPoint,
} from "./map-markers";
import { activityLabel, canAct, lifeMarker } from "./person-status";

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
export default function TownMap({
	town,
	selected,
	select,
}: {
	town: TownView;
	selected: string;
	select: (id: string) => void;
}) {
	const map = useRef<SVGSVGElement>(null);
	const [width, setWidth] = useState(1080);
	const [activePlace, setActivePlace] = useState("");
	useEffect(() => {
		const element = map.current;
		if (!element) return;
		const resize = () => setWidth(element.getBoundingClientRect().width);
		resize();
		const observer = new ResizeObserver(resize);
		observer.observe(element);
		return () => observer.disconnect();
	}, []);
	const markerScale = Math.max(1, 1080 / Math.max(1, width));
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
	const cartLocation = town.handcart?.returned
		? (() => {
				const jo = town.people.find((person) => person.id === "jo");
				return jo ? personPoint(jo) : undefined;
			})()
		: (() => {
				const workshop = town.places.find((place) => place.id === "workshop");
				return workshop ? point(workshop.x, workshop.y) : undefined;
			})();

	const knownPoints: MarkerPoint[] = town.people
		.filter((person) => person.known)
		.flatMap((person) => {
			const position = personPoint(person);
			return position
				? [
						{
							...position,
							id: person.id,
							placeId: person.placeId,
							travelling: Boolean(person.journey && canAct(person)),
						},
					]
				: [];
		});
	const clusters = knownPlaceClusters(knownPoints, width <= 600);
	const clusteredIds = new Set(
		clusters.flatMap((cluster) => cluster.people.map((person) => person.id)),
	);
	const visiblePoints = knownPoints.filter(
		(person) => !clusteredIds.has(person.id),
	);
	const markers = layoutKnownMarkers(visiblePoints, markerScale);
	const activePlaceView = town.places.find((place) => place.id === activePlace);
	const activeCluster = clusters.find(
		(cluster) => cluster.placeId === activePlace,
	);
	useEffect(() => {
		if (activePlace && !activeCluster) setActivePlace("");
	}, [activePlace, activeCluster]);
	const closeChooser = () => {
		setActivePlace("");
		map.current
			?.querySelector<SVGGElement>(`[data-place="${CSS.escape(activePlace)}"]`)
			?.focus();
	};

	return (
		<>
			<svg
				ref={map}
				className="town-map"
				viewBox="0 0 1080 700"
				role="img"
				aria-labelledby="map-title map-description"
			>
				<title id="map-title">Alder Quay town map</title>
				<desc id="map-description">
					Live residents at their actual locations. Select a named neighbour to
					see their activity and decisions. Dots show background residents,
					offset within their current location for visibility. Travel is
					projected between places using actual departure and arrival times.
					Named neighbours at shared places use a count badge on narrow maps;
					select it for names. Larger maps use short leader lines to their
					actual place. Travellers stay on their route. Named markers use z for
					sleep, ! for incapacity or a mental break, and × for death.{" "}
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
				{town.handcart && cartLocation && (
					<g
						className="map-cart"
						transform={`translate(${cartLocation.x + 35},${cartLocation.y - 25}) scale(${markerScale * 0.35})`}
					>
						<title>
							{town.handcart.returned
								? "Handcart with Jo"
								: "Handcart at the workshop"}
						</title>
						<CartGlyph
							progress={town.handcart.progress}
							total={town.handcart.total}
						/>
					</g>
				)}
				{visiblePoints.map((point) => {
					const marker = markers.get(point.id);
					return marker && (marker.x !== point.x || marker.y !== point.y) ? (
						<line
							key={point.id}
							className="map-leader"
							x1={point.x}
							y1={point.y}
							x2={marker.x}
							y2={marker.y}
						/>
					) : null;
				})}
				{clusters.map((cluster) => {
					const place = town.places.find(
						(place) => place.id === cluster.placeId,
					);
					return (
						// biome-ignore lint/a11y/useSemanticElements: SVG groups cannot contain HTML buttons; the chooser uses native buttons.
						<g
							key={cluster.placeId}
							data-place={cluster.placeId}
							data-count={cluster.people.length}
							className="map-cluster"
							transform={`translate(${cluster.x},${cluster.y}) scale(${markerScale})`}
							role="button"
							tabIndex={0}
							aria-label={`${cluster.people.length} neighbours at ${place ? placeName(place) : cluster.placeId}`}
							aria-expanded={activePlace === cluster.placeId}
							aria-controls="map-place-chooser"
							onClick={() => setActivePlace(cluster.placeId)}
							onKeyDown={(event) => {
								if (event.key === "Enter" || event.key === " ") {
									event.preventDefault();
									setActivePlace(cluster.placeId);
								}
							}}
						>
							<circle r="22" />
							<text textAnchor="middle" dy="5">
								{cluster.people.length}
							</text>
						</g>
					);
				})}

				{town.people
					.filter((p) => p.known)
					.map((person) => {
						const marker = markers.get(person.id);
						if (!marker) return null;
						return (
							// biome-ignore lint/a11y/useSemanticElements: SVG groups cannot contain HTML buttons; equivalent native buttons follow the map.
							<g
								key={person.id}
								transform={`translate(${marker.x},${marker.y}) scale(${markerScale})`}
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
								<circle r="22" className="person-hit" />
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
			{activeCluster && (
				<div id="map-place-chooser">
					<MapPeopleChooser
						place={activePlaceView ? placeName(activePlaceView) : activePlace}
						people={activeCluster.people.flatMap((point) => {
							const person = town.people.find(
								(person) => person.id === point.id,
							);
							return person ? [person] : [];
						})}
						close={closeChooser}
						select={(id) => {
							setActivePlace("");
							select(id);
						}}
					/>
				</div>
			)}
		</>
	);
}
