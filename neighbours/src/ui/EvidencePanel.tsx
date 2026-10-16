import { useEffect, useState } from "react";

type EvidenceKind = "social" | "native" | "cart" | "release" | "gm" | "config";
interface EvidenceSummary {
	rows: [string, string][];
	limits: string[];
}
const reports: {
	kind: EvidenceKind;
	title: string;
	url: string;
	schema?: string;
}[] = [
	{
		kind: "social",
		title: "Social episode measurements",
		url: "/experiments/social-episodes.json",
		schema: "neighbours/evening-profile@1",
	},
	{
		kind: "native",
		title: "Native run with one LLM neighbour",
		url: "/experiments/native-mixed-town.json",
		schema: "native-mixed-town@1",
	},
	{
		kind: "cart",
		title: "Ravi’s cart choice probe",
		url: "/experiments/cart-choice-probe.json",
		schema: "neighbours/cart-choice-probe@1",
	},
	{
		kind: "gm",
		title: "Concordia game-master proposal",
		url: "/experiments/gm-director.json",
		schema: "native-concordia-gm@1",
	},
	{
		kind: "config",
		title: "HF configuration sensitivity",
		url: "/experiments/hf-config.json",
		schema: "neighbours/hf-config-probe@1",
	},
	{ kind: "release", title: "Published build metadata", url: "/release.json" },
];
function record(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}
function scalar(value: unknown): string {
	return typeof value === "string" && value.length > 0
		? value
		: typeof value === "number" && Number.isFinite(value)
			? String(value)
			: "Not recorded";
}
const yesNo = (value: unknown) =>
	value === true ? "Yes" : value === false ? "No" : "Not recorded";

/** A projection of recorded reports. It never certifies the current live town. */
export function summarizeEvidence(
	kind: EvidenceKind,
	value: unknown,
): EvidenceSummary {
	const data = record(value);
	const spec = reports.find((report) => report.kind === kind);
	if (spec?.schema && data.schema !== spec.schema)
		throw Error("Unexpected evidence format");
	if (kind === "release" && typeof data.commit !== "string")
		throw Error("Missing build identity");
	const rows: [string, string][] = [
		["Recorded at", scalar(data.recordedAt)],
		["Runtime", scalar(data.runtime)],
	];
	const rawLimits = data.limitations ?? data.limits;
	const limits = Array.isArray(rawLimits)
		? rawLimits.filter((item): item is string => typeof item === "string")
		: [];
	const args = record(data.arguments);
	if (kind === "social") {
		const results = Array.isArray(data.results) ? data.results.map(record) : [];
		const statuses = results.map(
			(result) => record(result.restoredContinuation).passed,
		);
		rows.push(
			["Population per town", scalar(args.population)],
			[
				"Seeds",
				Array.isArray(args.seeds)
					? args.seeds.map(scalar).join(", ")
					: "Not recorded",
			],
			["Simulated days per town", scalar(args.days)],
			[
				"Restored continuation",
				statuses.length
					? `${statuses.filter((status) => status === true).length} passed; ${statuses.filter((status) => status === false).length} failed; ${statuses.filter((status) => typeof status !== "boolean").length} unreported`
					: "Not recorded",
			],
			["Source SHA-256", scalar(data.sourceFingerprint)],
		);
	}
	if (kind === "native") {
		rows.push(
			["Population", scalar(data.population)],
			[
				"HF / LLM controllers",
				`${scalar(data.hfControllers)} / ${scalar(data.llmControllers)}`,
			],
			["Seed", scalar(record(record(data.initialCheckpoint).runtime).seed)],
			["Rounds", scalar(data.rounds)],
			["Real model decisions", scalar(data.modelDecisions)],
			["Replay exact", yesNo(data.replayExact)],
			["Replay model calls", scalar(data.replayModelCalls)],
			["Source SHA-256", scalar(record(data.runtimeSources).sha256)],
		);
	}
	if (kind === "cart") {
		const opportunity = record(data.opportunity);
		rows.push(
			["Seed", scalar(data.seed)],
			["Ravi decisions examined", scalar(data.raviDecisions)],
			["Actual choice", scalar(record(opportunity.baseline).chosen)],
			[
				"Choice with cart goal removed",
				scalar(record(opportunity.goalAblated).chosen),
			],
			["Input checkpoint SHA-256", scalar(data.inputSha256)],
			[
				"Source identity",
				`${Object.keys(record(data.sources)).length} file hashes in the full report`,
			],
		);
	}
	if (kind === "gm")
		rows.push(
			["Actual model calls", scalar(data.modelCalls)],
			[
				"Model",
				Array.isArray(data.modelIds)
					? data.modelIds.map(scalar).join(", ")
					: "Not recorded",
			],
			["Proposal accepted", yesNo(data.rejection === null && !!data.proposal)],
			["Replay exact", yesNo(data.replayExact)],
			["Replay model calls", scalar(data.replayModelCalls)],
			["Upstream revision", scalar(data.upstreamSha)],
			["Source SHA-256", scalar(data.sourceFingerprint)],
		);
	if (kind === "config")
		rows.push(
			["HF version", scalar(data.hf)],
			[
				"Isolated settings",
				Array.isArray(data.arms)
					? data.arms.map((arm) => scalar(record(arm).socialScale)).join(", ")
					: "Not recorded",
			],
			[
				"Training seeds",
				Array.isArray(record(data.seeds).training)
					? (record(data.seeds).training as unknown[]).map(scalar).join(", ")
					: "Not recorded",
			],
			[
				"Holdout seeds",
				Array.isArray(record(data.seeds).holdout)
					? (record(data.seeds).holdout as unknown[]).map(scalar).join(", ")
					: "Not recorded",
			],
			["Days per ordinary town", scalar(data.days)],
			["Production weights", "Unchanged; this is a sensitivity probe"],
			["Source SHA-256", scalar(data.sourceFingerprint)],
		);

	if (kind === "release") {
		rows.splice(0, 1);
		rows.push(
			["Build commit", scalar(data.commit)],
			["Uncommitted source changes at build", yesNo(data.dirty)],
			["HF version", scalar(data.hf)],
			["Python bundle SHA-256", scalar(data.pythonBundle)],
		);
		limits.push(
			"Build metadata identifies this published snapshot. It does not certify that the recorded reports used this build.",
		);
	}
	return { rows, limits };
}
type LoadedReport = {
	kind: EvidenceKind;
	summary?: EvidenceSummary;
	error?: string;
};

