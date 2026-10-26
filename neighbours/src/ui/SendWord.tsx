import { FEEDBACK_LABELS, type FeedbackLabel } from "@adam0white/lab-client";
import { useEffect, useRef, useState } from "react";
import ErrorMessage from "./ErrorMessage";
import { useLabRecording } from "./lab";
import { labMode } from "./lab-mode";
import type { useVisitorSession } from "./useVisitorSession";

type Session = ReturnType<typeof useVisitorSession>;
const NAME_KEY = "hf-lab-feedback-name";
const verdicts = [
	{ label: "I'd keep playing", value: "keep" },
	{ label: "Not sure", value: "mixed" },
	{ label: "I'd stop here", value: "quit" },
] as const;
function rememberedName() {
	try {
		return localStorage.getItem(NAME_KEY) ?? "";
	} catch {
		return "";
	}
}
export default function SendWord({
	session,
	onClose,
}: {
	session: Session;
	onClose: () => void;
}) {
	const [name, setName] = useState(rememberedName);
	const copyRequested = useRef(false);
	const download = useRef<HTMLAnchorElement>(null);
	useEffect(() => {
		if (session.downloadUrl && copyRequested.current) {
			copyRequested.current = false;
			download.current?.click();
		}
	}, [session.downloadUrl]);
	const [sharePlay, setSharePlay] = useState(false);
	const [note, setNote] = useState("");
	const [feedbackLabel, setFeedbackLabel] = useState<FeedbackLabel | null>(
		null,
	);
	const [verdict, setVerdict] = useState("");
	const [sending, setSending] = useState(false);
	const [sent, setSent] = useState(false);
	const [error, setError] = useState("");
	const feedbackError = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (error || session.error)
			feedbackError.current?.scrollIntoView({ block: "nearest" });
	}, [error, session.error]);
	const { telemetryOn } = useLabRecording();

	const submit = async () => {
		if (sending) return;
		setSending(true);
		setError("");
		const text = [
			feedbackLabel ? FEEDBACK_LABELS[feedbackLabel] : "",
			verdict ? `Verdict: ${verdict}` : "",
			note.trim(),
		]
			.filter(Boolean)
			.join("\n\n");
		const trimmedName = name.trim().slice(0, 60);
		try {
			await session.sendFeedback(text, trimmedName, sharePlay);
			try {
				if (trimmedName) localStorage.setItem(NAME_KEY, trimmedName);
				else localStorage.removeItem(NAME_KEY);
			} catch {
				/* Sending works without local storage. */
			}
			setSent(true);
		} catch (failure) {
			console.error("Feedback failed", failure);
			setError("Your feedback could not be sent. Please try again.");
		} finally {
			setSending(false);
		}
	};
	return (
		<section
			className="send-word sheet-overlay"
			aria-labelledby="send-word-title"
		>
			<div className="sheet-heading">
				<h2 id="send-word-title">Feedback</h2>
				<button type="button" onClick={onClose} aria-label="Close Feedback">
					×
				</button>
			</div>
			<div className="sheet-scroll">
				{sent ? (
					<p role="status">Sent. Your note is stored.</p>
				) : (
					<>
						{!telemetryOn && (
							<label>
								<input
									type="checkbox"
									checked={sharePlay}
									onChange={(event) => setSharePlay(event.target.checked)}
								/>{" "}
								Share this run and my play with the lab
							</label>
						)}
						<fieldset
							className="feedback-verdicts"
							aria-label="What is happening?"
						>
							{(Object.keys(FEEDBACK_LABELS) as FeedbackLabel[]).map(
								(label) => (
									<button
										type="button"
										key={label}
										aria-pressed={feedbackLabel === label}
										onClick={() =>
											setFeedbackLabel(feedbackLabel === label ? null : label)
										}
									>
										{FEEDBACK_LABELS[label]}
									</button>
								),
							)}
						</fieldset>
						<fieldset
							className="feedback-verdicts"
							aria-label="Would you keep playing?"
						>
							{verdicts.map((choice) => (
								<button
									type="button"
									key={choice.value}
									aria-pressed={verdict === choice.value}
									onClick={() =>
										setVerdict(verdict === choice.value ? "" : choice.value)
									}
								>
									{choice.label}
								</button>
							))}
						</fieldset>
						<label className="feedback-note" htmlFor="feedback-note">
							What happened? What did you want to do? What got in the way?
						</label>
						<textarea
							id="feedback-note"
							rows={4}
							value={note}
							onChange={(event) => setNote(event.target.value)}
						/>
						<details className="feedback-name">
							<summary>+ Add a name</summary>
							<label htmlFor="feedback-name">Your name (optional)</label>
							<input
								id="feedback-name"
								type="text"
								maxLength={60}
								autoComplete="off"
								value={name}
								onChange={(event) => setName(event.target.value)}
							/>
							<p className="tiny muted">
								This name is optional. It labels your feedback and recorded
								history on this device.
							</p>
						</details>
						<details className="feedback-preview">
							<summary>What is sent</summary>
							<p>
								{(!telemetryOn && !sharePlay) || !session.town
									? "The lab receives your note and verdict without a game run or saved state."
									: "The lab receives your note and an available run. The run includes saved character state and records of where the replay came from. Recorded play links across games on this device."}
							</p>
							<p>
								Current town:{" "}
								{session.town
									? `Day ${session.town.day}${labMode() ? ` · seed ${session.town.seed}` : ""}`
									: "No town has started."}
							</p>
							{feedbackLabel && <p>{FEEDBACK_LABELS[feedbackLabel]}</p>}
							{verdict && <p>Verdict: {verdict}</p>}
							{note.trim() && <blockquote>{note.trim()}</blockquote>}
							<a href="https://human.adamwhite.work/lab/privacy/">
								Lab privacy
							</a>
						</details>
					</>
				)}
				{labMode() && (
					<>
						<button
							type="button"
							onClick={() => {
								copyRequested.current = true;
								session.exportSave();
							}}
							disabled={!session.town || session.commandPending}
						>
							Keep a copy of this run
						</button>
						{session.downloadUrl && (
							<a
								ref={download}
								className="download-save"
								href={session.downloadUrl}
								download="alder-quay-save.json.gz"
							>
								Download save ↓{" "}
								<span className="tiny">({session.downloadLabel})</span>
							</a>
						)}
					</>
				)}
				{(error || session.error) && (
					<div className="error" role="alert" ref={feedbackError}>
						{error && <p>{error}</p>}
						{session.error && session.error !== error && (
							<ErrorMessage message={session.error} />
						)}
					</div>
				)}
			</div>
			<div className="action-bar">
				<button
					type="button"
					className="primary"
					disabled={!sent && sending}
					onClick={
						sent
							? onClose
							: () => {
									void submit();
								}
					}
				>
					{sent ? "Back to the game" : sending ? "Sending…" : "Submit"}
				</button>
			</div>
		</section>
	);
}
