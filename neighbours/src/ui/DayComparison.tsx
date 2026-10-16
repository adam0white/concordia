import { useEffect, useRef, useState } from "react";
import type { Intervention, TownComparison } from "../contracts";

const at = (minutes: number) =>
	`Day ${Math.floor(minutes / 1440) + 1}, ${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const numeric = (value: number) =>
	Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1);
const names: Record<string, string> = {
	hallRepairs: "Hall repairs completed",
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
	"lend-tools": "Add 3 shared tools",
	"restore-bus": "Restore bus service",
	"share-news": "Broadcast hall news",
	"open-evening-slot": "Open a second hall evening",
	"advertise-evening": "Share the posted evening invitation",
};
const genericInterventions = [
	"lend-tools",
	"restore-bus",
	"share-news",
] as const;
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
}: {
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
	const [kind, setKind] = useState<Intervention["kind"]>("lend-tools");
	const [rounds, setRounds] = useState<24 | 96 | 672>(24);
	const disclosure = useRef<HTMLDetailsElement>(null);
	useEffect(() => {
		if ((busy || report || error) && disclosure.current)
			disclosure.current.open = true;
	}, [busy, report, error]);
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
				if (!busy && !disabled) onRun({ kind }, rounds);
			}}
		>
			<label>
				Change in the second run
				<select
					disabled={busy || disabled}
					value={kind}
					onChange={(event) =>
						setKind(event.target.value as Intervention["kind"])
					}
				>
					{genericInterventions.map((id) => (
						<option key={id} value={id}>
							{interventions[id]}
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
						setRounds(Number(event.target.value) as 24 | 96 | 672)
					}
				>
					<option value={24}>6 hours · 24 rounds</option>
					<option value={96}>A day · 96 rounds</option>
					<option value={672}>Seven days · 672 rounds</option>
				</select>
			</label>
			<button type="submit" disabled={busy || disabled}>
				{busy ? "Comparing…" : "Compare from here"}
			</button>
		</form>
	);
	return (
		<details ref={disclosure} className="comparison day-comparison">
			<summary>Compare futures · hypothetical branches</summary>
			{request && (
				<p>
					{busy ? "Comparing: " : "Last request: "}
					<strong>{request.label}</strong> · {request.rounds / 96} simulated
					days
				</p>
			)}
			<p className="tiny muted">
				Two hypothetical runs from this checkpoint; the live town stays
				unchanged. One run carries on as it is. The other receives one
				intervention. Both use the actual simulation, with no LLM calls.
			</p>
			<p className="tiny muted">
				A seven-day comparison runs two towns and can take several minutes. You
				can cancel it without changing the live town.
			</p>
			{!busy && request && !report && <p className="eyebrow">New comparison</p>}
			{!busy &&
				(report ? (
					<details>
						<summary>Try another comparison</summary>
						{setup}
					</details>
				) : (
					setup
				))}
			{busy && (
				<p className="tiny" role="status">
					{progress ||
						"Running both hypothetical branches. The live town is paused."}
				</p>
			)}
			{busy && onCancel && (
				<button type="button" onClick={onCancel}>
					Cancel comparison
				</button>
			)}
			{error && (
				<p className="error" role="alert">
					{error}
				</p>
			)}
			{report && (
				<>
					<p className="tiny muted">
						Last comparison · seed {report.seed} · {at(report.startAt)} →{" "}
						{at(report.endAt)} · {interventions[report.intervention.kind]}
					</p>
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
						<summary>Neighbour outcomes & recorded stories</summary>
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
						{(["baseline", "treatment"] as const).map((branch) => (
							<div className="trial" key={branch}>
								<strong>
									{branch === "baseline" ? "No intervention" : "Intervention"} ·
									recorded stories
								</strong>
								{report[branch].stories.length ? (
									report[branch].stories.map((story) => (
										<p key={`${story.title}-${story.summary}`}>
											<b>{story.title}</b> {story.summary}
										</p>
									))
								) : (
									<p>No detected story was reported.</p>
								)}
							</div>
						))}
					</details>
					<details>
						<summary>Checkpoint & limits</summary>
						<p className="tiny checkpoint-hash">
							Starting state: {report.startHash}
						</p>
						{report.limits.map((limit) => (
							<p className="tiny muted" key={limit}>
								{limit}
							</p>
						))}
					</details>
				</>
			)}
		</details>
	);
}