export default function EvidencePanel() {
	const [open, setOpen] = useState(false);
	const [loaded, setLoaded] = useState<LoadedReport[]>();
	useEffect(() => {
		if (!open || loaded) return;
		const abort = new AbortController();
		void Promise.allSettled(
			reports.map(async (report): Promise<LoadedReport> => {
				const response = await fetch(report.url, { signal: abort.signal });
				if (!response.ok) throw Error(`HTTP ${response.status}`);
				return {
					kind: report.kind,
					summary: summarizeEvidence(report.kind, await response.json()),
				};
			}),
		).then((results) => {
			if (abort.signal.aborted) return;
			setLoaded(
				reports.map((report, index) => {
					const result = results[index];
					if (result?.status === "fulfilled") return result.value;
					return {
						kind: report.kind,
						error:
							result?.status === "rejected" && result.reason instanceof Error
								? result.reason.message
								: "Could not read this report",
					};
				}),
			);
		});
		return () => abort.abort();
	}, [open, loaded]);
	return (
		<details
			className="recorded-evidence"
			open={open}
			onToggle={(event) => setOpen(event.currentTarget.open)}
		>
			<summary>Recorded evidence and evaluation limits</summary>
			{open && (
				<section aria-label="Capabilities in use">
					<h3>Capabilities in use</h3>
					<p>
						Concordia runs observation, choice validation, physical resolution
						and checkpoints through a custom deterministic engine.
					</p>
					<p>
						HF supplies needs, attention, social memory, promises, purposes and
						acquired inspection examples.
					</p>
					<p className="tiny muted">
						The public browser does not call an LLM. Concordia’s generative
						game-master components are not active here. The native
						mixed-controller experiment below is a separate recorded run.
					</p>
				</section>
			)}
			<p>
				These reports are recorded evidence from separate runs. They do not
				measure the live town on this device. They do not establish HF
				superiority or human realism, and their source hashes have not been
				matched to this live build.
			</p>
			{open && !loaded && <p role="status">Loading recorded evidence…</p>}
			{open &&
				reports.map((report) => {
					const result = loaded?.find((item) => item.kind === report.kind);
					return (
						<section key={report.kind} aria-label={report.title}>
							<h3>{report.title}</h3>
							{result?.error && (
								<p role="status">
									Report unavailable: {result.error}. No result is verified
									here.
								</p>
							)}
							{result?.summary && (
								<>
									<table>
										<tbody>
											{result.summary.rows.map(([label, value]) => (
												<tr key={label}>
													<th scope="row">{label}</th>
													<td style={{ overflowWrap: "anywhere" }}>{value}</td>
												</tr>
											))}
										</tbody>
									</table>
									{result.summary.limits.length > 0 && (
										<ul>
											{result.summary.limits.map((limit) => (
												<li key={limit}>{limit}</li>
											))}
										</ul>
									)}
								</>
							)}
							<p>
								<a href={report.url} download>
									Download full report
								</a>
							</p>
						</section>
					);
				})}
			{loaded?.some((report) => report.error) && (
				<button type="button" onClick={() => setLoaded(undefined)}>
					Retry reports
				</button>
			)}
			<p>
				<a
					href="https://github.com/adam0white/concordia/actions?query=branch%3Aneighbours"
					target="_blank"
					rel="noreferrer"
				>
					CI runs for the neighbours branch ↗
				</a>
			</p>
		</details>
	);
}
