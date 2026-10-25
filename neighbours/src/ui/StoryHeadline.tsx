import { datedClock } from "./format";
import type { StoryGroup } from "./observations";

export const storyAnchor = (id: string) => `retained-story-${id}`;
export default function StoryHeadline({
	story,
	open,
	watch,
}: {
	story?: StoryGroup;
	watch?: {
		enabled: boolean;
		setEnabled: (enabled: boolean) => void;
		paused: boolean;
	};
	open: (id: string) => void;
}) {
	if (!story) return null;
	const invitationDate =
		story.kind === "evening-proposed"
			? story.summaries
					.map((text) => text.match(/\bon (Day \d+ at \d{2}:\d{2})\./)?.[1])
					.find(Boolean)
			: undefined;
	return (
		<div className="story-watch">
			<button
				type="button"
				className="story-headline"
				onClick={() => open(story.id)}
				aria-label={`Read story: ${story.title.replace(/\.+$/, "")}${invitationDate ? `. ${invitationDate}` : ""}${story.at === undefined ? "" : `. Posted ${datedClock(story.at)}`}`}
			>
				<span className="eyebrow">
					{story.at === undefined ? "Recorded story" : datedClock(story.at)}
				</span>
				<span>
					{story.title} <span aria-hidden="true">↗</span>
					{invitationDate && (
						<span className="tiny muted"> · {invitationDate}</span>
					)}
				</span>
			</button>
			{watch && (
				<label className="story-watch-toggle">
					<input
						type="checkbox"
						checked={watch.enabled}
						onChange={(event) => watch.setEnabled(event.target.checked)}
					/>
					Pause on new stories
				</label>
			)}
			{watch?.paused && (
				<span className="story-watch-status tiny" role="status">
					Paused for a new story
				</span>
			)}
		</div>
	);
}
