import type { TownComparison } from "../contracts";

type Story = TownComparison["baseline"]["stories"][number];
const key = (story: Story) =>
	JSON.stringify([story.at, story.title, story.summary]);

/** Compare reported outcomes only. Dates are never inferred from prose. */
export function comparisonOutcomes(report: TownComparison) {
	const within = (story: Story) =>
		story.at !== undefined &&
		story.at >= report.startAt &&
		story.at <= report.endAt;
	const dated = (stories: Story[]) =>
		stories.filter(within).toSorted((a, b) => (b.at ?? 0) - (a.at ?? 0));
	const split = (baseline: Story[], treatment: Story[]) => {
		// Match occurrences, not just membership: two equal records in one branch
		// must not disappear because the other branch contains only one.
		const remaining = new Map<string, number[]>();
		for (const [index, story] of treatment.entries()) {
			const signature = key(story);
			const matches = remaining.get(signature) ?? [];
			matches.push(index);
			remaining.set(signature, matches);
		}
		const shared: Story[] = [];
		const onlyBaseline: Story[] = [];
		for (const story of baseline) {
			const matches = remaining.get(key(story));
			if (matches?.length) {
				matches.shift();
				shared.push(story);
			} else onlyBaseline.push(story);
		}
		const unmatched = new Set([...remaining.values()].flat());
		return {
			baseline: onlyBaseline,
			treatment: treatment.filter((_, index) => unmatched.has(index)),
			shared,
		};
	};
	return {
		...split(dated(report.baseline.stories), dated(report.treatment.stories)),
		undated: split(
			report.baseline.stories.filter((s: Story) => s.at === undefined),
			report.treatment.stories.filter((s: Story) => s.at === undefined),
		),
	};
}
