import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { PersonView, PlaceView, TownView } from "../contracts";
import { initial, placeName } from "./format";
import { CartGlyph } from "./HandcartCard";
import {
	hash,
	inkBox,
	inkCircle,
	inkLine,
	inkShape,
	jitter,
	seeded,
} from "./ink";
import { knownOpenNeeds } from "./known-needs";
import MapPeopleChooser from "./MapPeopleChooser";
import {
	knownPlaceClusters,
	labelBox,
	layoutKnownMarkers,
	type MarkerAvoid,
	type MarkerPoint,
	youMarkerPlacement,
} from "./map-markers";
import { activityLabel, canAct, lifeMarker } from "./person-status";

/** The short name a narrow map prints under a place. */
function shortPlaceName(place: PlaceView) {
	return placeName(place)
		.replace("Community garden", "Garden")
		.replace("Riverside homes", "Homes")
		.replace("Market kitchen", "Market")
		.replace("Flooded hall", "Hall")
		.replace("Community hall", "Hall");
}
function placeStatus(repairs: number) {
	return repairs >= 12 ? "awaiting inspection" : "awaiting repair";
}

/**
 * Ink-on-paper town map. Places, people and journeys sit at their actual
 * projected positions; seeded jitter only changes how a line is drawn. A phone
 * in portrait gets a portrait sheet so the town fills the scene.
 */
type Sheet = {
	width: number;
	height: number;
	left: number;
	right: number;
	top: number;
	bottom: number;
	portrait: boolean;
};
const LANDSCAPE: Sheet = {
	width: 1080,
	height: 700,
	left: 200,
	right: 120,
	top: 130,
	bottom: 150,
	portrait: false,
};
const PORTRAIT: Sheet = {
	width: 720,
	height: 1000,
	left: 112,
	right: 110,
	top: 235,
	bottom: 150,
	portrait: true,
};

function Ink({
	d,
	className = "ink",
	draw = true,
}: {
	d: string;
	className?: string;
	draw?: boolean;
}) {
	return (
		<path
			d={d}
			className={draw ? `${className} ink-draw` : className}
			pathLength={draw ? 1 : undefined}
		/>
	);
}
function Box({
	id,
	x,
	y,
	w,
	h,
	fill = "paper-fill",
	stroke = "ink",
}: {
	id: string;
	x: number;
	y: number;
	w: number;
	h: number;
	fill?: string;
	stroke?: string;
}) {
	const box = inkBox(id, x, y, w, h);
	return (
		<>
			<path d={box.fill} className={fill} />
			<Ink d={box.stroke} className={stroke} />
		</>
	);
}
function House({ id, x, y }: { id: string; x: number; y: number }) {
	return (
		<g transform={`translate(${x},${y})`}>
			<Box id={`${id}:body`} x={-17} y={-17} w={34} h={30} />
			<Ink
				d={inkShape(`${id}:roof`, [
					[-22, -17],
					[0, -34],
					[22, -17],
				])}
				className="ink roof"
			/>
			<Ink
				d={inkLine(`${id}:door`, [
					[-3, 13],
					[-3, 3],
					[5, 3],
					[5, 13],
				])}
				className="ink-soft"
				draw={false}
			/>
		</g>
	);
}

function Windows({ id, xs, y }: { id: string; xs: number[]; y: number }) {
	return (
		<>
			{xs.map((x) => (
				<Ink
					key={x}
					d={inkBox(`${id}:w${x}`, x, y, 13, 16, 0.7).stroke}
					className="ink-soft"
					draw={false}
				/>
			))}
		</>
	);
}

