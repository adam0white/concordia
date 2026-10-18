import { useEffect, useRef } from "react";
import ErrorMessage from "./ErrorMessage";
import SessionFooter from "./SessionFooter";
import type { useVisitorSession } from "./useVisitorSession";

type Session = ReturnType<typeof useVisitorSession>;
export default function SessionMenu({
	session,
	open,
	close,
	storyPauses,
	setStoryPauses,
	resetStory,
}: {
	session: Session;
	open: boolean;
	close: () => void;
	storyPauses: boolean;
	setStoryPauses: (value: boolean) => void;
	resetStory: () => void;
}) {
	const dialog = useRef<HTMLDialogElement>(null);
	useEffect(() => {
		if (open && !dialog.current?.open) dialog.current?.showModal();
		else if (!open && dialog.current?.open) dialog.current.close();
	}, [open]);
	return (
		<dialog
			ref={dialog}
			className="session-menu"
			aria-labelledby="session-menu-title"
			onCancel={close}
			onClose={close}
		>
			<div className="session-menu-heading">
				<h2 id="session-menu-title">Save and town options</h2>
				<button
					type="button"
					onClick={close}
					aria-label="Close save and town options"
				>
					×
				</button>
			</div>
			<p className="tiny muted">
				Current town · Day {session.town?.day} · seed {session.town?.seed}
			</p>
			{session.advancing && (
				<div className="advance-menu-status" role="status">
					<p>{session.advanceProgress}</p>
					<button type="button" onClick={session.stopAdvancing}>
						Stop advancing
					</button>
				</div>
			)}
			<SessionFooter
				{...session}
				comparing={session.comparing || session.advancing}
				importSave={(file) => {
					resetStory();
					return session.importSave(file);
				}}
				restoreSave={(slot) => {
					resetStory();
					session.restoreSave(slot);
				}}
			/>
			{session.error && (
				<div className="error" role="alert">
					<ErrorMessage message={session.error} />
				</div>
			)}
			{session.saveConflict && (
				<div className="error" role="status">
					<p>
						Another tab saved the town. Export to keep this version, or load the
						device town.
					</p>
					<button type="button" onClick={() => location.reload()}>
						Load device town
					</button>
				</div>
			)}
			<label className="menu-story-option">
				<input
					type="checkbox"
					checked={storyPauses}
					onChange={(event) => setStoryPauses(event.target.checked)}
				/>
				Pause on new stories
			</label>
			<form
				className="seed-form"
				onSubmit={(event) => {
					event.preventDefault();
					resetStory();
					session.startTown();
				}}
			>
				<label htmlFor="town-seed">New town seed</label>
				<div>
					<input
						id="town-seed"
						type="number"
						min="0"
						max="2147483647"
						step="1"
						required
						value={session.seedInput}
						onChange={(event) => session.setSeedInput(event.target.value)}
						disabled={
							session.advancing || session.comparing || session.saveConflict
						}
					/>
					<button
						type="submit"
						disabled={
							session.advancing || session.comparing || session.saveConflict
						}
					>
						Start town
					</button>
				</div>
				<p className="tiny muted">
					Your current town is kept as the previous town.
				</p>
			</form>
		</dialog>
	);
}
