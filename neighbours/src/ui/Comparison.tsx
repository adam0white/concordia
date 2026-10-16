import { useEffect, useState } from "react";

interface Case {
	observation: {
		moisture: string;
		support: string;
		contextId: string;
		sectionId: string;
	};
	action: string;
	safe: boolean;
	completed: boolean;
	outcome: string;
}
interface Arm {
	policy: string;
	completed: number;
	unsafe: number;
	asked: number;
	cases: Case[];
}
interface Report {
	schema: string;
	recordedAt: string;
	execution: string;
	baseline: { arms: Arm[]; limits: string[] };
	calls: {
		observation: Case["observation"];
		choice: { action: string; reason: string };
		score: { safe: boolean; completed: boolean; outcome: string };
		provenance: { provider: string; requestedModel: string; models?: string[] };
	}[];
	summary: {
		policy: string;
		cases: number;
		completed: number;
		unsafe: number;
		asked: number;
	};
	limits: string[];
}
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
const cue = (observation: Case["observation"]) =>
	`Moisture: ${observation.moisture}; support: ${observation.support}`;
export default function Comparison() {
	const [report, setReport] = useState<Report>();
	const [error, setError] = useState(false);
	useEffect(() => {
		const controller = new AbortController();
		fetch("./experiments/inspection-comparison.json", {
			signal: controller.signal,
		})
			.then(async (response) => {
				if (!response.ok) throw Error("Report unavailable");
				const data = (await response.json()) as Report;
				if (!data.baseline?.arms || !Array.isArray(data.calls))
					throw Error("Invalid report");
				setReport(data);
			})
			.catch((e) => {
				if (e.name !== "AbortError") setError(true);
			});
		return () => controller.abort();
	}, []);
	return (
		<details className="comparison">
			<summary>Recorded comparison · hall inspection</summary>
			{!report ? (
				<p className="muted tiny">
					{error
						? "The recorded comparison is unavailable. The live town continues independently."
						: "Loading the recorded experiment…"}
				</p>
			) : (
				<>
					<p className="tiny muted">
						Recorded native experiment ·{" "}
						{new Date(report.recordedAt).toLocaleDateString()} ·{" "}
						{report.calls.length} actual LLM calls. These are saved
						measurements, separate from the live browser town.
					</p>
					<div className="comparison-table-wrap">
						<table>
							<caption>
								Four inspection cases. Safe includes choosing to ask for help.
							</caption>
							<thead>
								<tr>
									<th scope="col">Decision policy</th>
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
								<tr className="llm-row">
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
					<details>
						<summary>Actual cues, choices & outcomes</summary>
						{report.baseline.arms.map((arm) => (
							<details key={arm.policy}>
								<summary>{label(arm.policy)}</summary>
								{arm.cases.map((trial, i) => (
									<div
										className="trial"
										key={`${trial.observation.contextId}-${trial.observation.sectionId}-${trial.action}`}
									>
										<strong>
											Case {i + 1} · {cue(trial.observation)}
										</strong>
										<p>
											{trial.action} → {trial.outcome}
										</p>
										<span>
											{trial.safe ? "Safe" : "Unsafe"} ·{" "}
											{trial.completed ? "Completed" : "Not completed"}
										</span>
									</div>
								))}
							</details>
						))}
						<details>
							<summary>LLM · {report.calls.length} actual responses</summary>
							{report.calls.map((trial, i) => (
								<div
									className="trial"
									key={`${trial.observation.contextId}-${trial.observation.sectionId}-${trial.choice.action}`}
								>
									<strong>
										Case {i + 1} · {cue(trial.observation)}
									</strong>
									<p>
										{trial.choice.action} → {trial.score.outcome}
									</p>
									<p>{trial.choice.reason}</p>
									<span>
										{trial.provenance.provider} ·{" "}
										{trial.provenance.models?.join(", ") ||
											trial.provenance.requestedModel}
									</span>
								</div>
							))}
						</details>
					</details>
					<details>
						<summary>What this comparison can establish</summary>
						{[...new Set([...report.baseline.limits, ...report.limits])].map(
							(limit) => (
								<p className="tiny muted" key={limit}>
									{limit}
								</p>
							),
						)}
					</details>
					<a
						className="text-button"
						href="./experiments/inspection-comparison.json"
						download
					>
						Download recorded measurements ↓
					</a>
				</>
			)}
		</details>
	);
}
