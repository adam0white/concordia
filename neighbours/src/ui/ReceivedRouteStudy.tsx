import { useEffect, useState } from "react";

interface RouteResult {
	arm: string;
	chosen: string;
	refusal?: { goalProgress: number; feasibleAfter: boolean };
}
interface RouteCase {
	framework: string;
	domain: string;
	parameters: unknown;
	results: RouteResult[];
}
interface RouteReport {
	schema: "received-route-study@1";
	recordedAt: string;
	commit: string;
	dirty: boolean;
	execution: string;
	sources: Record<string, string>;
	limits: string[];
	cases: RouteCase[];
}
const object = (x: unknown): Record<string, unknown> =>
	x !== null && typeof x === "object" && !Array.isArray(x)
		? (x as Record<string, unknown>)
		: {};
export function receivedRouteReport(value: unknown): RouteReport {
	const r = object(value);
	if (
		r.schema !== "received-route-study@1" ||
		typeof r.recordedAt !== "string" ||
		typeof r.commit !== "string" ||
		typeof r.dirty !== "boolean" ||
		typeof r.execution !== "string" ||
		!Object.keys(object(r.sources)).length ||
		!Object.values(object(r.sources)).every(
			(value) => typeof value === "string",
		) ||
		!Array.isArray(r.limits) ||
		!r.limits.every((x) => typeof x === "string") ||
		!Array.isArray(r.cases) ||
		r.cases.length < 1 ||
		r.cases.length > 2 ||
		r.cases.some((value) => {
			const c = object(value);
			return (
				typeof c.domain !== "string" ||
				typeof c.framework !== "string" ||
				!Array.isArray(c.results) ||
				c.results.length < 1 ||
				c.results.length > 9 ||
				c.results.some((value) => {
					const row = object(value);
					const refusal = object(row.refusal);
					return (
						typeof row.arm !== "string" ||
						typeof row.chosen !== "string" ||
						!["ask", "direct"].includes(row.chosen) ||
						(row.refusal !== undefined &&
							(typeof refusal.goalProgress !== "number" ||
								typeof refusal.feasibleAfter !== "boolean"))
					);
				})
			);
		})
	)
		throw Error("Invalid received-route recording");
	return value as RouteReport;
}
const names: Record<string, string> = {
	useful: "Useful access",
	late: "Late access",
	costly: "Costly access",
	uncertain: "Uncertain access",
	withheld: "Information withheld",
	removed: "Information removed",
	"goal-removed": "Goal removed",
	"temporal-off": "Time valuation disabled",
	refused: "Request refused",
};
export function ReceivedRouteResults({
	report,
	domain,
}: {
	report: RouteReport;
	domain: number;
}) {
	const trial = report.cases[domain];
	if (!trial) return null;
	return (
		<section aria-label="Received future access study">
			<h3>Can learning about an opportunity make asking useful?</h3>
			<p className="tiny muted">
				Recorded control · HF {trial.framework} ·{" "}
				{report.recordedAt.slice(0, 10)}. Separate from your town.
			</p>
			<p>
				Direct work takes three hours. A successful request may allow twenty
				minutes of work after a short wait.
			</p>
			<div className="table-scroll">
				<table>
					<thead>
						<tr>
							<th>Condition</th>
							<th>Observed choice</th>
							<th>Recorded outcome</th>
						</tr>
					</thead>
					<tbody>
						{trial.results.map((row) => (
							<tr key={row.arm}>
								<th>{names[row.arm] ?? row.arm}</th>
								<td>
									{row.chosen === "ask" ? "Chose to ask" : "Chose direct work"}
								</td>
								<td>
									{row.refusal
										? `${row.refusal.goalProgress === 0 ? "No goal progress" : `Goal progress ${row.refusal.goalProgress}`} · ${row.refusal.feasibleAfter ? "The request remains possible" : "The request is no longer possible"}`
										: "Not simulated"}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<p className="tiny muted">
				A request is a choice, not a completed repair. Without the goal, asking
				can still be chosen because it costs less than direct work.
			</p>
			<details>
				<summary>Method, parameters and original measurements</summary>
				{report.limits.map((limit) => (
					<p className="tiny muted" key={limit}>
						{limit}
					</p>
				))}
				<p className="tiny checkpoint-hash">
					Source {report.commit}
					{report.dirty ? " · source files modified" : " · source files clean"}
				</p>
				<pre>{JSON.stringify(trial.parameters, null, 2)}</pre>
				<a href="./experiments/received-routes.json" download>
					Download full report ↓
				</a>
			</details>
		</section>
	);
}
export default function ReceivedRouteStudy() {
	const [report, setReport] = useState<RouteReport>();
	const [error, setError] = useState(false);
	const [domain, setDomain] = useState(0);
	useEffect(() => {
		const controller = new AbortController();
		fetch("./experiments/received-routes.json", { signal: controller.signal })
			.then(async (r) => {
				if (!r.ok) throw Error("Unavailable");
				setReport(receivedRouteReport(await r.json()));
			})
			.catch((e) => {
				if (e.name !== "AbortError") setError(true);
			});
		return () => controller.abort();
	}, []);
	if (!report)
		return (
			<p role="status">
				{error
					? "The recorded opportunity study is unavailable. No result has been verified here."
					: "Loading opportunity study…"}
			</p>
		);
	return (
		<>
			<label>
				Control setting
				<select
					value={domain}
					onChange={(e) => setDomain(Number(e.target.value))}
				>
					{report.cases.map((c, i) => (
						<option value={i} key={c.domain}>
							{c.domain === "parcel"
								? "Parcel delivery"
								: "Sample cooling · same structure"}
						</option>
					))}
				</select>
			</label>
			<ReceivedRouteResults report={report} domain={domain} />
		</>
	);
}