function PlaceDrawing({
	place,
	repairs,
}: {
	place: PlaceView;
	repairs: number;
}): ReactNode {
	const id = place.id;
	const is = (kind: string) => id.includes(kind) || place.kind.includes(kind);
	if (is("garden"))
		return (
			<g>
				{[-30, -8, 14].map((y) => (
					<g key={y}>
						<Ink
							d={inkLine(`${id}:bed${y}`, [
								[-52, y + 10],
								[52, y + 10],
							])}
						/>
						{[-40, -18, 4, 26, 44].map((x) => (
							<Ink
								key={x}
								d={inkLine(
									`${id}:sprout${x}:${y}`,
									[
										[x - 4, y + 2],
										[x, y + 9],
										[x + 4, y + 1],
									],
									0.6,
									6,
								)}
								className="ink-soft"
								draw={false}
							/>
						))}
					</g>
				))}
				<Ink
					d={inkShape(`${id}:glass`, [
						[-22, -40],
						[-22, -58],
						[0, -70],
						[22, -58],
						[22, -40],
					])}
				/>
				<Ink
					d={inkLine(`${id}:glass-rib`, [
						[0, -70],
						[0, -40],
					])}
					className="ink-soft"
					draw={false}
				/>
			</g>
		);
	if (is("quay"))
		return (
			<g>
				<Box id={`${id}:jetty`} x={-62} y={-26} w={92} h={52} />
				{[-46, -28, -10, 8].map((x) => (
					<Ink
						key={x}
						d={inkLine(`${id}:plank${x}`, [
							[x, -22],
							[x, 22],
						])}
						className="ink-soft"
						draw={false}
					/>
				))}
				<Ink
					d={inkShape(`${id}:boat`, [
						[42, -24],
						[66, -4],
						[42, 24],
						[34, 0],
					])}
				/>
				{[-26, 26].map((y) => (
					<path
						key={y}
						d={inkCircle(`${id}:post${y}`, -62, y, 4)}
						className="ink-fill"
					/>
				))}
			</g>
		);
	if (id === "homes")
		return (
			<g>
				<title>Riverside housing district, several streets of homes</title>
				{[-66, -22, 22, 66].flatMap((x) =>
					[-42, 6].map((y) => (
						<House
							key={`${x}:${y}`}
							id={`${id}:${x}:${y}`}
							x={x + jitter(id, `${x}${y}`) * 3}
							y={y}
						/>
					)),
				)}
			</g>
		);
	const hall = is("hall");
	const boards = hall ? Math.max(0, Math.ceil((12 - repairs) / 3)) : 0;
	return (
		<g>
			<Box id={`${id}:body`} x={-53} y={-43} w={106} h={69} />
			{is("workshop") ? (
				<>
					<Ink
						d={inkLine(`${id}:roof`, [
							[-60, -43],
							[-60, -64],
							[-20, -49],
							[-20, -64],
							[20, -49],
							[20, -64],
							[60, -43],
						])}
						className="ink roof"
					/>
					<Box id={`${id}:chimney`} x={34} y={-76} w={12} h={24} />
					{/* A hammer, not crossed tools: × is the map's death marker. */}
					<g className="tool-mark">
						<Ink
							d={inkLine(`${id}:hammer-handle`, [
								[-30, 22],
								[-30, 4],
							])}
						/>
						<Box id={`${id}:hammer-head`} x={-39} y={-2} w={18} h={7} />
					</g>
				</>
			) : is("clinic") ? (
				<>
					<Ink
						d={inkLine(`${id}:roof`, [
							[-60, -46],
							[60, -46],
						])}
						className="ink roof"
					/>
					<Ink
						d={inkShape(
							`${id}:cross`,
							[
								[-5, -38],
								[5, -38],
								[5, -30],
								[13, -30],
								[13, -20],
								[5, -20],
								[5, -12],
								[-5, -12],
								[-5, -20],
								[-13, -20],
								[-13, -30],
								[-5, -30],
							],
							0.5,
							6,
						)}
						className="ink rope-mark"
					/>
				</>
			) : (
				<Ink
					d={inkShape(`${id}:roof`, [
						[-61, -43],
						[0, -67],
						[61, -43],
					])}
					className="ink roof"
				/>
			)}
			{!is("clinic") && <Windows id={id} xs={[-31, -6, 19]} y={-30} />}
			<Ink
				d={inkLine(`${id}:door`, [
					[-9, 26],
					[-9, 5],
					[9, 5],
					[9, 26],
				])}
			/>
			{is("school") && (
				<g>
					<Box id={`${id}:tower`} x={-12} y={-90} w={24} h={26} />
					<Ink
						d={inkShape(`${id}:tower-roof`, [
							[-17, -90],
							[0, -102],
							[17, -90],
						])}
						className="ink roof"
					/>
					<path d={inkCircle(`${id}:bell`, 0, -78, 5)} className="ink" />
				</g>
			)}
			{is("market") && (
				<g>
					<Ink
						d={inkLine(
							`${id}:awning`,
							[
								[-62, -6],
								[-44, 4],
								[-26, -6],
								[-8, 4],
								[10, -6],
								[28, 4],
								[46, -6],
								[62, 4],
							],
							0.8,
							10,
						)}
					/>
					<Ink
						d={inkLine(`${id}:posts`, [
							[-58, -6],
							[-58, 26],
						])}
						className="ink-soft"
						draw={false}
					/>
					<Ink
						d={inkLine(`${id}:posts2`, [
							[58, -6],
							[58, 26],
						])}
						className="ink-soft"
						draw={false}
					/>
				</g>
			)}
			{hall && (
				<g>
					{Array.from({ length: boards }, (_, i) => i).map((i) => (
						<Ink
							key={`board-${i}`}
							d={inkLine(`${id}:board${i}`, [
								[-42 + i * 23, -30],
								[-28 + i * 23, -10],
							])}
							className="ink board"
						/>
					))}
					<Ink
						d={inkLine(
							`${id}:high-water`,
							[
								[-58, -2],
								[58, -2],
							],
							1.6,
							9,
						)}
						className="high-water"
						draw={false}
					/>
					<text x="62" y="2" className="map-note high-water-note">
						high water
					</text>
					{Array.from({ length: 12 }, (_, i) => i).map((i) => {
						const group = Math.floor(i / 5);
						const inGroup = i % 5;
						const x = -42 + group * 32 + inGroup * 6;
						const done = i < repairs;
						return (
							<Ink
								key={`tally-${i}`}
								d={
									inGroup === 4
										? inkLine(`${id}:tally${i}`, [
												[x - 26, 40],
												[x + 2, 31],
											])
										: inkLine(`${id}:tally${i}`, [
												[x, 30],
												[x + jitter(id, i) * 1.5, 42],
											])
								}
								className={done ? "tally done" : "tally pending"}
								draw={false}
							/>
						);
					})}
					{!place.open && (
						<g transform="translate(36,-58) rotate(-6)">
							<Box id={`${id}:sign`} x={-14} y={-8} w={28} h={14} />
							<text y="3" textAnchor="middle" className="map-note sign-note">
								shut
							</text>
						</g>
					)}
				</g>
			)}
		</g>
	);
}

