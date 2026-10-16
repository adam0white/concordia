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
