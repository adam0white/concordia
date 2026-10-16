import { useEffect, useState } from "react";
import type { Intervention, ProposalOrigin, TownView } from "../contracts";
import { datedClock } from "./format";

type DirectorReport = {
	sourceFingerprint: string;
	proposal: unknown;
	modelIds: string[];
	recordedAt: string;
};
export function recordedProposal(value: unknown): DirectorReport {
	const r = value as Record<string, unknown> | null;
	if (
		r?.schema !== "native-concordia-gm@1" ||
		r.rejection !== null ||
		!r.proposal ||
		typeof r.proposal !== "object" ||
		r.modelCalls !== 1 ||
		r.replayExact !== true ||
		typeof r.sourceFingerprint !== "string" ||
		!/^[a-f0-9]{64}$/i.test(r.sourceFingerprint) ||
		!Array.isArray(r.modelIds) ||
		!r.modelIds.every((id) => typeof id === "string") ||
		!r.modelIds.length ||
		typeof r.recordedAt !== "string"
	)
		throw Error("No validated GM situation is available.");
	return {
		proposal: r.proposal,
		sourceFingerprint: r.sourceFingerprint,
		modelIds: r.modelIds as string[],
		recordedAt: r.recordedAt,
	};
}
const authored = (cue: string) => ({
	schema: "neighbours-gm-proposal@1",
	kind: "inspection-request",
	target: "hall-annex",
	cue,
	windowMinutes: 1440,
});
export default function InspectionSituation({
	town,
	disabled,
	onAction,
	onCompare,
}: {
	town: TownView;
	disabled: boolean;
	onAction: (input: Intervention) => void;
	onCompare: (input: Intervention) => void;
}) {
	const [open, setOpen] = useState(false),
		[report, setReport] = useState<DirectorReport>(),
		[error, setError] = useState("");
	const [recipient, setRecipient] = useState(""),
		[situation, setSituation] = useState("gm");
	const [attempt, setAttempt] = useState(0);
	useEffect(() => {
		if (!open || report) return;
		const abort = new AbortController();
		setError("");
		void fetch("/experiments/gm-director.json", {
			signal: abort.signal,
			cache: attempt ? "reload" : "default",
		})
			.then(async (response) => {
				if (!response.ok)
					throw Error("The recorded GM situation could not be loaded.");
				return recordedProposal(await response.json());
			})
			.then(setReport)
			.catch((reason: unknown) => {
				if (!abort.signal.aborted)
					setError(
						reason instanceof Error
							? reason.message
							: "GM situation unavailable.",
					);
			});
		return () => abort.abort();
	}, [open, report, attempt]);
	const current = town.assistance;
	if (!town.places.some((p) => p.id === "hall" && p.open)) return null;
	const candidates = town.people.filter(
		(p) => p.lifeState !== "dead" && (p.known || p.lessons?.length),
	);
	const selected = candidates.find((p) => p.id === recipient);
	const proposal = situation === "gm" ? report?.proposal : authored(situation);
	const proposalOrigin: ProposalOrigin =
		situation === "gm" && report
			? {
					kind: "recorded-gm",
					recordedAt: report.recordedAt,
					sourceFingerprint: report.sourceFingerprint,
					modelIds: report.modelIds,
				}
			: { kind: "authored" };
	const input: Intervention = {
		kind: "request-inspection",
		proposalOrigin,
		actorId: recipient,
		proposal,
	};
	return (
		<details
			className="inspection-situation"
			open={open}
			onToggle={(event) => setOpen(event.currentTarget.open)}
		>
			<summary>
				{current?.result
					? "Annex inspection · outcome"
					: current
						? "Annex inspection · request sent"
						: "A new situation · the hall annex"}
			</summary>
			{current ? (
				<>
					<p>
						{current.result ? (
							current.result.text
						) : (
							<>
								{town.people.find((p) => p.id === current.actorId)?.name ??
									current.actorId}
								:{" "}
								{town.now >= current.expiresAt
									? "The request expired before an opening decision was completed."
									: current.visitedAt !== undefined
										? `Observed the annex at ${datedClock(current.visitedAt)}. No opening decision is complete.`
										: current.received
											? "Received the request. Whether to help is their decision."
											: "Did not receive the request."}
							</>
						)}
					</p>
					{current.visitedAt !== undefined &&
						current.cue === "unsupported" &&
						!current.opened && (
							<p className="tiny muted">
								Unknown timber or supports leave the annex closed.
							</p>
						)}
					<p className="tiny muted">
						Requested {datedClock(current.request.at)} · Deadline{" "}
						{datedClock(current.expiresAt)}
					</p>
					<details>
						<summary>Request and decision evidence</summary>
						<p className="tiny muted">
							Saved situation label:{" "}
							{current.origin.kind === "recorded-gm"
								? `Recorded Concordia GM · ${current.origin.modelIds.join(", ")} · ${current.origin.recordedAt.slice(0, 10)}`
								: "Authored control case"}
							.
						</p>
						{current.decisionSource && (
							<p className="tiny">Decision source: {current.decisionSource}</p>
						)}
						{!!current.methodTerms?.length && (
							<p className="tiny muted">
								Recorded acquired-method contribution:{" "}
								{current.methodTerms
									.reduce((sum, t) => sum + t.value, 0)
									.toFixed(3)}
								.
							</p>
						)}
					</details>
					{current.opened && <p>Four extra hall places are now available.</p>}
				</>
			) : (
				<>
					<p>
						An unused annex could add four places to the hall. Someone must
						inspect it first.
					</p>
					<details>
						<summary>Situation source and controlled cases</summary>
						<label>
							Situation
							<select
								aria-label="Situation"
								value={situation}
								onChange={(event) => setSituation(event.target.value)}
								disabled={disabled}
							>
								<option value="gm">Concordia GM proposal</option>
								<option value="dry-sound">Authored case · dry timber</option>
								<option value="wet-sound">Authored case · wet timber</option>
								<option value="unsupported">
									Authored case · uncertain supports
								</option>
							</select>
						</label>
						{situation === "gm" &&
							(!report ? (
								error ? (
									<p role="status">
										{error}{" "}
										<button
											type="button"
											onClick={() => setAttempt((n) => n + 1)}
										>
											Retry
										</button>
									</p>
								) : (
									<p role="status">Loading recorded GM proposal…</p>
								)
							) : (
								<p className="tiny muted">
									AI-generated situation · {report.modelIds.join(", ")}.
									Recorded {report.recordedAt.slice(0, 10)}. People are
									simulated locally; this browser makes no model calls.
								</p>
							))}
					</details>
					{situation === "gm" && !report && (
						<p role="status">{error || "Loading the situation…"}</p>
					)}
					<label>
						Ask a neighbour
						<select
							aria-label="Ask a neighbour"
							value={recipient}
							onChange={(event) => setRecipient(event.target.value)}
							disabled={disabled}
						>
							<option value="">Choose a neighbour</option>
							{candidates.map((p) => (
								<option value={p.id} key={p.id}>
									{p.name}
									{p.lifeState === "asleep" ? " · asleep" : ""}
									{p.lessons?.length ? " · inspection lessons received" : ""}
								</option>
							))}
						</select>
					</label>
					{selected?.canReceiveInspectionRequest === false && (
						<p className="tiny muted">
							{selected.name} is resting or heading to sleep. Ask when they are
							available.
						</p>
					)}
					<p className="tiny muted">
						A request teaches nothing and guarantees no help. One inspection
						situation per town; no original intervention is spent.
					</p>
					{proposal &&
						typeof proposal === "object" &&
						"windowMinutes" in proposal && (
							<p className="tiny muted">
								Inspection deadline if asked now:{" "}
								{datedClock(town.now + Number(proposal.windowMinutes))}.
							</p>
						)}
					<button
						type="button"
						disabled={
							disabled ||
							!selected ||
							!proposal ||
							selected.canReceiveInspectionRequest === false
						}
						onClick={() => onAction(input)}
					>
						Ask {selected?.name ?? "a neighbour"} to inspect
					</button>
					<button
						type="button"
						className="text-button"
						disabled={
							disabled ||
							!selected ||
							!proposal ||
							selected.canReceiveInspectionRequest === false
						}
						onClick={() => onCompare(input)}
					>
						Compare a day with this request ↗
					</button>
				</>
			)}
		</details>
	);
}
