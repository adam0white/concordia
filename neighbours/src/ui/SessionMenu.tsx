import { useEffect, useRef } from "react";
import ErrorMessage from "./ErrorMessage";
import { LabPrivacy } from "./lab";
import SessionFooter from "./SessionFooter";
import type { useVisitorSession } from "./useVisitorSession";

type Session = ReturnType<typeof useVisitorSession>;
export default function SessionMenu({
	session,
	open,
	close,
}: {
	session: Session;
	open: boolean;
	close: () => void;
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
				<h2 id="session-menu-title">Game menu</h2>
				<button type="button" onClick={close} aria-label="Close Game menu">
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
				sendRun={() => {
					// Release the native modal before the notebook opens outside it.
					dialog.current?.close();
					close();
					session.sendRun();
				}}
				comparing={
					session.comparing || session.advancing || session.commandPending
				}
				importSave={(file) => {
					return session.importSave(file);
				}}
				restoreSave={(slot) => {
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
						Another tab saved the town. Download this run to keep this version,
						or load the device town.
					</p>
					<button type="button" onClick={() => location.reload()}>
						Load device town
					</button>
				</div>
			)}
			<LabPrivacy />
			<form
				className="seed-form"
				onSubmit={(event) => {
					event.preventDefault();
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
							session.advancing ||
							session.comparing ||
							session.saveConflict ||
							session.commandPending
						}
					/>
					<button
						type="submit"
						disabled={
							session.advancing ||
							session.comparing ||
							session.saveConflict ||
							session.commandPending
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
