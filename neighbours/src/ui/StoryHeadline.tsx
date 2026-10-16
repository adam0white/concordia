import { datedClock } from "./format";
import type { StoryGroup } from "./observations";

export const storyAnchor = (id: string) => `retained-story-${id}`;
export default function StoryHeadline({
	story,
	open,
}: {
	story?: StoryGroup;
	open: (id: string) => void;
}) {
	if (!story) return null;
	return (
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
	);
}
