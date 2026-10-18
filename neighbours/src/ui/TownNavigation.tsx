import type { KeyboardEvent } from "react";

export type TownTab = "town" | "journal" | "more";
export type MoreTab = "help" | "compare";

const paths: Record<TownTab | MoreTab, string> = {
	town: "M3 11.5 12 4l9 7.5M5.5 10v10h4.5v-6h4v6h4.5V10",
	journal: "M6 3.5h11.5v17H6c-1 0-2-.8-2-2v-13c0-1.2 1-2 2-2ZM8 8h6.5M8 12h6.5",
	more: "M5 12h.1M12 12h.1M19 12h.1",
	help: "M12 20s-7-4.3-7-9.4C5 8 6.8 6 9 6c1.4 0 2.4.7 3 1.8C12.6 6.7 13.6 6 15 6c2.2 0 4 2 4 4.6 0 5.1-7 9.4-7 9.4Z",
	compare: "M4 19V5M4 19h16M7.5 15l3.5-4.5 3 2.5 5-6.5",
};

function Glyph({ tab }: { tab: TownTab | MoreTab }) {
	return (
		<svg aria-hidden="true" viewBox="0 0 24 24" className="glyph">
			<path d={paths[tab]} />
		</svg>
	);
}

function roving<T extends string>(
	event: KeyboardEvent<HTMLButtonElement>,
	tabs: readonly T[],
	index: number,
	change: (tab: T) => void,
) {
	const next =
		event.key === "ArrowRight"
			? (index + 1) % tabs.length
			: event.key === "ArrowLeft"
				? (index + tabs.length - 1) % tabs.length
				: event.key === "Home"
					? 0
					: event.key === "End"
						? tabs.length - 1
						: -1;
	const target = tabs[next];
	if (!target) return;
	event.preventDefault();
	change(target);
	event.currentTarget.parentElement
		?.querySelectorAll<HTMLButtonElement>("[role=tab]")
		[next]?.focus();
}

const townTabs = ["town", "journal", "more"] as const;
const townLabels: Record<TownTab, string> = {
	town: "Town",
	journal: "Journal",
	more: "More",
};

/** The one drawer switcher. Town shows the map, or the selected person. */
export default function TownNavigation({
	active,
	change,
}: {
	active: TownTab;
	change: (tab: TownTab) => void;
}) {
	return (
		<div className="primary-navigation" role="tablist" aria-label="Town views">
			{townTabs.map((tab, index) => (
				<button
					type="button"
					role="tab"
					id={`tab-${tab}`}
					key={tab}
					aria-selected={active === tab}
					aria-controls="town-info-panel"
					tabIndex={active === tab ? 0 : -1}
					onClick={() => change(tab)}
					onKeyDown={(event) => roving(event, townTabs, index, change)}
				>
					<Glyph tab={tab} />
					<span>{townLabels[tab]}</span>
				</button>
			))}
		</div>
	);
}

const moreTabs = ["help", "compare"] as const;
const moreLabels: Record<MoreTab, string> = {
	help: "Help",
	compare: "Compare",
};

export function MoreNavigation({
	active,
	change,
}: {
	active: MoreTab;
	change: (tab: MoreTab) => void;
}) {
	return (
		<div className="more-navigation" role="tablist" aria-label="More">
			{moreTabs.map((tab, index) => (
				<button
					type="button"
					role="tab"
					id={`more-tab-${tab}`}
					key={tab}
					aria-selected={active === tab}
					aria-controls="more-panel"
					tabIndex={active === tab ? 0 : -1}
					onClick={() => change(tab)}
					onKeyDown={(event) => roving(event, moreTabs, index, change)}
				>
					<Glyph tab={tab} />
					<span>{moreLabels[tab]}</span>
				</button>
			))}
		</div>
	);
}
