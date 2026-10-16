import type { TownView } from "../contracts";
import { datedClock } from "./format";

/** One actual shared milestone. It does not predict a resident's decision. */
export default function TownGoal({
	town,
	help,
}: {
	town: TownView;
	help: () => void;
}) {
	const hall = town.places.find((place) => place.id === "hall");
	const repairs = Math.min(12, town.stats.hallRepairs ?? 0);
	const next = town.evenings
		?.filter(
			(event) =>
				event.endsAt > town.now &&
				["proposed", "preparing", "prepared"].includes(event.stage),
		)
		.toSorted((a, b) => a.startsAt - b.startsAt)[0];
	return (
		<section className="town-goal" aria-label="Shared goal">
			<div className="town-goal-copy">
				<strong>
					{hall?.open
						? (next?.title ?? "The hall is open")
						: repairs >= 12
							? "Ready for inspection"
							: "Reopen the hall"}
				</strong>
				{hall?.open ? (
					<span>
						{next
							? `${datedClock(next.startsAt)} · ${next.stage === "prepared" ? "Room prepared" : "Not yet prepared"}`
							: `${hall.capacity} places for classes and supper`}
					</span>
				) : (
					<>
						<progress max={12} value={repairs} aria-label="Hall repairs" />
						<span>
							{repairs}/12 repairs
							{repairs >= 12
								? " · An inspection must finish before opening"
								: " · Inspection follows the repairs"}
						</span>
					</>
				)}
			</div>
			<button type="button" className="text-button" onClick={help}>
				{hall?.open ? "Hall choices" : "Ways to help"}
				<span aria-hidden="true"> →</span>
			</button>
		</section>
	);
}
