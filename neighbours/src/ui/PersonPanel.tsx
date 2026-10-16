import { useEffect, useRef } from "react";
import type { PersonView, TownView } from "../contracts";
import { PersonInvitations } from "./EveningBoard";
import { clock, datedClock, initial, number, placeName } from "./format";
import type { ObservedFeed } from "./observations";
import PersonLessons from "./PersonLessons";
import PersonPromises from "./PersonPromises";
import PersonPurposes from "./PersonPurposes";
import { activityLabel, canAct } from "./person-status";

export default function PersonPanel({
	person,
	town,
	close,
	observed,
}: {
	person: PersonView;
	town: TownView;
	close: () => void;
	observed: ObservedFeed | undefined;
}) {
	const panel = useRef<HTMLElement>(null);
	useEffect(() => {
		if (person.id && window.matchMedia("(max-width: 760px)").matches) {
			panel.current?.scrollIntoView({
				block: "start",
				behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
					? "instant"
					: "smooth",
			});
		}
	}, [person.id]);
	const place = town.places.find((p) => p.id === person.placeId);
	const destination = town.places.find((p) => p.id === person.journey?.toId);

	const history = [
		...new Map(
			[
				...person.history,
				...(observed?.events.filter((event) => event.actorId === person.id) ??
					[]),
			].map((event) => [event.id, event]),
		).values(),
	]
		.sort((a, b) => b.at - a.at || b.id - a.id)
		.slice(0, 12);
	return (
		<aside
			ref={panel}
			className="person-panel"
			aria-label={`${person.name}'s details`}
		>
			<button
				type="button"
				className="close-panel"
				onClick={close}
				aria-label="Close person details"
			>
				×
			</button>
			<div className="eyebrow">A neighbour · {person.policy.toUpperCase()}</div>
			<div className="person-heading">
				<span
					className={`avatar life-${person.lifeState ?? "awake"}`}
					style={{ background: person.color }}
				>
					{initial(person.name)}
				</span>
				<div>
					<h2 tabIndex={-1}>{person.name}</h2>
					<p>{person.role}</p>
				</div>
			</div>
			<p className="description">{person.description}</p>
			<div className="activity-card">
				<span className="eyebrow">
					Right now ·{" "}
					{person.journey && canAct(person)
						? "In transit"
						: place
							? placeName(place)
							: person.placeId}
				</span>
				<h3 aria-live="polite">{activityLabel(person)}</h3>
				{person.journey && canAct(person) && (
					<p>
						On the way to{" "}
						{destination ? placeName(destination) : person.journey.toId}
					</p>
				)}
				{(canAct(person) || person.lifeState === "asleep") &&
					person.until > town.now && (
						<p className="muted">Until {clock(person.until)}</p>
					)}
			</div>
			{person.lifeEvent && (
				<p className="life-event">
					<span className="eyebrow">
						Last condition change · {datedClock(person.lifeEvent.at)}
					</span>
					<br />
					{person.lifeEvent.text}
				</p>
			)}
			{person.inspection && (
				<section className="inspection-card" aria-label="Last timber decision">
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
								No acquired method matched this decision.
							</p>
						)}
					</details>
				</section>
			)}
			<PersonPromises person={person} now={town.now} />
			<PersonInvitations person={person} town={town} />
			{person.decision && (
				<details className="reason">
					<summary>
						Why this choice
						{person.decision.decidedAt === undefined
							? ""
							: ` · ${datedClock(person.decision.decidedAt)}`}
					</summary>
					<p>{person.decision.reason}</p>
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
									{e.text}
								</p>
							))}
						{!person.observations.length && (
							<p>No observations received yet.</p>
						)}
					</div>
				</details>
			)}
			<details>
				<summary>
					History <span>{history.length}</span>
				</summary>
				<div className="received">
					{history.map((e) => (
						<p key={e.id}>
							<time>{datedClock(e.at)}</time> {e.text}
						</p>
					))}
					{!history.length && <p>No recorded history yet.</p>}
				</div>
			</details>
			<details>
				<summary>
					Relationships <span>{person.relationships.length}</span>
				</summary>
				{person.relationships.map((r) => (
					<div className="relationship" key={r.id}>
						<strong>{r.name}</strong>
						<p>{r.summary}</p>
						{r.origin && (
							<p className="tiny muted">
								{r.origin === "initial"
									? "Initial relationship in this town’s starting state."
									: "Relationship recorded through an encounter."}
							</p>
						)}
						<span className="muted tiny">Current trust {number(r.trust)}</span>
					</div>
				))}
			</details>
			<details>
				<summary>Need urgency & decision evidence</summary>
				{person.paidWork && (
					<div className="resource">
						<span>Paid shifts started today</span>
						<strong>{person.paidWork.starts}/2</strong>
					</div>
				)}
				{person.paidWork && (
					<p className="tiny muted">Paid shifts run between 08:00 and 18:00.</p>
				)}
				{Object.entries(person.needs).map(([key, value]) => (
					<div className="resource" key={key}>
						<span>{key.replaceAll("_", " ")}</span>
						<strong>{(value * 100).toFixed(1)}%</strong>
					</div>
				))}
				{person.decision?.options.map((option) => (
					<div className="resource" key={option.id}>
						<span>{option.label}</span>
						<strong>{option.utility.toFixed(3)}</strong>
					</div>
				))}
			</details>
		</aside>
	);
}
