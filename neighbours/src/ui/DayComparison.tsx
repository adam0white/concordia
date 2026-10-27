import { useEffect, useRef, useState } from "react";
import type { Intervention, TownComparison, TownView } from "../contracts";
import { comparisonOutcomes } from "./comparison-outcomes";
import { plainText } from "./plain-english";

const at = (minutes: number) =>
	`Day ${Math.floor(minutes / 1440) + 1}, ${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const numeric = (value: number) =>
	Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1);
const names: Record<string, string> = {
	hallRepairs: "Hall repairs completed",
	benchNoticesReceived: "Bench proposal received by Rafi",
	benchReserved: "Agreed main-bench booking",
	benchRequests: "Bench requests received by Nora",
	cartSections: "Cart sections restored",
	cartReturned: "Cart returned to Bilal",
	hallCapacity: "Hall places available",
	inspectionRequests: "Annex requests sent",
	annexOpened: "Annex opened",
	interventionsSpent: "Town credits spent",
	hallSafe: "Hall safe for use",
	tools: "Shared tools available",
	totalTools: "Tools owned, including in use",
	methodLearners: "Neighbours with the learned method",
	foodProduced: "Food produced",
	foodConsumed: "Meals eaten",
	population: "Residents",
	background: "Background residents",
	alive: "Living residents",
	dead: "Deaths",
	underfed: "Residents with food reserve below 10%",
	lowHealth: "Residents with health below 50%",
	penniless: "Residents without money",
	availableFood: "Food available",
	totalKnownWealth: "Familiar neighbours’ total money",
};
const interventions: Record<Intervention["kind"], string> = {
	"player-private": "Ask about a private detail",
	"lend-tools": "Add 3 shared tools",
	"propose-bench-window": "Tell Rafi about a time to use the bench",
	"request-inspection": "Request an annex inspection",
	"restore-bus": "Restore bus service",
	"share-news": "Broadcast hall news",
	"open-evening-slot": "Open a second hall evening",
	"advertise-evening": "Share the posted evening invitation",
	"player-move": "Walk somewhere",
	"player-speak": "Speak to a neighbour",
	"player-help": "Cover a neighbour’s paid hour",
	"player-work": "Give an hour of your own work",
};
const genericInterventions = [
	"lend-tools",
	"restore-bus",
	"share-news",
] as const;
export type ComparisonSetup = {
	kind: "lend-tools" | "restore-bus" | "share-news";
	rounds: 24 | 96 | 672;
};
export default function DayComparison({
	report,
	request,
	busy,
	disabled = false,
	progress,
	error,
	selected,
	onRun,
	onCancel,
	setup: controlledSetup,
	onSetupChange,
	stale = false,
	town,
}: {
	setup?: ComparisonSetup;
	onSetupChange?: (setup: ComparisonSetup) => void;
	stale?: boolean;
	town?: TownView;
	report?: TownComparison;
	request?: { label: string; rounds: number };
	busy: boolean;
	disabled?: boolean;
	progress: string;
	error: string;
	selected: string;
	onRun: (intervention: Intervention, rounds: 24 | 96 | 672) => void;
	onCancel?: () => void;
}) {
	const [localSetup, setLocalSetup] = useState<ComparisonSetup>({
		kind: "lend-tools",
		rounds: 24,
	});
	const { kind, rounds } = controlledSetup ?? localSetup;
	const updateSetup = (next: ComparisonSetup) => {
		setLocalSetup(next);
		onSetupChange?.(next);
	};
	const unavailable = (id: ComparisonSetup["kind"]) => {
		if (!town) return "";
		if (town.controlsRemaining <= 0) return "No town credits remain.";
		if (id === "lend-tools" && town.canLendTools === false)
			return "Shared tools cannot be added right now.";
		if (id === "restore-bus" && town.canRestoreBus === false)
			return "Bus service is already restored or unavailable right now.";
		if (id === "share-news" && town.canShareNews === false)
			return "There is no new hall news to broadcast right now.";
		return "";
	};
	const blocked = unavailable(kind);
	const disclosure = useRef<HTMLDetailsElement>(null);
	useEffect(() => {
		if ((busy || report || error) && disclosure.current)
			disclosure.current.open = true;
	}, [busy, report, error]);
	const outcomes = report ? comparisonOutcomes(report) : undefined;
	const keys = report
		? [
				...new Set([
					...Object.keys(report.baseline.stats),
					...Object.keys(report.treatment.stats),
				]),
			].filter(
				(key) =>
					[
						"hallRepairs",
						"hallSafe",
						"tools",
						"foodProduced",
						"foodConsumed",
						"availableFood",
						"totalKnownWealth",
					].includes(key) ||
					report.baseline.stats[key] !== report.treatment.stats[key],
			)
		: [];
	const resourcePriority = [
		"dead",
		"underfed",
		"lowHealth",
		"foodConsumed",
		"hallRepairs",
		"tools",
	];
	const changedKeys = keys
		.filter(
			(key) =>
				report && report.baseline.stats[key] !== report.treatment.stats[key],
		)
		.sort((a, b) => {
			const priority = (key: string) =>
				resourcePriority.includes(key)
					? resourcePriority.indexOf(key)
					: resourcePriority.length;
			return priority(a) - priority(b);
		});
	const baselinePerson = report?.baseline.known.find(
		(person) => person.id === selected,
	);
	const treatmentPerson = report?.treatment.known.find(
		(person) => person.id === selected,
	);
	const setup = (
		<form
			hidden={busy}
			className="branch-controls"
			onSubmit={(event) => {
				event.preventDefault();
				if (!busy && !disabled && !blocked) onRun({ kind }, rounds);
			}}
		>
			<label>
				Change in the second run
				<select
					disabled={busy || disabled}
					value={kind}
					onChange={(event) =>
						updateSetup({
							kind: event.target.value as ComparisonSetup["kind"],
							rounds,
						})
					}
				>
					{genericInterventions.map((id) => (
						<option key={id} value={id} disabled={!!unavailable(id)}>
							{interventions[id]}
							{unavailable(id) ? " · unavailable" : ""}
						</option>
					))}
				</select>
			</label>
			<label>
				Simulated time
				<select
					disabled={busy || disabled}
					value={rounds}
					onChange={(event) =>
						updateSetup({
							kind,
							rounds: Number(event.target.value) as 24 | 96 | 672,
						})
					}
				>
					<option value={24}>6 hours · 24 rounds</option>
					<option value={96}>A day · 96 rounds</option>
					<option value={672}>Seven days · 672 rounds</option>
				</select>
			</label>
			{blocked && (
				<p className="tiny" role="status">
					{blocked}
				</p>
			)}
			<button type="submit" disabled={busy || disabled || !!blocked}>
				{busy ? "Comparing…" : "Compare from here"}
			</button>
		</form>
	);
	return (
		<details ref={disclosure} open className="comparison day-comparison">
			<summary>Compare possible outcomes</summary>
			{(request || report) && (
				<p>
					<strong>
						{request?.label ??
							(report ? interventions[report.intervention.kind] : "")}
					</strong>
				</p>
			)}
			<p className="tiny muted">
				These are possible outcomes. Your town stays unchanged.
			</p>
			{report && (
				<p className="tiny comparison-checkpoint">
					Compared time: {at(report.startAt)} → {at(report.endAt)} ·{" "}
					{report.rounds} rounds (
					{numeric((report.endAt - report.startAt) / 60)} hours)
				</p>
			)}
			{report && stale && (
				<p className="tiny comparison-stale" role="status">
					Your town has changed since this comparison began. This saved
					comparison still describes its original starting state.
				</p>
			)}
			{!busy && !report && setup}
			{busy && (
				<p className="tiny" role="status">
					{progress ||
						"Running both possible versions of the town. The live town is paused."}
				</p>
			)}
			{busy && onCancel && (
				<button type="button" onClick={onCancel}>
					Cancel comparison
				</button>
			)}
			{error &&
				(/Traceback|BridgeError|PythonError|\n/.test(error) ? (
					<div>
						<p className="error" role="alert">
							The comparison could not finish. Your town is unchanged.
						</p>
						<details>
							<summary>Technical details</summary>
							<pre>{error}</pre>
						</details>
					</div>
				) : (
					<p className="error" role="alert">
						{error}
					</p>
				))}
			{report && !busy && (
				<>
					<section className="changed-resources" aria-label="Changed resources">
						<h3>Resources that differed at the end</h3>
						{changedKeys.length ? (
							<ul>
								{changedKeys.slice(0, 6).map((key) => (
									<li key={key}>
										<span>
											{names[key] ?? key.replaceAll(/([a-z])([A-Z])/g, "$1 $2")}
										</span>
										<strong>
											{numeric(report.baseline.stats[key] ?? 0)} →{" "}
											{numeric(report.treatment.stats[key] ?? 0)}
										</strong>
									</li>
								))}
							</ul>
						) : (
							<p>No resource differences were reported.</p>
						)}
						{changedKeys.length > 6 && (
							<p className="tiny muted">
								{changedKeys.length - 6} more changed facts in the full resource
								table below.
							</p>
						)}
						<p className="tiny muted">
							Without help → with help. These totals describe these two runs;
							they do not establish a general effect or explain the decision
							mechanism.
						</p>
					</section>
					{outcomes && (
						<section aria-label="Changed outcomes">
							<h3>What differed during this comparison</h3>
							{outcomes.baseline.length || outcomes.treatment.length ? (
								<div className="event-grid">
									{(["baseline", "treatment"] as const).map((branch) => (
										<div className="trial" key={branch}>
											<h4>
												{branch === "baseline" ? "Without help" : "With help"}
											</h4>
											{outcomes[branch].length ? (
												outcomes[branch].map((story) => (
													<article
														aria-label={story.title}
														key={
															story.id ??
															JSON.stringify([
																story.at,
																story.title,
																story.summary,
															])
														}
													>
														<p>
															<time className="tiny muted">
																{at(story.at ?? report.startAt)}
															</time>
															<br />
															{plainText(story.summary)}
														</p>
													</article>
												))
											) : (
												<p>
													No different outcome was recorded during this time.
												</p>
											)}
										</div>
									))}
								</div>
							) : (
								<p>
									No story has a different outcome yet. Progress and resources
									are compared below.
								</p>
							)}
							{outcomes.shared.length > 0 && (
								<details>
									<summary>
										Same outcomes in both runs · {outcomes.shared.length}
									</summary>
									{outcomes.shared.map((story) => (
										<article
											aria-label={story.title}
											key={
												story.id ??
												JSON.stringify([story.at, story.title, story.summary])
											}
										>
											<p>
												<time className="tiny muted">
													{at(story.at ?? report.startAt)}
												</time>
												<br />
												{plainText(story.summary)}
											</p>
										</article>
									))}
								</details>
							)}
							{outcomes.undated.baseline.length +
								outcomes.undated.treatment.length +
								outcomes.undated.shared.length >
								0 && (
								<details>
									<summary>Stories without recorded dates</summary>
									<p className="tiny muted">
										These reports lack story times. They may include history
										from before the comparison began.
									</p>
									{(["baseline", "treatment", "shared"] as const).map(
										(branch) =>
											outcomes.undated[branch].length > 0 && (
												<div key={branch}>
													<h4>
														{branch === "baseline"
															? "Without help"
															: branch === "treatment"
																? "Intervention"
																: "Both runs"}
													</h4>
													{outcomes.undated[branch].map((story) => (
														<article
															aria-label={story.title}
															key={
																story.id ??
																JSON.stringify([story.title, story.summary])
															}
														>
															<p>{plainText(story.summary)}</p>
														</article>
													))}
												</div>
											),
									)}
								</details>
							)}
						</section>
					)}
					<details>
						<summary>Resources and neighbour state at the end</summary>
						<div className="comparison-table-wrap">
							<table>
								<caption>State at the end of each recorded branch</caption>
								<thead>
									<tr>
										<th scope="col">Town fact</th>
										<th scope="col">No intervention</th>
										<th scope="col">Intervention</th>
										<th scope="col">Difference</th>
									</tr>
								</thead>
								<tbody>
									{keys.map((key) => {
										const before = report.baseline.stats[key] ?? 0,
											after = report.treatment.stats[key] ?? 0,
											diff = after - before;
										return (
											<tr key={key}>
												<th scope="row">
													{names[key] ??
														key.replaceAll(/([a-z])([A-Z])/g, "$1 $2")}
												</th>
												<td>
													{key === "hallSafe"
														? before
															? "Yes"
															: "No"
														: numeric(before)}
												</td>
												<td>
													{key === "hallSafe"
														? after
															? "Yes"
															: "No"
														: numeric(after)}
												</td>
												<td>
													{diff > 0 ? "+" : ""}
													{numeric(diff)}
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
						{baselinePerson && treatmentPerson && (
							<div className="branch-person">
								<strong>{baselinePerson.name} at the end</strong>
								<p>
									No intervention: {baselinePerson.activity} · money{" "}
									{numeric(baselinePerson.wealth)}
								</p>
								<p>
									Intervention: {treatmentPerson.activity} · money{" "}
									{numeric(treatmentPerson.wealth)}
								</p>
							</div>
						)}
						<details>
							<summary>All neighbour states</summary>
							{report.baseline.known.map((person) => {
								const other = report.treatment.known.find(
									(p) => p.id === person.id,
								);
								return (
									<div className="trial" key={person.id}>
										<strong>{person.name}</strong>
										<p>
											No intervention: {person.activity} · money{" "}
											{numeric(person.wealth)}
										</p>
										<p>
											Intervention: {other?.activity ?? "Not reported"} · money{" "}
											{other ? numeric(other.wealth) : "Not reported"}
										</p>
									</div>
								);
							})}
						</details>
					</details>
					<details>
						<summary>How this comparison works</summary>
						<p className="tiny muted">
							Seed {report.seed} · {at(report.startAt)} → {at(report.endAt)} ·{" "}
							{interventions[report.intervention.kind]}
						</p>
						<p className="tiny muted">
							Two possible versions start from the same saved town. One
							continues without help. The other receives one support action.
							Both run the actual simulation without calling an AI language
							model.
						</p>
						<p className="tiny muted">
							Only recorded outcomes within this interval appear above.
							Differences describe these two runs; they do not establish a
							general effect.
						</p>{" "}
						<a
							className="text-button"
							download={`town-comparison-${report.seed}-${report.startAt}.json`}
							href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(report, null, 2))}`}
						>
							Download full comparison
						</a>
						<p className="tiny checkpoint-hash">
							Starting state: {report.startHash}
						</p>
						{report.limits.map((limit) => (
							<p className="tiny muted" key={limit}>
								{limit}
							</p>
						))}
					</details>
					<details>
						<summary>Try another comparison</summary>
						{setup}
					</details>
				</>
			)}
		</details>
	);
}
