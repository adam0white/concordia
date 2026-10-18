export type TownTab = "town" | "help" | "stories" | "inspector";
const tabs = ["town", "help", "stories", "inspector"] as const;
const labels = {
	town: "Town",
	help: "Help",
	stories: "Stories",
	inspector: "Compare",
};
const paths = {
	town: "m3 11 9-8 9 8M5 10v11h5v-7h4v7h5V10",
	help: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v10m-5-5h10",
	stories: "M12 5v15M12 5Q7 2 2 5v14q5-3 10 1q5-4 10-1V5q-5-3-10 0Z",
	inspector: "M3 3v18h18M6 15l4-5 4 3 6-7",
};
export default function TownNavigation({
	active,
	change,
}: {
	active: TownTab;
	change: (tab: TownTab) => void;
}) {
	return (
		<div className="primary-navigation" role="tablist" aria-label="Town views">
			{tabs.map((tab, index) => (
				<button
					type="button"
					role="tab"
					id={`tab-${tab}`}
					key={tab}
					aria-selected={active === tab}
					aria-controls="town-info-panel"
					tabIndex={active === tab ? 0 : -1}
					onClick={() => change(tab)}
					onKeyDown={(event) => {
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
					}}
				>
					<svg aria-hidden="true" viewBox="0 0 24 24">
						<path d={paths[tab]} />
					</svg>
					<span>{labels[tab]}</span>
				</button>
			))}
		</div>
	);
}
