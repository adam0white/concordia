import type { ReactNode } from "react";
import type { PersonView, TownView } from "../contracts";
import { PersonInvitations } from "./EveningBoard";
import { clock, datedClock, initial, number, placeName } from "./format";
import { InkPortrait } from "./Notebook";
import type { ObservedFeed } from "./observations";
import PersonLessons from "./PersonLessons";
import PersonPromises from "./PersonPromises";
import PersonPurposes from "./PersonPurposes";
import { eventDetail, personHistory } from "./person-history";
import {
	activityLabel,
	canAct,
	needWords,
	trustWords,
	urgencyWord,
} from "./person-status";
import { personRead, plainText } from "./plain-english";

export default function PersonPanel({
	person,
	town,
	close,
	observed,
	speak,
	playerAction,
}: {
	person: PersonView;
	town: TownView;
	close: () => void;
	observed: ObservedFeed | undefined;
	/** Slot for the player's voice (SpeakPanel), shown under "Right now". */
	speak?: ReactNode;
	playerAction?: ReactNode;
}) {
	const place = town.places.find((p) => p.id === person.placeId);
	const destination = town.places.find((p) => p.id === person.journey?.toId);

	const history = personHistory(person, town, observed);
	return (
		<aside className="person-panel" aria-label={`${person.name}'s details`}>
			<button
				type="button"
				className="close-panel"
				onClick={close}
				aria-label="Close person details"
			>
				×
			</button>
			<div className="eyebrow">A neighbour</div>
			<div className="person-heading">
				<InkPortrait
					id={person.id}
					label={initial(person.name)}
					className={`avatar life-${person.lifeState ?? "awake"}`}
				/>
				<div>
					<h2 tabIndex={-1}>{person.name}</h2>
				</div>
			</div>
			{playerAction}
			{speak}
			<p className="resident-role">{person.role}</p>
			<div className="activity-card">
				<span className="eyebrow">
					Right now ·{" "}
					{person.journey && canAct(person)
						? "Travelling"
						: place
							? placeName(place)
							: person.placeId}
				</span>
				<h3 aria-live="polite">{activityLabel(person)}</h3>
				{person.journey && canAct(person) && (
					<p>
						Travelling to{" "}
						{destination ? placeName(destination) : person.journey.toId}
					</p>
				)}
				{(canAct(person) || person.lifeState === "asleep") &&
					person.until > town.now && (
						<p className="muted">Until {clock(person.until)}</p>
					)}
			</div>
			{canAct(person) && (
				<p className="seems">
					{personRead(person.name, person.read ?? needWords(person.needs))}
				</p>
			)}
			<p className="description">{plainText(person.description)}</p>
			{person.lifeEvent && (
				<p className="life-event">
					<span className="eyebrow">
						Last condition change · {datedClock(person.lifeEvent.at)}
					</span>
					<br />
					{plainText(person.lifeEvent.text)}
				</p>
			)}
			<PersonPromises person={person} now={town.now} mode="current" />
			<details className="person-evidence">
				<summary>Reasons and records ▸</summary>
				<p className="tiny muted">Controller · {person.policy.toUpperCase()}</p>
				{person.inspection && (
					<section
						className="inspection-card"
						aria-label="Last timber decision"
					>
						<span className="eyebrow">
							Last timber decision · {datedClock(person.inspection.at)}
						</span>
						<h3>{person.inspection.result.replaceAll("-", " ")}</h3>
						<details>
							<summary>Decision evidence</summary>
							<p>
								Observed timber: {person.inspection.observations.moisture}.
								Support: {person.inspection.observations.support}.
							</p>
							<p>Chose to {person.inspection.action.replaceAll("-", " ")}.</p>
							<p className="tiny muted">{person.inspection.source}</p>
							{person.inspection.methodTerms.length ? (
								person.inspection.methodTerms.map((term) => (
									<p className="tiny" key={term.source}>
										{term.source}: {number(term.value)}
									</p>
								))
							) : (
								<p className="tiny muted">
									No learned method matched this decision.
								</p>
							)}
						</details>
					</section>
				)}
				<PersonPromises person={person} now={town.now} mode="history" />
				<PersonInvitations person={person} town={town} />
				{person.decision && (
					<details className="reason">
						<summary>
							Why this choice
							{person.decision.decidedAt === undefined
								? ""
								: ` · ${datedClock(person.decision.decidedAt)}`}
						</summary>
						<p>{plainText(person.decision.reason)}</p>
						<span className="muted tiny">{person.decision.source}</span>
					</details>
				)}
				<PersonPurposes person={person} />
				<PersonLessons person={person} town={town} />
				{person.observations && (
					<details>
						<summary>
							Received observations <span>{person.observations.length}</span>
						</summary>
						<div className="received">
							{person.observations
								.slice(-8)
								.reverse()
								.map((e) => (
									<p key={e.id}>
										<time>
											Day {Math.floor(e.at / 1440) + 1} · {clock(e.at)}
										</time>{" "}
										{plainText(e.text)}
									</p>
								))}
							{!person.observations.length && (
								<p>They have not received any observations yet.</p>
							)}
						</div>
					</details>
				)}
				<details>
					<summary>
						History <span>{history.meaningful.length}</span>
					</summary>
					<div className="received">
						{history.meaningful.slice(0, 12).map((e) => (
							<p key={e.key}>
								<time>{datedClock(e.at)}</time> {plainText(e.text)}
							</p>
						))}
						{!history.meaningful.length && (
							<p>No important outcomes have been recorded yet.</p>
						)}
						{history.meaningful.length > 12 && (
							<details>
								<summary>
									Earlier outcomes · {history.meaningful.length - 12}
								</summary>
								{history.meaningful.slice(12).map((e) => (
									<p key={e.key}>
										<time>{datedClock(e.at)}</time> {plainText(e.text)}
									</p>
								))}
							</details>
						)}
						{history.routine.length > 0 && (
							<details>
								<summary>Routine activity · {history.routine.length}</summary>
								{history.routine.map((e) => (
									<p key={e.id}>
										<time>{datedClock(e.at)}</time> {plainText(e.text)}
									</p>
								))}
							</details>
						)}
						<details>
							<summary>Recorded event details · {history.raw.length}</summary>
							{history.raw.map((e) => (
								<p key={e.id}>
									<time>{datedClock(e.at)}</time> {plainText(e.text)}
									<br />
									<span className="tiny muted">{eventDetail(e)}</span>
								</p>
							))}
						</details>
					</div>
				</details>
				<details>
					<summary>
						Relationships <span>{person.relationships.length}</span>
					</summary>
					{person.relationships.map((r) => (
						<div className="relationship" key={r.id}>
							<strong>{r.name}</strong>
							<p>{plainText(r.summary)}</p>
							{r.origin && (
								<p className="tiny muted">
									{r.origin === "initial"
										? "They already knew each other when this town began."
										: "They met during this town’s history."}
								</p>
							)}
							<span className="muted tiny">{trustWords(r.trust)}</span>
						</div>
					))}
				</details>
				<details>
					<summary>How urgent each need feels · decision evidence</summary>
					{person.paidWork && (
						<div className="resource">
							<span>Paid shifts started today</span>
							<strong>{person.paidWork.starts}/2</strong>
						</div>
					)}
					{person.paidWork && (
						<p className="tiny muted">
							Paid shifts run between 08:00 and 18:00.
						</p>
					)}
					{Object.entries(person.needs).map(([key, value]) => (
						<div className="resource" key={key}>
							<span>{key.replaceAll("_", " ")}</span>
							<strong className="hand">{urgencyWord(value)}</strong>
						</div>
					))}
					{person.decision?.offeredCount !== undefined && (
						<p className="tiny muted">
							{person.decision.recordedCount} of {person.decision.offeredCount}{" "}
							scored options are shown.
						</p>
					)}
					{person.decision?.options.map((option) => (
						<div className="resource" key={option.id}>
							<span>{option.label}</span>
							<strong>{option.utility.toFixed(3)}</strong>
						</div>
					))}
				</details>
			</details>
		</aside>
	);
}
