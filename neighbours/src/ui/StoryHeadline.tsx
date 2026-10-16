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
	return (
		<div className="story-watch">
			<button
				type="button"
				className="story-headline"
				onClick={() => open(story.id)}
				aria-label={`Read story: ${story.title}${story.at === undefined ? "" : `. ${datedClock(story.at)}`}`}
			>
				<span className="eyebrow">
					{story.at === undefined ? "Recorded story" : datedClock(story.at)}
				</span>
				<span>
					{story.title} <span aria-hidden="true">↗</span>
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
