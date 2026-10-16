import type { PersonView, TownView } from "../contracts";
import { clock, datedClock } from "./format";

type Evening = NonNullable<TownView["evenings"]>[number];
type Invitation = NonNullable<PersonView["invitations"]>[number];
type BoardTown = Pick<TownView, "now" | "evenings"> & {
	people: Pick<PersonView, "id" | "name">[];
	places?: TownView["places"];
};
const stageLabel = (stage: string) =>
	({
		proposed: "Invitation posted",
		preparing: "Preparing the hall",
		prepared: "Hall prepared",
		closed: "Finished",
	})[stage] ?? stage;
const invitationLabel: Record<Invitation["status"], string> = {
	heard: "Invitation received",
	accepted: "Accepted",
	declined: "Declined",
	attended: "Attended",
	missed: "Did not attend",
};

function Notice({
	evening,
	town,
	select,
}: {
	evening: Evening;
	town: BoardTown;
	select: (id: string) => void;
}) {
	const host = town.people.find((person) => person.id === evening.organiserId);
	const guestPlaces = town.places?.find(
		(place) => place.id === "hall",
	)?.capacity;
	return (
		<article className="evening-notice">
			<div className="evening-heading">
				<span className="evening-icon" aria-hidden="true">
					<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
						{evening.kind === "class" ? (
							<path d="M12 5v15M12 5Q7 2 2 5v14q5-3 10 1q5-4 10-1V5q-5-3-10 0Z" />
						) : (
							<path d="M3 12h18q-1 9-9 9t-9-9ZM7 8q-2-2 0-5m5 5q-2-2 0-5m5 5q-2-2 0-5" />
						)}
					</svg>
				</span>
				<div>
					<h3>{evening.title}</h3>
					<p className="tiny muted">
						{datedClock(evening.startsAt)}–{clock(evening.endsAt)} ·{" "}
						{stageLabel(evening.stage)}
					</p>
				</div>
			</div>
			{evening.advertisementReceipt && (
				<p className="tiny muted">
					Advertised {datedClock(evening.advertisementReceipt.at)}
				</p>
			)}
			{evening.roomReservedBy ? (
				<p className="tiny">
					Hall booked by{" "}
					{town.people.find((p) => p.id === evening.roomReservedBy)?.name ??
						evening.roomReservedBy}{" "}
					for this hour.
				</p>
			) : town.now < evening.startsAt && evening.stage !== "closed" ? (
				<p className="tiny muted">
					Hall not booked. Advertising does not reserve it.
				</p>
			) : null}
			{host && (
				<button
					type="button"
					className="text-button"
					aria-label={`Follow host ${host.name}`}
					onClick={() => select(host.id)}
				>
					Host · {host.name} ↗
				</button>
			)}
			<details className="evening-record">
				<summary>Replies and attendance</summary>
				<p className="tiny">
					{evening.heard} heard · {evening.accepted} accepted
					{town.now < evening.startsAt
						? " · Has not started"
						: ` · ${evening.attended} received the ${evening.kind === "meal" ? "meal" : "lesson"}`}
				</p>
				{guestPlaces !== undefined && (
					<p className="tiny muted">
						Room for {Math.max(0, guestPlaces - 1)} guests and the host.
						Accepting an invitation does not reserve a place.
					</p>
				)}
				{evening.result && <p className="tiny">{evening.result}</p>}
				{evening.participantIds.length > 0 && (
					<section
						className="evening-participants"
						aria-label="Recorded participants"
					>
						{evening.participantIds.map((id) => {
							const person = town.people.find((person) => person.id === id);
							return (
								<button
									type="button"
									className="text-button"
									key={id}
									onClick={() => select(id)}
								>
									{person?.name ?? id} ↗
								</button>
							);
						})}
					</section>
				)}
			</details>
		</article>
	);
}

/** Public notices are host facts. They do not imply any person's receipt. */
export default function EveningBoard({
	town,
	select,
}: {
	town: BoardTown;
	select: (id: string) => void;
}) {
	const notices = (town.evenings ?? [])
		.filter((evening) => evening.stage !== "candidate")
		.toSorted((a, b) => a.startsAt - b.startsAt || a.id.localeCompare(b.id));
	if (!notices.length) return null;
	const next = notices.find(
		(evening) => evening.stage !== "closed" && evening.endsAt > town.now,
	);
	const others = notices.filter((evening) => evening.id !== next?.id);
	return (
		<section className="evening-board" aria-label="Hall noticeboard">
			<span className="eyebrow">Hall noticeboard</span>
			{next ? (
				<Notice evening={next} town={town} select={select} />
			) : (
				<p className="tiny muted">No upcoming hall notices.</p>
			)}
			{others.length > 0 && (
				<details className="evening-archive">
					<summary>Other hall notices · {others.length}</summary>
					{others.map((evening) => (
						<Notice
							key={evening.id}
							evening={evening}
							town={town}
							select={select}
						/>
					))}
				</details>
			)}
		</section>
	);
}

/** Render only explicit receipts and replies provided for this person. */
export function PersonInvitations({
	person,
	town,
}: {
	person: Pick<PersonView, "invitations">;
	town: Pick<TownView, "now" | "evenings">;
}) {
	const invitations = (person.invitations ?? []).toSorted(
		(a, b) => a.startsAt - b.startsAt || a.eventId.localeCompare(b.eventId),
	);
	if (!invitations.length) return null;
	const next = invitations.find((invitation) => {
		const evening = town.evenings?.find(
			(event) => event.id === invitation.eventId,
		);
		return (
			(evening?.endsAt ?? invitation.startsAt) > town.now &&
			evening?.stage !== "closed" &&
			invitation.status !== "attended" &&
			invitation.status !== "missed"
		);
	});
	const others = invitations.filter(
		(invitation) => invitation.eventId !== next?.eventId,
	);
	const receipt = (invitation: Invitation) => (
		<div className="invitation-receipt" key={invitation.eventId}>
			<p>{invitation.title}</p>
			<span className="tiny muted">
				{datedClock(invitation.startsAt)} · {invitationLabel[invitation.status]}
			</span>
		</div>
	);
	return (
		<section
			className="person-invitations"
			aria-label="Received hall invitations"
		>
			{next && (
				<>
					<span className="eyebrow">Hall invitation</span>
					{receipt(next)}
				</>
			)}
			{others.length > 0 && (
				<details>
					<summary>Other received invitations · {others.length}</summary>
					{others.map(receipt)}
				</details>
			)}
		</section>
	);
}
