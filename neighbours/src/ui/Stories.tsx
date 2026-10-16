import type { TownView } from "../contracts";
import { datedClock } from "./format";
import type { StoryGroup } from "./observations";
import { storyAnchor } from "./StoryHeadline";

function StoryCard({
	s,
	town,
	select,
}: {
	s: StoryGroup;
	town: TownView;
	select: (id: string) => void;
}) {
	return (
		<article className="event" id={storyAnchor(s.id)} tabIndex={-1}>
			<span className="eyebrow">
				{s.at === undefined
					? s.kind
					: `${datedClock(s.at)} · ${s.kind.replaceAll("-", " ")}`}
			</span>
			{s.actorIds.length > 0 && (
				<p className="story-people tiny muted">
					{s.actorIds.length === 1 ? "Recorded actor: " : "Recorded people: "}
					{s.actorIds
						.map((id) => town.people.find((person) => person.id === id)?.name)
						.filter(Boolean)
						.join(", ")}
				</p>
			)}
			{s.participantIds.length > 0 && (
				<p className="story-people tiny muted">
					Recorded participants:{" "}
					{s.participantIds
						.map((id) => town.people.find((person) => person.id === id)?.name)
						.filter(Boolean)
						.join(", ")}
				</p>
			)}
			<h3>{s.title}</h3>
			<div className="story-links">
				{[...new Set([...s.actorIds, ...s.participantIds])].map((id) => {
					const person = town.people.find((person) => person.id === id);
					return person ? (
						<button
							type="button"
							className="text-button"
							key={id}
							onClick={() => select(id)}
						>
							Follow {person.name} ↗
						</button>
					) : null;
				})}
			</div>
			<p>
				{s.summaries.length === 1
					? s.summaries[0]
					: `${s.summaries.length} recorded outcomes from the same class.`}
			</p>
			{s.summaries.length > 1 && (
				<details>
					<summary>Recorded outcomes</summary>
					{s.summaries.map((summary) => (
						<p key={summary}>{summary}</p>
					))}
				</details>
			)}
			<details className="story-sources">
				<summary>Sources · {s.eventIds.length} linked events</summary>
				<p className="tiny muted">
					{s.missingEventIds.length
						? `${s.missingEventIds.length} older event details pruned from the current packet.`
						: "Linked event details remain in the current packet."}
				</p>
			</details>
		</article>
	);
}
export default function Stories({
	stories,
	town,
	select,
}: {
	stories: StoryGroup[];
	town: TownView;
	select: (id: string) => void;
}) {
	return (
		<>
			{stories.slice(0, 6).map((s) => (
				<StoryCard key={s.id} s={s} town={town} select={select} />
			))}
			{stories.length > 6 && (
				<details className="story-archive">
					<summary>Older stories · {stories.length - 6}</summary>
					<div className="event-grid">
						{stories.slice(6).map((s) => (
							<StoryCard key={s.id} s={s} town={town} select={select} />
						))}
					</div>
				</details>
			)}
		</>
	);
}
