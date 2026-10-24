import { useEffect, useState } from "react";
import BenchStudy from "./BenchStudy";
import Comparison from "./Comparison";
import ReceivedRouteStudy from "./ReceivedRouteStudy";
import { projectStudy, type StudyKind, studySpecs } from "./recorded-studies";

function SavedStudy({ kind }: { kind: StudyKind }) {
	const [result, setResult] = useState<ReturnType<typeof projectStudy>>();
	const [error, setError] = useState(false);
	useEffect(() => {
		const controller = new AbortController();
		const spec = studySpecs[kind];
		fetch(`./experiments/${spec.file}.json`, { signal: controller.signal })
			.then(async (response) => {
				if (!response.ok) throw Error("Report unavailable");
				setResult(projectStudy(kind, await response.json()));
			})
			.catch((error) => {
				if (error.name !== "AbortError") setError(true);
			});
		return () => controller.abort();
	}, [kind]);
	return (
		<section aria-label={studySpecs[kind].question}>
			<h3>{studySpecs[kind].question}</h3>
			{!result ? (
				<p role="status">
					{error
						? "Recorded study unavailable. No result verified here."
						: "Loading recorded study…"}
				</p>
			) : (
				<>
					<p className="tiny muted">
						Historical recording · {result.recordedAt}. Separate from your town;
						source identity has not been matched to this live build.
					</p>
					<dl className="study-results">
						{result.rows.map(([name, value]) => (
							<div key={name}>
								<dt>{name}</dt>
								<dd>{value}</dd>
							</div>
						))}
					</dl>
					<details>
						<summary>Source, limits and original measurements</summary>
						<p className="tiny checkpoint-hash">
							Recorded source / input SHA-256: {result.source}
						</p>
						{result.limits.map((limit) => (
							<p className="tiny muted" key={limit}>
								{limit}
							</p>
						))}
						<a href={`./experiments/${studySpecs[kind].file}.json`} download>
							Download full report ↓
						</a>
					</details>
				</>
			)}
		</section>
	);
}
export default function RecordedStudies() {
	const [kind, setKind] = useState<
		"inspection" | "routes" | "bench" | StudyKind
	>("inspection");
	return (
		<section className="recorded-studies" aria-label="Recorded studies">
			<p>
				Choose a question. These recorded controls do not measure your town.
			</p>
			<label>
				Study
				<select
					value={kind}
					onChange={(event) => setKind(event.target.value as typeof kind)}
				>
					<option value="inspection">
						Learned cues · HF, table, random and LLM choices
					</option>
					<option value="bench">
						Town bench access · recorded repair and Nora’s work
					</option>
					<option value="routes">
						Future access · asking and consequences
					</option>
					<option value="cart">Rafi’s cart · goal intact or removed</option>
					<option value="native">
						One LLM neighbour · original run and replay
					</option>
					<option value="gm">GM annex proposal · physical effect</option>
					<option value="bench-gm">Concordia GM · typed bench premises</option>
				</select>
			</label>
			{kind === "bench" ? (
				<BenchStudy />
			) : kind === "routes" ? (
				<ReceivedRouteStudy />
			) : kind === "inspection" ? (
				<Comparison />
			) : (
				<SavedStudy key={kind} kind={kind} />
			)}
		</section>
	);
}
