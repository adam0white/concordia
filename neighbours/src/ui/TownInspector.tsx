import RecordedStudies from "./RecordedStudies";
import "./study-workbench.css";
import DayComparison from "./DayComparison";
import EvidencePanel from "./EvidencePanel";
import { metricLabel, number, placeName } from "./format";
import TownHealth from "./TownHealth";
import type { useVisitorSession } from "./useVisitorSession";

export default function TownInspector({
	session,
	section = "town",
}: {
	session: ReturnType<typeof useVisitorSession>;
	section?: "town" | "recorded";
}) {
	const town = session.town;
	if (!town) return null;
	return (
		<section className="inspector focused-inspector">
			<div hidden={section !== "town"}>
				{session.branchHistory &&
					session.branchHistory.length > 0 &&
					(session.branchHistory.length > 1 || !session.branchReport) && (
						<label>
							Recent comparisons
							<select
								disabled={session.comparing}
								value={
									session.branchHistory.find(
										(entry) => entry.report === session.branchReport,
									)?.id ?? ""
								}
								onChange={(event) => {
									const saved = session.branchHistory.find(
										(entry) => entry.id === event.target.value,
									);
									if (saved) session.selectBranchReport(saved.report);
								}}
							>
								{!session.branchReport && (
									<option value="" disabled>
										Choose a saved comparison
									</option>
								)}
								{session.branchHistory.map(({ id, report, label }) => (
									<option key={id} value={id}>
										{label} · Day {Math.floor(report.startAt / 1440) + 1} ·{" "}
										{report.rounds} rounds
									</option>
								))}
							</select>
						</label>
					)}
				<DayComparison
					setup={session.comparisonSetup}
					onSetupChange={session.setComparisonSetup}
					stale={session.branchStale}
					town={town}
					report={session.branchReport}
					request={session.branchRequest}
					busy={session.comparing}
					disabled={session.advancing || session.saveConflict}
					progress={session.branchProgress}
					error={session.branchError}
					selected={session.selected}
					onRun={session.compare}
					onCancel={session.cancelComparison}
				/>
			</div>
			<div hidden={section !== "recorded"}>
				<RecordedStudies />
			</div>
		</section>
	);
}

export function TownDiagnostics({
	session,
}: {
	session: ReturnType<typeof useVisitorSession>;
}) {
	const town = session.town;
	if (!town) return null;
	return (
		<>
			<TownHealth history={session.healthHistory} />
			<EvidencePanel />

			<details className="inspector-resources">
				<summary>Resources and runtime</summary>
				<h3>Shared resources</h3>
				{town.places.map((place) => (
					<div className="resource" key={place.id}>
						<span>{placeName(place)}</span>
						<span>
							{place.stock} food · {place.occupants}/{place.capacity} here
						</span>
					</div>
				))}
				<div className="sparklines">
					{Object.entries(session.trends).map(([key, values]) => {
						const min = Math.min(...values),
							range = Math.max(1, Math.max(...values) - min);
						return (
							<div className="sparkline" key={key}>
								<span>{metricLabel(key)}</span>
								<svg
									viewBox="0 0 160 30"
									role="img"
									aria-label={`${metricLabel(key)}: ${values.map(number).join(", ")}`}
								>
									<polyline
										points={values
											.map(
												(value, index) =>
													`${(index / Math.max(values.length - 1, 1)) * 160},${27 - ((value - min) / range) * 24}`,
											)
											.join(" ")}
										fill="none"
										stroke="currentColor"
										strokeWidth="2"
									/>
								</svg>
								<strong>{number(values.at(-1) ?? 0)}</strong>
							</div>
						);
					})}
				</div>
				<p className="tiny muted">
					Python Concordia runs the town. The released HF software makes
					decisions. This town runs on your device.
				</p>
				<div className="resource">
					<span>Seed</span>
					<strong>{town.seed}</strong>
				</div>
				{Object.entries(town.metrics).map(([key, value]) => (
					<div className="resource" key={key}>
						<span>{metricLabel(key)}</span>
						<strong>{number(value)}</strong>
					</div>
				))}
				{town.diagnostics.map((diagnostic) => (
					<p
						className={`diagnostic ${diagnostic.severity}`}
						key={`${diagnostic.code}-${diagnostic.message}`}
					>
						<strong>{diagnostic.code}</strong> {diagnostic.message}
					</p>
				))}
				{!town.diagnostics.length && (
					<p className="tiny muted">
						No unusual runtime behaviour was reported.
					</p>
				)}
			</details>
		</>
	);
}
