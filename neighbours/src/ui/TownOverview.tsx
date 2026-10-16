import { useEffect, useRef, useState } from "react";
import type { PersonView, TownView } from "../contracts";
import { initial } from "./format";
import type { ObservedFeed } from "./observations";
import PersonPanel from "./PersonPanel";
import { activityLabel } from "./person-status";
import TownGoal from "./TownGoal";
import TownMap from "./TownMap";

export default function TownOverview({
	town,
	selected,
	person,
	observed,
	select,
	close,
	help,
}: {
	town: TownView;
	selected: string;
	person?: PersonView;
	observed?: ObservedFeed;
	select: (id: string) => void;
	close: () => void;
	help: () => void;
}) {
	const roster = useRef<HTMLElement>(null);
	const [rosterOverflows, setRosterOverflows] = useState(false);
	useEffect(() => {
		const strip = roster.current;
		if (!strip) return;
		const observer = new ResizeObserver(() =>
			setRosterOverflows(strip.scrollWidth > strip.clientWidth + 1),
		);
		observer.observe(strip);
		return () => observer.disconnect();
	}, []);
	return (
		<>
			{!person && <TownGoal town={town} help={help} />}
			<main
				className={`town-layout focused-town ${person ? "has-person" : ""}`}
			>
				<section className="map-section" aria-label="Town overview">
					<div className="map-heading">
						<h2>Alder Quay</h2>
						<span className="population">
							{
								town.people.filter((resident) => resident.lifeState !== "dead")
									.length
							}{" "}
							residents
						</span>
					</div>
					<div className="map-frame">
						<TownMap town={town} selected={selected} select={select} />
					</div>
					<div className="roster-row">
						<nav
							ref={roster}
							className="neighbour-strip"
							aria-label="Familiar neighbours"
						>
							{town.people
								.filter((resident) => resident.known)
								.map((resident) => (
									<button
										type="button"
										key={resident.id}
										className={`neighbour life-${resident.lifeState ?? "awake"} ${selected === resident.id ? "active" : ""}`}
										data-person-id={resident.id}
										aria-label={`${resident.name} · ${activityLabel(resident)}`}
										onClick={() =>
											selected === resident.id ? close() : select(resident.id)
										}
									>
										<span
											className="mini-avatar"
											style={{ background: resident.color }}
										>
											{initial(resident.name)}
										</span>
										<strong>{resident.name.split(" ")[0]}</strong>
									</button>
								))}
						</nav>
						{rosterOverflows && (
							<button
								type="button"
								className="more-neighbours"
								aria-label="More neighbours"
								onClick={() => {
									const strip = roster.current;
									if (!strip) return;
									strip.scrollTo({
										left:
											strip.scrollLeft + strip.clientWidth >=
											strip.scrollWidth - 8
												? 0
												: strip.scrollLeft + strip.clientWidth * 0.8,
										behavior: window.matchMedia(
											"(prefers-reduced-motion: reduce)",
										).matches
											? "instant"
											: "smooth",
									});
								}}
							>
								→
							</button>
						)}
					</div>
				</section>
				{person && (
					<div className="focused-person">
						<button
							type="button"
							className="mobile-person-back text-button"
							onClick={close}
						>
							← Back to town
						</button>
						<PersonPanel
							person={person}
							town={town}
							observed={observed}
							close={close}
						/>
					</div>
				)}
			</main>
		</>
	);
}