/** Scribbled tree: a trunk and a lumpy canopy outline. */
function Tree({ id, x, y }: { id: string; x: number; y: number }) {
	return (
		<g transform={`translate(${x},${y})`} className="tree">
			<Ink
				d={inkLine(`${id}:trunk`, [
					[0, 6],
					[0, 24],
				])}
				className="ink-soft"
				draw={false}
			/>
			<path
				d={inkCircle(`${id}:canopy`, 0, -4, 14, 0.18)}
				className="ink-soft"
			/>
		</g>
	);
}

export default function TownMap({
	town,
	selected,
	select,
	selectedPlace,
	selectPlace,
}: {
	town: TownView;
	selected: string;
	select: (id: string) => void;
	selectedPlace?: string;
	selectPlace?: (id: string) => void;
}) {
	const needs = knownOpenNeeds(town);
	const map = useRef<SVGSVGElement>(null);
	const frame = useRef<HTMLDivElement>(null);
	const [box, setBox] = useState({ width: 1080, height: 700 });
	const [activePlace, setActivePlace] = useState("");
	useEffect(() => {
		const element = frame.current;
		if (!element) return;
		const resize = () => {
			const rect = element.getBoundingClientRect();
			setBox({ width: rect.width, height: rect.height });
		};
		resize();
		const observer = new ResizeObserver(resize);
		observer.observe(element);
		return () => observer.disconnect();
	}, []);
	const sheet =
		box.height > box.width * 1.1 && box.width < 760 ? PORTRAIT : LANDSCAPE;
	// Viewbox units per CSS pixel with "meet" scaling; markers keep 44px targets.
	const markerScale = Math.max(
		1,
		Math.max(
			sheet.width / Math.max(1, box.width),
			sheet.height / Math.max(1, box.height),
		),
	);
	const xs = town.places.map((p) => p.x);
	const ys = town.places.map((p) => p.y);
	const minX = Math.min(...xs);
	const maxX = Math.max(...xs);
	const minY = Math.min(...ys);
	const maxY = Math.max(...ys);
	const point = (x: number, y: number) => ({
		x:
			sheet.left +
			((x - minX) / Math.max(1, maxX - minX)) *
				(sheet.width - sheet.left - sheet.right),
		y:
			sheet.top +
			((y - minY) / Math.max(1, maxY - minY)) *
				(sheet.height - sheet.top - sheet.bottom),
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
	const placeKey = town.places.map((p) => `${p.id}:${p.x}:${p.y}`).join("|");
	// Static paper features depend only on the sheet and the place layout.
	// biome-ignore lint/correctness/useExhaustiveDependencies: placeKey captures the place layout used by point().
	const scenery = useMemo(() => {
		const centres = town.places.map((p) => ({ id: p.id, ...point(p.x, p.y) }));
		const quay = centres.find((p) => p.id === "quay") ?? {
			x: sheet.left,
			y: sheet.height * 0.4,
		};
		const hub = centres.find((p) => p.id === "hall");
		const W = sheet.width;
		const H = sheet.height;
		// The river comes in from the top-left and leaves past the quay.
		const bank: [number, number][] = [
			[-10, H * 0.12],
			[quay.x * 0.45, H * 0.2],
			[quay.x * 0.55, quay.y - 70],
			[quay.x - 58, quay.y - 20],
			[quay.x - 72, quay.y + 40],
			[quay.x * 0.35, quay.y + 110],
			[-10, quay.y + 150],
		];
		const river = inkShape("river", [...bank, [-10, H * 0.12]], 3, 30);
		const riverEdge = inkLine("river-edge", bank, 2.5, 22);
		const flood = inkLine(
			"flood-line",
			bank.map(([x, y], i) => [
				x + (i === 0 || i === bank.length - 1 ? 0 : 38),
				y + (i === 0 ? -14 : i === bank.length - 1 ? 22 : 0),
			]),
			3,
			14,
		);
		const ripples = Array.from({ length: 7 }, (_, i) => {
			const y = H * 0.16 + i * ((quay.y + 110 - H * 0.16) / 7);
			const x = 10 + jitter("ripple", i) * 6;
			return inkLine(
				`ripple${i}`,
				[
					[x, y],
					[x + 14, y - 4],
					[x + 28, y],
				],
				1,
				8,
			);
		});
		const paths = hub
			? centres
					.filter((p) => p.id !== hub.id)
					.map((p) => ({
						id: p.id,
						d: inkLine(
							`path:${p.id}`,
							[
								[hub.x, hub.y + 30],
								[
									(hub.x + p.x) / 2 + jitter(p.id, "bend") * 30,
									(hub.y + p.y) / 2 + 20 + jitter(p.id, "lift") * 20,
								],
								[p.x, p.y + 30],
							],
							2,
							20,
						),
					}))
			: [];
		const next = seeded(`trees:${W}x${H}`);
		const trees: { id: string; x: number; y: number }[] = [];
		for (let i = 0; i < 80 && trees.length < 11; i++) {
			const x = 30 + next() * (W - 60);
			const y = 40 + next() * (H - 90);
			const clear =
				centres.every((c) => Math.hypot(c.x - x, c.y - y) > 130) &&
				trees.every((t) => Math.hypot(t.x - x, t.y - y) > 60) &&
				x > quay.x * 0.7 + 40;
			if (clear) trees.push({ id: `tree${i}`, x, y });
		}
		return { river, riverEdge, flood, ripples, paths, trees };
	}, [sheet, placeKey]);
	const cartLocation = town.handcart?.returned
		? (() => {
				const jo = town.people.find((person) => person.id === "jo");
				return jo ? personPoint(jo) : undefined;
			})()
		: (() => {
				const workshop = town.places.find((place) => place.id === "workshop");
				return workshop ? point(workshop.x, workshop.y) : undefined;
			})();

	// The player's own position, projected like any traveller's.
	const you = (() => {
		const player = town.player;
		if (!player?.active) return undefined;
		const job = player.job;
		if (job?.kind === "travel") {
			const from = town.places.find((p) => p.id === job.fromId);
			const to = town.places.find((p) => p.id === job.toId);
			if (!from || !to) return undefined;
			const a = point(from.x, from.y);
			const b = point(to.x, to.y);
			const f = Math.max(
				0,
				Math.min(
					1,
					(town.now - job.departedAt) /
						Math.max(1, job.arriveAt - job.departedAt),
				),
			);
			return {
				x: a.x + (b.x - a.x) * f,
				y: a.y + (b.y - a.y) * f,
				moving: true,
			};
		}
		const place = town.places.find((p) => p.id === player.placeId);
		return place ? { ...point(place.x, place.y), moving: false } : undefined;
	})();
	const youAt = you
		? youMarkerPlacement(you, you.moving, markerScale, sheet)
		: undefined;
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
	const clusters = knownPlaceClusters(knownPoints, box.width <= 600);
	const clusteredIds = new Set(
		clusters.flatMap((cluster) => cluster.people.map((person) => person.id)),
	);
	const visiblePoints = knownPoints.filter(
		(person) => !clusteredIds.has(person.id),
	);
	const repairs = Math.min(12, town.stats.hallRepairs ?? 0);
	// Place names (and a closed place's status line) as boxes resting markers step off.
	const labels: MarkerAvoid[] = town.places.flatMap((place) => {
		const p = point(place.x, place.y);
		const name = sheet.portrait ? shortPlaceName(place) : placeName(place);
		const boxes = [
			labelBox(
				p.x,
				p.y + (sheet.portrait ? 74 : 66),
				name,
				sheet.portrait ? 25 : 17,
			),
		];
		if (!place.open)
			boxes.push(
				labelBox(
					p.x,
					p.y + (sheet.portrait ? 100 : 86),
					placeStatus(repairs),
					sheet.portrait ? 25 : 19,
				),
			);
		if (needs.places[place.id])
			boxes.push(
				labelBox(
					p.x,
					p.y + (sheet.portrait ? 128 : 109),
					"Needs help",
					sheet.portrait ? 25 : 19,
				),
			);
		return boxes;
	});
	const markers = layoutKnownMarkers(visiblePoints, markerScale, sheet, labels);
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
		<div ref={frame} className="map-frame">
			<svg
				ref={map}
				className={`town-map ${sheet.portrait ? "portrait" : "landscape"}`}
				viewBox={`0 0 ${sheet.width} ${sheet.height}`}
				preserveAspectRatio="xMidYMid meet"
				role="img"
				aria-labelledby="map-title map-description"
			>
				<title id="map-title">Alder Quay town map</title>
				<desc id="map-description">
					A hand-drawn map of live residents at their actual locations. Select a
					named neighbour to see their activity and decisions. Small ink dots
					show background residents, offset within their current location for
					visibility. Travel is projected between places using actual departure
					and arrival times. Named neighbours at shared places use a count badge
					on narrow maps; select it for names. Larger maps use short leader
					lines to their actual place. Named markers use z for sleep, ! for
					incapacity or a mental break, and × for death. Your own position is a
					small diamond labelled you. Tally marks under the hall count finished
					repairs; a dashed line shows the old flood level. Needs help marks a
					known open need, not someone’s willingness to help. An unmarked
					neighbour may have needs you do not know.{" "}
					{town.people.filter((p) => p.lifeState === "dead").length} deaths
					recorded; {town.people.filter((p) => p.lifeState === "downed").length}{" "}
					people currently unable to act.
				</desc>
				<rect
					width={sheet.width}
					height={sheet.height}
					className="map-ground"
				/>
				<path d={scenery.river} className="river" />
				{scenery.ripples.map((d) => (
					<path key={d} d={d} className="ripple" />
				))}
				<Ink d={scenery.riverEdge} />
				<path d={scenery.flood} className="flood-line" />
				<text
					className="map-note river-label"
					transform={`translate(${sheet.portrait ? 26 : 34},${sheet.height * 0.13}) rotate(${sheet.portrait ? 62 : 28})`}
				>
					the Alder
				</text>
				{scenery.paths.map((path) => (
					<path key={path.id} d={path.d} className="footpath" />
				))}
				{scenery.trees.map((tree) => (
					<Tree key={tree.id} {...tree} />
				))}
				{town.places.map((place) => {
					const p = point(place.x, place.y);
					const hall = place.kind.includes("hall") || place.id.includes("hall");
					const tilt = jitter(place.id, "tilt") * 1.2;
					return (
						// biome-ignore lint/a11y/useSemanticElements: SVG groups cannot contain HTML buttons.
						<g
							key={place.id}
							data-map-place={place.id}
							role="button"
							tabIndex={0}
							aria-label={`Inspect ${placeName(place)}`}
							aria-pressed={selectedPlace === place.id}
							onClick={() => {
								setActivePlace("");
								selectPlace?.(place.id);
							}}
							onKeyDown={(event) => {
								if (event.key === "Enter" || event.key === " ") {
									event.preventDefault();
									setActivePlace("");
									selectPlace?.(place.id);
								}
							}}
							transform={`translate(${p.x},${p.y})`}
							className={`place ${place.open ? "" : "closed"} ${hall ? "hall" : ""}`}
						>
							<title>
								{`${placeName(place)}: ${place.description}. ${place.occupants} present. ${place.open ? "Open" : "Closed"}`}
							</title>
							<rect
								x={-90}
								y={-110}
								width={180}
								height={selectedPlace === place.id ? 255 : 245}
								rx={15}
								className={
									selectedPlace === place.id
										? "place-selection-outline"
										: "place-hit-area"
								}
							/>
							<g transform={`rotate(${tilt})`}>
								<PlaceDrawing place={place} repairs={repairs} />
							</g>
							<text
								y={sheet.portrait ? 74 : 66}
								textAnchor="middle"
								className="place-name desktop-place-name"
							>
								{placeName(place)}
							</text>
							<text
								y={sheet.portrait ? 74 : 66}
								textAnchor="middle"
								className="place-name mobile-place-name"
							>
								{shortPlaceName(place)}
							</text>
							{needs.places[place.id] && (
								<text
									y={sheet.portrait ? 128 : 109}
									textAnchor="middle"
									className="known-need-map"
								>
									<title>{needs.places[place.id]}</title>
									Needs help
								</text>
							)}
							{!place.open && (
								<text
									y={sheet.portrait ? 100 : 86}
									textAnchor="middle"
									className="map-note place-status"
								>
									{placeStatus(repairs)}
								</text>
							)}
						</g>
					);
				})}
				{youAt && (
					<g
						className="map-you"
						transform={`translate(${youAt.x},${youAt.y}) scale(${markerScale})`}
					>
						<title>You{you?.moving ? ", walking" : ""}</title>
						{/* A diamond, never a cross: × is the map's death marker. */}
						<path d="M0 -6 6 0 0 6 -6 0Z" className="you-mark" />
						<text x={0} y={-10} textAnchor="middle" className="you-label">
							you
						</text>
					</g>
				)}
				{town.people
					.filter((p) => !p.known)
					.map((person) => {
						const p = personPoint(person);
						if (!p) return null;
						const h = hash(person.id);
						const angle = (h % 6283) / 1000;
						const radius = person.journey
							? 5
							: sheet.portrait
								? 46 + (h % 7) * 7
								: 42 + (h % 5) * 6;
						return (
							<circle
								key={person.id}
								cx={p.x + Math.cos(angle) * radius}
								cy={p.y + Math.sin(angle) * radius * 0.8}
								r={sheet.portrait ? 2.8 : 2.6}
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

				{town.people
					.filter((p) => p.known)
					.map((person) => {
						const marker = markers.get(person.id);
						if (!marker) return null;
						const life = person.lifeState ?? "awake";
						const travelling = Boolean(person.journey && canAct(person));
						return (
							// biome-ignore lint/a11y/useSemanticElements: SVG groups cannot contain HTML buttons; equivalent native buttons follow the map.
							<g
								key={person.id}
								transform={`translate(${marker.x},${marker.y}) scale(${markerScale})`}
								className={`map-person life-${life} ${travelling ? "travelling" : ""} ${selected === person.id ? "selected" : ""}`}
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
								{(life === "downed" || life === "break") && (
									<path
										d={inkCircle(`${person.id}:blot`, 1, 2, 15, 0.2)}
										className="ink-blot"
									/>
								)}
								{selected === person.id && (
									<path
										d={inkCircle(`${person.id}:ring`, 0, 0, 19.5, 0.04)}
										className="selection-ring"
									/>
								)}
								{travelling && (
									<path d="M-22 -4h6M-21 4h5" className="motion-marks" />
								)}
								<path
									d={inkCircle(person.id, 0, 0, 14, 0.07)}
									className="person-head"
								/>
								<text textAnchor="middle" dy="5" className="person-initial">
									{initial(person.name)}
								</text>
								{lifeMarker(person) && (
									<text
										x="13"
										y="-10"
										textAnchor="middle"
										className="life-note"
									>
										{lifeMarker(person)}
									</text>
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
				{/* Counts stay clickable when a traveller departs from the same place. */}
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
							<circle r="22" className="person-hit" />
							<path
								d={inkCircle(`cluster:${cluster.placeId}`, 0, 0, 18, 0.05)}
								className="cluster-ring"
							/>
							<text textAnchor="middle" dy="6">
								{cluster.people.length}
							</text>
						</g>
					);
				})}
				<g
					transform={`translate(${sheet.width - 50} ${sheet.height - 54})`}
					className="compass"
				>
					<Ink
						d={inkLine("compass", [
							[0, 18],
							[0, -18],
						])}
					/>
					<Ink
						d={inkLine("compass-head", [
							[-6, -10],
							[0, -18],
							[6, -10],
						])}
					/>
					<text y="-26" textAnchor="middle" className="map-note">
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
		</div>
	);
}
