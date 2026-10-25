import { useEffect, useState } from "react";
import { type InspectionReport, inspectionReport } from "./recorded-studies";

const label = (policy: string) =>
	({
		"hf-intact": "HF · learned rules intact",
		"hf-withheld": "HF · teaching withheld",
		"hf-removed": "HF · learned rules removed",
		table: "Table · equal examples",
		"conditional-table": "Table · equal examples",
		random: "Random control",
		llm: "LLM · actual model calls",
	})[policy] ?? policy;
export function InspectionStudy({ report }: { report: InspectionReport }) {
	const [index, setIndex] = useState(0);
	const call = report.calls[index];
	if (!call) return <p role="status">This case is unavailable.</p>;
	return (
		<section
			className="inspection-study"
			aria-label="Recorded hall inspection study"
		>
			<h3>Can learned inspection signs guide a safe choice?</h3>
			<p className="tiny muted">
				Historical native recording ·{" "}
				{new Date(report.recordedAt).toLocaleDateString()} · HF{" "}
				{report.baseline.framework} · {report.calls.length} actual LLM calls.
				Separate from your town.
			</p>
			<label>
				Inspection case
				<select
					value={index}
					onChange={(event) => setIndex(Number(event.target.value))}
				>
					{report.calls.map((trial, i) => (
						<option key={trial.observation.sectionId} value={i}>
							Case {i + 1} · {trial.observation.moisture} /{" "}
							{trial.observation.support}
						</option>
					))}
				</select>
			</label>
			<p>
				Observed moisture: <strong>{call.observation.moisture}</strong> ·
				support: <strong>{call.observation.support}</strong>
			</p>
			<div className="comparison-table-wrap">
				<table>
					<caption>Same recorded case · actions and physical outcomes</caption>
					<thead>
						<tr>
							<th scope="col">Decision policy</th>
							<th scope="col">Action</th>
							<th scope="col">Outcome</th>
						</tr>
					</thead>
					<tbody>
						{report.baseline.arms.map((arm) => {
							const trial = arm.cases[index];
							if (!trial) return null;
							return (
								<tr key={arm.policy}>
									<th scope="row">{label(arm.policy)}</th>
									<td>{trial.action}</td>
									<td>
										{trial.outcome} · {trial.safe ? "Safe" : "Unsafe"} ·{" "}
										{trial.completed ? "Completed" : "Not completed"}
									</td>
								</tr>
							);
						})}
						<tr>
							<th scope="row">{label("llm")}</th>
							<td>{call.choice.action}</td>
							<td>
								{call.score.outcome} · {call.score.safe ? "Safe" : "Unsafe"} ·{" "}
								{call.score.completed ? "Completed" : "Not completed"}
							</td>
						</tr>
					</tbody>
				</table>
			</div>
			<details>
				<summary>Model explanation and source records for this case</summary>
				<p>{call.choice.reason}</p>
				<p>
					{call.provenance.provider} ·{" "}
					{call.provenance.models?.join(", ") || call.provenance.requestedModel}
				</p>
				<p>{report.execution}</p>
			</details>
			<details>
				<summary>All cases · combined measurements</summary>
				<div className="comparison-table-wrap">
					<table>
						<caption>
							Safe includes asking for help; completion is separate.
						</caption>
						<thead>
							<tr>
								<th scope="col">Policy</th>
								<th scope="col">Safe</th>
								<th scope="col">Completed</th>
								<th scope="col">Asked</th>
							</tr>
						</thead>
						<tbody>
							{report.baseline.arms.map((arm) => (
								<tr key={arm.policy}>
									<th scope="row">{label(arm.policy)}</th>
									<td>
										{arm.cases.length - arm.unsafe}/{arm.cases.length}
									</td>
									<td>
										{arm.completed}/{arm.cases.length}
									</td>
									<td>
										{arm.asked}/{arm.cases.length}
									</td>
								</tr>
							))}
							<tr>
								<th scope="row">{label("llm")}</th>
								<td>
									{report.summary.cases - report.summary.unsafe}/
									{report.summary.cases}
								</td>
								<td>
									{report.summary.completed}/{report.summary.cases}
								</td>
								<td>
									{report.summary.asked}/{report.summary.cases}
								</td>
							</tr>
						</tbody>
					</table>
				</div>
			</details>
			<details>
				<summary>Method, limits and original measurements</summary>
				<p>
					The study uses two demonstrated rules and fixed cases that were not
					used for teaching. The table receives the same examples. These results
					do not prove general planning ability or show that one policy is
					better overall.
				</p>
				{report.limits.map((limit) => (
					<p className="tiny muted" key={limit}>
						{limit}
					</p>
				))}
				<p className="tiny muted">
					The original file lists limits that apply only to the baseline. The
					full report’s limits apply to this comparison.
				</p>
				<a href="./experiments/inspection-comparison.json" download>
					Download recorded measurements ↓
				</a>
			</details>
		</section>
	);
}
export default function Comparison() {
	const [report, setReport] = useState<InspectionReport>();
	const [error, setError] = useState(false);
	useEffect(() => {
		const controller = new AbortController();
		fetch("./experiments/inspection-comparison.json", {
			signal: controller.signal,
		})
			.then(async (response) => {
				if (!response.ok) throw Error("Report unavailable");
				setReport(inspectionReport(await response.json()));
			})
			.catch((error) => {
				if (error.name !== "AbortError") setError(true);
			});
		return () => controller.abort();
	}, []);
	return report ? (
		<InspectionStudy report={report} />
	) : (
		<p role="status">
			{error
				? "The recorded inspection study is unavailable. No result has been verified here."
				: "Loading recorded inspection study…"}
		</p>
	);
}
