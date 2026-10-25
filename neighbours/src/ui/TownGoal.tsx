import type { TownView } from "../contracts";
import { datedClock } from "./format";
import { inkLine, jitter } from "./ink";

/** Twelve hand-drawn tally marks; a physical repair count, not an inner state. */
export function RepairTally({ repairs }: { repairs: number }) {
	return (
		<svg
			className="repair-tally"
			viewBox="0 0 96 22"
			role="progressbar"
			aria-label="Hall repairs"
			aria-valuemin={0}
			aria-valuemax={12}
			aria-valuenow={repairs}
			aria-valuetext={`${repairs} of 12 repairs finished`}
		>
			{Array.from({ length: 12 }, (_, i) => i).map((i) => {
				const group = Math.floor(i / 5);
				const inGroup = i % 5;
				const x = 6 + group * 34 + inGroup * 6;
				const d =
					inGroup === 4
						? inkLine(`goal-tally${i}`, [
								[x - 27, 16],
								[x + 3, 6],
							])
						: inkLine(`goal-tally${i}`, [
								[x, 3],
								[x + jitter("goal", i) * 1.2, 19],
							]);
				return (
					<path
						key={i}
						d={d}
						className={i < repairs ? "tally done" : "tally pending"}
					/>
				);
			})}
		</svg>
	);
}

const repairWords = (repairs: number) =>
	repairs >= 12
		? "The repairs are finished. The hall must pass an inspection before it opens."
		: repairs >= 6
			? "At least half the repairs are done. An inspection comes next."
			: repairs > 0
				? "The repairs have begun. An inspection comes next."
				: "Nobody has started the repairs yet.";

/**
 * The margin note on the map. While the player has a current step, it names
 * that step first, worded by the runtime's goal sequence; the hall line sits
 * beneath it. It names actual milestones and never predicts a resident's
 * decision.
 */
export default function TownGoal({
	town,
	help,
	openJournal,
}: {
	town: TownView;
	help: () => void;
	openJournal: () => void;
}) {
	const step = town.player?.goals.find((goal) => goal.status === "current");
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
		<section className="town-goal margin-note" aria-label="Shared goal">
			{step && (
				<div className="your-step">
					<span className="eyebrow">Your next step</span>
					<button
						type="button"
						className="text-button step-title"
						onClick={openJournal}
					>
						<WithArrow
							text={
								step.id === "arrive" ? "Choose a place to walk" : step.title
							}
						/>
					</button>
					<span className="step-hint">{step.hint}</span>
				</div>
			)}
			<strong className="hand">
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
						: `The hall has ${hall.capacity} places for classes and supper.`}
				</span>
			) : (
				<>
					<RepairTally repairs={repairs} />
					<span className="repair-words">{repairWords(repairs)}</span>
				</>
			)}
			<button type="button" className="text-button town-help" onClick={help}>
				<WithArrow text={hall?.open ? "Hall choices" : "Ways to help"} />
			</button>
		</section>
	);
}

/** Keep the arrow on the line of the last word, so it never wraps alone. */
function WithArrow({ text }: { text: string }) {
	const cut = text.lastIndexOf(" ");
	return (
		<>
			{cut >= 0 ? text.slice(0, cut + 1) : ""}
			<span className="nowrap">
				{text.slice(cut + 1)}
				<span aria-hidden="true">{"\u00a0→"}</span>
			</span>
		</>
	);
}
