import { useEffect, useRef, useState } from "react";
import ErrorMessage from "./ErrorMessage";
import { LabPrivacy, useLabRecording } from "./lab";
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
	const [note, setNote] = useState("");
	const [verdict, setVerdict] = useState("");
	const [sending, setSending] = useState(false);
	const [sent, setSent] = useState(false);
	const [noteOnly, setNoteOnly] = useState(false);
	const [error, setError] = useState("");
	const feedbackError = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (error || session.error)
			feedbackError.current?.scrollIntoView({ block: "nearest" });
	}, [error, session.error]);
	const { switchedOff, privacySignalOn } = useLabRecording();

	const submit = async () => {
		if (sending) return;
		setSending(true);
		setError("");
		const text = [verdict ? `Verdict: ${verdict}` : "", note.trim()]
			.filter(Boolean)
			.join("\n\n");
		const trimmedName = name.trim().slice(0, 60);
		try {
			const onlyNote = await session.sendFeedback(text, trimmedName);
			setNoteOnly(onlyNote);
			try {
				if (trimmedName) localStorage.setItem(NAME_KEY, trimmedName);
				else localStorage.removeItem(NAME_KEY);
			} catch {
				/* Sending works without local storage. */
			}
			setSent(true);
		} catch (failure) {
			setError(
				failure instanceof Error
					? failure.message
					: "Your word could not be sent. Please try again.",
			);
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
				<h2 id="send-word-title">Send word</h2>
				<button type="button" onClick={onClose} aria-label="Close Send word">
					×
				</button>
			</div>
			<div className="sheet-scroll">
				{sent ? (
					<p role="status">
						{noteOnly
							? "Note queued without a run or history linkage."
							: "Note queued. An available run may also be included."}{" "}
						This is not a delivery receipt.
					</p>
				) : (
					<>
						<p>
							{switchedOff
								? "Recording is off. Send includes only your note and verdict, without history linkage."
								: privacySignalOn
									? "Your browser asks for privacy. Send includes only your note and verdict, without history linkage."
									: "Send your note. A run is included only when recording this exact chapter is permitted."}
						</p>
						{switchedOff && <LabPrivacy />}
						<details>
							<summary>Recording carried histories</summary>
							<p>
								Notes need no recording permission. Recording a shared chapter
								can link every carried history. Files stay local.
							</p>
							<button
								type="button"
								onClick={() =>
									void session
										.allowCastRecording(true)
										?.catch((failure) => setError(String(failure)))
								}
							>
								Permit recording all pinned histories
							</button>
							<button
								type="button"
								onClick={() =>
									void session
										.allowCastRecording(false)
										?.catch((failure) => setError(String(failure)))
								}
							>
								Keep this chapter local
							</button>
						</details>
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
							What happened in the town, what you wanted, what got in the way.
						</label>
						<textarea
							id="feedback-note"
							rows={4}
							value={note}
							onChange={(event) => setNote(event.target.value)}
						/>
						<details className="feedback-name">
							<summary>+ Add a name</summary>
							<label htmlFor="feedback-name">Your name or tester id</label>
							<input
								id="feedback-name"
								type="text"
								maxLength={60}
								autoComplete="off"
								value={name}
								onChange={(event) => setName(event.target.value)}
							/>
							<p className="tiny muted">
								Optional. This name labels your player id and its past and
								future history on this device. Leave it empty to stay
								pseudonymous.
							</p>
						</details>
						<details className="feedback-preview">
							<summary>What is sent</summary>
							<p>
								{privacySignalOn
									? "Your note and a copy of this run, including its seed, choices, saves and log."
									: "Your note links to this device's recorded run, saves and log."}
							</p>
							<p>
								Current town:{" "}
								{session.town
									? `day ${session.town.day} · seed ${session.town.seed}`
									: "No town has started."}
							</p>
							{verdict && <p>Verdict: {verdict}</p>}
							{note.trim() && <blockquote>{note.trim()}</blockquote>}
							<a href="https://human.adamwhite.work/lab/privacy/">
								Lab privacy
							</a>
						</details>
					</>
				)}
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
					{sent ? "Back to the game" : sending ? "Sending…" : "Send"}
				</button>
			</div>
		</section>
	);
}
