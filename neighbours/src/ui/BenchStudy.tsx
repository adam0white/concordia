import { useEffect, useState } from "react";
import {
	type BenchReport,
	type Branch,
	benchStudyReport,
} from "./bench-study-report.ts";
import { datedClock } from "./format";

export { benchStudyReport } from "./bench-study-report.ts";

export function BenchStudyResults({
	report,
	index,
}: {
	report: BenchReport;
	index: number;
}) {
	const trial = report.cases[index];
	if (!trial) return null;
	const row = (label: string, read: (branch: Branch) => string) => (
		<tr key={label}>
			<th>{label}</th>
			<td>{read(trial.noProposal)}</td>
			<td>{read(trial.proposal)}</td>
		</tr>
	);
	return (
		<section aria-label="Town bench study">
			<h3>Did a proposed bench window change the repair?</h3>
			<p className="tiny muted">
				Recorded Node host control · two simulated days · eight residents · HF{" "}
				{report.hf} · no model calls. Separate from your town.
			</p>
			<p className="tiny muted">
				{datedClock(
					trial.noProposal.endAt - trial.noProposal.fullIntervalMinutes,
				)}
				–{datedClock(trial.noProposal.endAt)} · recorded{" "}
				{report.recordedAt.slice(0, 10)}
			</p>
			<div className="table-scroll">
				<table>
					<thead>
						<tr>
							<th>Observed step</th>
							<th>No proposal</th>
							<th>Whole proposal</th>
						</tr>
					</thead>
					<tbody>
						{row("Ravi received notice", (b) =>
							b.chain.receivedNotice ? "Yes" : "No",
						)}
						{row(
							"First Ravi choice",
							(b) => b.chain.raviFirstDecision?.chosen ?? "No choice recorded",
						)}
						{row("Requests received by Ada", (b) =>
							String(b.outcome.newRequests),
						)}
						{row("Agreements received", (b) =>
							String(b.outcome.newReceivedAgreements),
						)}
						{row("Main-bench work completed", (b) =>
							String(b.outcome.mainBenchWorkPeriods),
						)}
						{row("Returned to Jo", (b) =>
							b.outcome.returned ? "Returned" : "No return in this interval",
						)}
						{row(
							"Ada’s paid work completed",
							(b) => `${b.outcome.adaPaidMinutesCompleted} minutes`,
						)}
					</tbody>
				</table>
			</div>
			<details>
				<summary>Controls, limits and original measurements</summary>
				{report.limitations.map((limit) => (
					<p className="tiny muted" key={limit}>
						{limit}
					</p>
				))}
				<p className="tiny checkpoint-hash">
					Source {report.sourceCommit} ·{" "}
					{report.sourceWorktreeClean
						? "source files clean"
						: "source files modified"}
					<br />
					{report.sourceFingerprint}
				</p>
				<a href="./experiments/bench-choices.json" download>
					Download all cases and matched controls ↓
				</a>
			</details>
		</section>
	);
}
export default function BenchStudy() {
	const [report, setReport] = useState<BenchReport>();
	const [error, setError] = useState(false);
	const [index, setIndex] = useState(0);
	useEffect(() => {
		const c = new AbortController();
		fetch("./experiments/bench-choices-summary.json", { signal: c.signal })
			.then(async (r) => {
				if (!r.ok) throw Error("Unavailable");
				setReport(benchStudyReport(await r.json()));
			})
			.catch((e) => {
				if (e.name !== "AbortError") setError(true);
			});
		return () => c.abort();
	}, []);
	if (!report)
		return (
			<p role="status">
				{error
					? "Town bench recording unavailable. No result verified here."
					: "Loading town bench recording…"}
			</p>
		);
	return (
		<>
			<label>
				Frozen town case
				<select
					value={index}
					onChange={(e) => setIndex(Number(e.target.value))}
				>
					{report.cases.map((c, i) => (
						<option key={`${c.seed}-${c.slot}`} value={i}>
							Seed {c.seed} · {c.slot}
						</option>
					))}
				</select>
			</label>
			<BenchStudyResults report={report} index={index} />
			{report.noNaturalCase?.map((n) => (
				<p className="tiny muted" key={n.seed}>
					Seed {n.seed}: no natural case in {n.searchedDays} days. {n.reason}
				</p>
			))}
		</>
	);
}
