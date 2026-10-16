import type { Intervention, TownView } from "../contracts";
import { datedClock } from "./format";

export default function HallChoices({
	town,
	disabled,
	onAction,
	onCompare,
	expanded,
	onExpandedChange,
}: {
	town: TownView;
	disabled: boolean;
	onAction: (input: Intervention) => void;
	onCompare?: (input: Intervention) => void;
	expanded?: boolean;
	onExpandedChange?: (open: boolean) => void;
}) {
	const opportunities = (town.evenings ?? [])
		.filter((e) => e.recurring && e.endsAt > town.now && e.stage !== "closed")
		.toSorted((a, b) => a.startsAt - b.startsAt)
		.slice(0, 2);
	const schedule = town.eveningSchedule;
	const supportRemaining = Math.max(
		0,
		...opportunities.map((e) => e.supportRemaining ?? 0),
	);
	if (!opportunities.length && !schedule) return null;
	const shared =
		opportunities.length === 2 &&
		opportunities[0]?.startsAt === opportunities[1]?.startsAt;
	return (
		<details
			className="hall-choices"
			open={expanded}
			onToggle={(event) => onExpandedChange?.(event.currentTarget.open)}
		>
			<summary>
				Hall choices
				{opportunities[0] ? ` · ${datedClock(opportunities[0].startsAt)}` : ""}
			</summary>
			<p className="tiny">
				{opportunities.length === 0
					? "No current hall choices."
					: shared
						? "One room, two possible evenings. Only one can use this hour."
						: "The evenings have separate hours."}
			</p>
			{schedule && (
				<p className="tiny muted">
					Hall programme · {schedule.cyclesCompleted} of {schedule.cyclesLimit}{" "}
					weeks finished · {schedule.weeklyDeliveredMeals} meals received ·{" "}
					{schedule.weeklyDeliveredClasses} lessons received.
					{!opportunities.length && schedule.nextStartsAt !== undefined
						? ` Next opportunity: ${datedClock(schedule.nextStartsAt)}.`
						: ""}
				</p>
			)}
			{opportunities.map((evening) => {
				const name =
					town.people.find((p) => p.id === evening.organiserId)?.name ??
					evening.organiserId;
				return (
					<div className="hall-choice" key={evening.id}>
						<strong>{evening.title}</strong>
						<p className="tiny muted">
							{datedClock(evening.startsAt)} ·{" "}
							{evening.stage === "candidate"
								? "No invitation posted"
								: evening.stage === "prepared"
									? "Room prepared"
									: evening.stage === "preparing"
										? "Preparing the room"
										: "Invitation posted"}
						</p>
						{evening.canOpenSlot && (
							<button
								type="button"
								disabled={
									disabled ||
									!(town.controlsRemaining + (evening.supportRemaining ?? 0))
								}
								onClick={() =>
									onAction({ kind: "open-evening-slot", eventId: evening.id })
								}
							>
								Fund another slot for {name} ·{" "}
								{evening.supportRemaining ? "1 weekly choice" : "1 town credit"}
							</button>
						)}
						{evening.canOpenSlot && onCompare && (
							<button
								type="button"
								className="text-button"
								disabled={
									disabled ||
									!(town.controlsRemaining + (evening.supportRemaining ?? 0))
								}
								onClick={() =>
									onCompare({ kind: "open-evening-slot", eventId: evening.id })
								}
							>
								Compare a week with {name}’s extra slot ↗
							</button>
						)}
						{evening.canAdvertise && (
							<button
								type="button"
								disabled={
									disabled ||
									!(town.controlsRemaining + (evening.supportRemaining ?? 0))
								}
								onClick={() =>
									onAction({ kind: "advertise-evening", eventId: evening.id })
								}
							>
								Advertise {name}’s invitation ·{" "}
								{evening.supportRemaining ? "1 weekly choice" : "1 town credit"}
							</button>
						)}
						{evening.canAdvertise && onCompare && (
							<button
								type="button"
								className="text-button"
								disabled={
									disabled ||
									!(town.controlsRemaining + (evening.supportRemaining ?? 0))
								}
								onClick={() =>
									onCompare({ kind: "advertise-evening", eventId: evening.id })
								}
							>
								Compare a week with {name}’s advertisement ↗
							</button>
						)}
						{evening.originalStartsAt !== undefined && (
							<p className="tiny muted">
								An extra slot was funded. The invitation remains {name}’s
								choice.
							</p>
						)}
						{evening.advertised && (
							<p className="tiny muted">This invitation was advertised.</p>
						)}
					</div>
				);
			})}
			{opportunities.length > 0 && (
				<>
					<p className="tiny muted">
						{supportRemaining
							? "1 weekly choice available"
							: "No weekly choice available"}
						{` · ${town.controlsRemaining} town credits left.`} Fund a slot or
						advertise. Further changes cost a town credit.
					</p>
					<p className="tiny muted">
						Funding moves an unposted opportunity to the next day. Advertising
						informs awake neighbours; it does not make anyone attend.
					</p>
				</>
			)}
		</details>
	);
}
