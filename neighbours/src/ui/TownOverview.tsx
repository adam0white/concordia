import type { ReactNode } from "react";
import type { TownView } from "../contracts";
import { initial } from "./format";
import { InkPortrait } from "./Notebook";
import { activityLabel } from "./person-status";
import TownMap from "./TownMap";

/** The map scene. Overlays are margin notes on the page, never extra panels. */
export default function TownOverview({
	town,
	selected,
	select,
	notes,
}: {
	town: TownView;
	selected: string;
	select: (id: string) => void;
	notes?: ReactNode;
}) {
	return (
		<section className="map-section" aria-label="Town overview">
			<h2 className="sr-only">Alder Quay</h2>
			<TownMap town={town} selected={selected} select={select} />
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
}: {
	town: TownView;
	selected: string;
	select: (id: string) => void;
	/** Unused: chips no longer toggle the panel closed. Kept so callers still compile. */
	close?: () => void;
}) {
	return (
		<nav className="neighbour-strip" aria-label="Familiar neighbours">
			{town.people
				.filter((resident) => resident.known)
				.map((resident) => (
					<button
						type="button"
						key={resident.id}
						className={`neighbour life-${resident.lifeState ?? "awake"} ${selected === resident.id ? "active" : ""}`}
						data-person-id={resident.id}
						aria-label={`${resident.name} · ${activityLabel(resident)}`}
						aria-current={selected === resident.id ? "true" : undefined}
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
