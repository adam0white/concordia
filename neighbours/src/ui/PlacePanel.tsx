import type { PlaceView, TownView } from "../contracts";
import { clock, placeName } from "./format";
import { knownOpenNeeds } from "./known-needs";
import { activityLabel } from "./person-status";

export default function PlacePanel({
	town,
	place,
	busy,
	move,
	select,
	close,
}: {
	town: TownView;
	place: PlaceView;
	busy?: boolean;
	move: (id: string) => void;
	select: (id: string, talk?: boolean) => void;
	close: () => void;
}) {
	const player = town.player;
	const destination = player?.destinations.find((p) => p.id === place.id);
	const label = placeName(place);
	const company = town.people.filter(
		(p) =>
			p.known && p.placeId === place.id && !p.journey && p.lifeState !== "dead",
	);
	const need = knownOpenNeeds(town).places[place.id];
	const location = (id: string) => {
		const p = town.places.find((p) => p.id === id);
		return p ? placeName(p) : id;
	};
	return (
		<section className="place-panel" aria-labelledby="selected-place-name">
			<div className="drawer-heading">
				<h2 id="selected-place-name" tabIndex={-1}>
					{label}
				</h2>
				<button
					type="button"
					className="drawer-close"
					aria-label="Close place details"
					onClick={close}
				>
					×
				</button>
			</div>
			{player && (
				<div className="place-response">
					{destination && (
						<button
							type="button"
							className="place-walk"
							disabled={!player.canMove || busy}
							onClick={() => move(place.id)}
						>
							Walk to {label} · ~{destination.minutes} min
						</button>
					)}
					<p role="status">
						{player.job?.kind === "travel"
							? `Walking to ${location(player.job.toId)}, arriving about ${clock(player.job.arriveAt)}.`
							: player.job?.kind === "work"
								? `Working at ${location(player.job.toId)} until ${clock(player.job.endsAt)}.`
								: player.placeId === place.id
									? "You are here."
									: `You are at ${location(player.placeId ?? "")}.`}
					</p>
					{!player.canMove && (
						<p>
							{player.job?.kind === "travel"
								? "Your walk must end before you can walk somewhere else."
								: player.job?.kind === "work"
									? "Your work must end before you can walk somewhere else."
									: "You cannot walk right now."}
						</p>
					)}
					{busy && (
						<p>The town is finishing another action. Wait for it to finish.</p>
					)}
				</div>
			)}
			{need && <p className="place-known-need">{need}</p>}
			<h3>Who is around</h3>
			{company.length ? (
				<ul className="place-company">
					{company.map((p) => (
						<li key={p.id}>
							<button
								type="button"
								onClick={() =>
									select(
										p.id,
										!!player?.present.some((person) => person.id === p.id),
									)
								}
							>
								{player?.present.some((person) => person.id === p.id)
									? "Talk to"
									: "Meet"}{" "}
								{p.name} · {activityLabel(p)}
							</button>
						</li>
					))}
				</ul>
			) : (
				<p>No familiar neighbours here now.</p>
			)}
			<p className="description">{place.description}</p>
		</section>
	);
}
