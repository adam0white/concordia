import type { Intervention, TownView } from "../contracts";
import { hallOpportunities } from "../hall-choice.ts";
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
	const opportunities = hallOpportunities(town);
	const schedule = town.eveningSchedule;
	const recurring = opportunities.some((e) => e.recurring);
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
					? "No evening support actions are available now."
					: shared
						? "Two events need the same room. Only one can use this hour."
						: "The evening events are at different times."}
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
								Fund another time for {name} ·{" "}
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
								Compare a week with {name}’s extra time ↗
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
								Another time was funded. {name} still decides whether to invite
								people.
							</p>
						)}
						{evening.advertised && (
							<p className="tiny muted">This invitation was advertised.</p>
						)}
					</div>
				);
			})}
			{opportunities.length > 0 && recurring && (
				<>
					<p className="tiny muted">
						{supportRemaining
							? "1 weekly choice available"
							: "No weekly choice available"}
						{` · ${town.controlsRemaining} town credits left.`} Fund another
						time or advertise the event. Further changes cost a town credit.
					</p>
					<p className="tiny muted">
						Funding moves an event to the next day if its invitation has not
						been posted. Advertising tells awake neighbours about it. Each
						person decides whether to attend.
					</p>
				</>
			)}
			{opportunities.length > 0 && !recurring && (
				<>
					<p className="tiny muted">
						{town.controlsRemaining} town credits left. Advertising costs 1 town
						credit.
					</p>
					<p className="tiny muted">
						Advertising informs awake neighbours; it does not make anyone
						attend.
					</p>
				</>
			)}
		</details>
	);
}
