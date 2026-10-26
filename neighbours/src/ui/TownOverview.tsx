import type { ReactNode } from "react";
import type { TownView } from "../contracts";
import { initial } from "./format";
import { knownOpenNeeds } from "./known-needs";
import { InkPortrait } from "./Notebook";
import { activityLabel } from "./person-status";
import TownMap from "./TownMap";

/** The map scene. Overlays are margin notes on the page, never extra panels. */
export default function TownOverview({
	town,
	selected,
	select,
	selectedPlace,
	selectPlace,
	notes,
}: {
	town: TownView;
	selected: string;
	select: (id: string) => void;
	selectedPlace?: string;
	selectPlace?: (id: string) => void;
	notes?: ReactNode;
}) {
	return (
		<section className="map-section" aria-label="Town overview">
			<h2 className="sr-only">Mill Bridge</h2>
			<TownMap
				town={town}
				selected={selected}
				select={select}
				selectedPlace={selectedPlace}
				selectPlace={selectPlace}
			/>
			{notes}
		</section>
	);
}

/**
 * Familiar neighbours as a thumb-reachable row of inked names. A chip only opens
 * (or returns focus to) that neighbour's panel; it never closes it. The panel's own
 * close button closes it.
 */
export function NeighbourStrip({
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
	/** Unused: chips no longer toggle the panel closed. Kept so callers still compile. */
	close?: () => void;
}) {
	const needs = knownOpenNeeds(town);
	return (
		<nav className="neighbour-strip" aria-label="Familiar neighbours">
			{
				<button
					type="button"
					className="known-place-need"
					title={needs.places.hall}
					aria-label={
						needs.places.hall
							? "Inspect Flooded hall · Needs help"
							: "Inspect Hall"
					}
					aria-pressed={selectedPlace === "hall"}
					onClick={() => selectPlace?.("hall")}
				>
					<strong>Hall</strong>
					<span className="known-need-cue" aria-hidden="true">
						{needs.places.hall ? "•" : ""}
					</span>
				</button>
			}
			{town.people
				.filter((resident) => resident.known)
				.map((resident) => (
					<button
						type="button"
						key={resident.id}
						className={`neighbour life-${resident.lifeState ?? "awake"} ${selected === resident.id ? "active" : ""}`}
						data-person-id={resident.id}
						aria-label={`${resident.name} · ${activityLabel(resident)}`}
						aria-pressed={selected === resident.id}
						onClick={() => select(resident.id)}
					>
						<InkPortrait
							id={resident.id}
							label={initial(resident.name)}
							className="mini-avatar"
						/>
						<strong>{resident.name.split(" ")[0]}</strong>
					</button>
				))}
		</nav>
	);
}
