import { useEffect, useRef, useState } from "react";
import CastMenu from "./CastMenu";
import ErrorMessage from "./ErrorMessage";
import { LabPrivacy } from "./lab";
import { labMode } from "./lab-mode";
import type { useVisitorSession } from "./useVisitorSession";

type Session = ReturnType<typeof useVisitorSession>;
export type MenuDestination =
	| "journal"
	| "compare"
	| "studies"
	| "feedback"
	| "title";
export default function SessionMenu({
	session,
	open,
	close,
	onNavigate,
}: {
	session: Session;
	open: boolean;
	close: () => void;
	onNavigate: (destination: MenuDestination) => void;
}) {
	const dialog = useRef<HTMLDialogElement>(null);
	const [confirmNew, setConfirmNew] = useState(false);
	const diagnostics = labMode();
	const [fullscreenError, setFullscreenError] = useState("");
	useEffect(() => {
		if (open && !dialog.current?.open) dialog.current?.showModal();
		else if (!open && dialog.current?.open) dialog.current.close();
	}, [open]);
	const navigate = (destination: MenuDestination) => {
		dialog.current?.close();
		close();
		onNavigate(destination);
	};
	return (
		<dialog
			ref={dialog}
			className="session-menu"
			aria-labelledby="session-menu-title"
			onCancel={close}
			onClose={close}
		>
			<div className="session-menu-heading">
				<h2 id="session-menu-title">
					Game menu{session.town ? ` · day ${session.town.day}` : ""}
				</h2>
				<button type="button" onClick={close} aria-label="Close Game menu">
					×
				</button>
			</div>
			<div className="menu-scroll">
				<p className="tiny muted">Time pauses while this menu is open.</p>
				{diagnostics && (
					<>
						<CastMenu
							checkpoint={session.checkpointCast}
							recording={session.allowCastRecording}
						/>
						<button
							type="button"
							disabled={!session.town}
							onClick={() => navigate("journal")}
						>
							Read the journal <span aria-hidden="true">▸</span>
						</button>
						<button
							type="button"
							onClick={() =>
								document.documentElement.classList.toggle("alternate-theme")
							}
						>
							Switch light or dark colours
						</button>
						<fieldset className="menu-pacing">
							<legend>The town's pace</legend>
							<div className="segmented-control">
								{(["automatic", "slow", "steady", "fast"] as const).map(
									(mode) => (
										<button
											type="button"
											key={mode}
											aria-pressed={session.pacingMode === mode}
											onClick={() => session.setPacingMode(mode)}
										>
											{mode[0]?.toUpperCase()}
											{mode.slice(1)}
										</button>
									),
								)}
							</div>
						</fieldset>
						<h3 className="eyebrow">Studies</h3>
						<button
							type="button"
							disabled={!session.town}
							onClick={() => navigate("compare")}
						>
							Compare possible outcomes <span aria-hidden="true">▸</span>
						</button>
						<button
							type="button"
							disabled={!session.town}
							onClick={() => navigate("studies")}
						>
							Recorded studies <span aria-hidden="true">▸</span>
						</button>
					</>
				)}
				<button type="button" onClick={() => navigate("feedback")}>
					Feedback <span aria-hidden="true">▸</span>
				</button>
				<button
					type="button"
					className="fullscreen-action"
					onClick={() => {
						const request = document.fullscreenElement
							? document.exitFullscreen?.()
							: document.documentElement.requestFullscreen?.();
						if (!request)
							setFullscreenError("Full screen is unavailable in this browser.");
						void request?.catch(() =>
							setFullscreenError("Full screen is unavailable in this browser."),
						);
					}}
				>
					Full screen
				</button>
				{fullscreenError && <p role="status">{fullscreenError}</p>}
				{diagnostics && (
					<button type="button" onClick={() => navigate("title")}>
						To the title page
					</button>
				)}
				<a href="https://human.adamwhite.work/games/" target="_top">
					All games
				</a>
				{session.error && (
					<div className="error" role="alert">
						<ErrorMessage message={session.error} />
					</div>
				)}
				{session.saveConflict && (
					<div className="error" role="status">
						<p>
							Another tab saved the town. This tab is paused. Load the saved
							town to continue.
						</p>
						<button type="button" onClick={() => location.reload()}>
							Load the saved town
						</button>
					</div>
				)}
				<LabPrivacy />
				{confirmNew ? (
					<div className="new-town-confirm">
						<p>Your current town will be kept as the previous town.</p>
						<button
							type="button"
							disabled={
								session.commandPending ||
								session.saveConflict ||
								session.comparing
							}
							onClick={() => {
								session.startTown();
								setConfirmNew(false);
								close();
							}}
						>
							Start new game
						</button>
						<button type="button" onClick={() => setConfirmNew(false)}>
							Keep this town
						</button>
					</div>
				) : (
					<button
						type="button"
						disabled={
							!session.town ||
							session.saveConflict ||
							session.commandPending ||
							session.comparing
						}
						onClick={() => setConfirmNew(true)}
					>
						New game
					</button>
				)}
			</div>
			<button type="button" className="primary menu-resume" onClick={close}>
				Resume
			</button>
		</dialog>
	);
}
