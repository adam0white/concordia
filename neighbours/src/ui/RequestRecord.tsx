import type { PlayerView } from "../contracts";
import { actionWords, voicedLine } from "../core/voicing";
import { pledgePresentation } from "./current-promises";
import { datedClock } from "./format";
import { plainText } from "./plain-english";

const SAID = {
	ask: "asked",
	urge: "urged",
	promise: "made a promise and asked",
};
const STATUS: Record<string, string> = {
	held: "The request is waiting for a later decision.",
	refused: "The request was refused.",
	replaced: "A later request replaced this one.",
	dropped: "This request ended without being taken up.",
	decided:
		"A decision was recorded. This does not establish that the work started.",
	continued: "The resident continued an activity already in progress.",
	// The host links these statuses to the chosen job, which may be an alternative.
	started: "The chosen activity started. It is not recorded as finished.",
	completed: "The chosen activity finished.",
	failed: "The chosen activity failed.",
	interrupted: "The chosen activity was interrupted.",
};

/** Read retained public records only. A later choice is not a cause of a refusal. */
export default function RequestRecord({
	request,
	pledges,
}: {
	request: PlayerView["requests"][number];
	pledges: PlayerView["pledges"];
}) {
	const pledge = pledges.find((item) => item.id === request.pledgeId);
	const later = request.decision;
	const unspecified =
		later &&
		["That is not available here now.", "I cannot do that here now."].includes(
			later.says,
		);
	return (
		<div className="request-record">
			<p className="said">
				{datedClock(request.at)}: You {SAID[request.mode]} {request.targetName}{" "}
				to {actionWords(request.label)}.
			</p>
			<p>
				First answer from {request.targetName}:{" "}
				<q
					className={`voice ${request.verdict === "refused" ? "refusal" : ""}`}
				>
					{plainText(voicedLine(request))}
				</q>
			</p>
			{request.why && <p className="refusal-why">{plainText(request.why)}</p>}
			{later && (
				<p>
					Later, {datedClock(later.at)}, {request.targetName}:{" "}
					<q className="voice">{plainText(voicedLine(later))}</q>{" "}
					{plainText(
						`${request.targetName} chose to ${actionWords(later.chosenLabel)}.`,
					)}{" "}
					{unspecified && "A specific reason is not recorded here."}
				</p>
			)}
			<p>
				Recorded status:{" "}
				{STATUS[request.status] ??
					"No description is available for this recorded status."}
			</p>
			{request.result && <p className="said">{plainText(request.result)}</p>}
			{pledge && (
				<p>Current promise status: {pledgePresentation(pledge).detail}</p>
			)}
			{request.pledgeId && !pledge && (
				<p>No linked promise is retained here.</p>
			)}
		</div>
	);
}
