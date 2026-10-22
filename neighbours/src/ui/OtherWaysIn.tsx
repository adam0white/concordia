import { useRef } from "react";
import type { useVisitorSession } from "./useVisitorSession";

type Session = ReturnType<typeof useVisitorSession>;
export type TitleActions = {
	onStart?: () => void;
	onRestore?: (slot: "previous" | "latest") => void;
	onImport?: (file: File) => void | Promise<void>;
};
export default function OtherWaysIn({
	session,
	hasSave,
	hasPrevious,
	onClose,
	onStart,
	onRestore,
	onImport,
}: TitleActions & {
	session: Session;
	hasSave: boolean;
	hasPrevious: boolean;
	onClose: () => void;
}) {
	const file = useRef<HTMLInputElement>(null);
	const busy =
		session.saveConflict || session.comparing || session.commandPending;
	return (
		<section
			className="other-ways-in sheet-overlay"
			aria-labelledby="other-ways-title"
		>
			<div className="sheet-heading">
				<h2 id="other-ways-title">Other ways in</h2>
				<button
					type="button"
					onClick={onClose}
					aria-label="Close Other ways in"
				>
					×
				</button>
			</div>
			<div className="sheet-scroll">
				{hasPrevious && (
					<button
						type="button"
						disabled={busy}
						onClick={() => (onRestore ?? session.restoreSave)("previous")}
					>
						Restore the previous town
					</button>
				)}
				{hasSave && (
					<button
						type="button"
						disabled={busy}
						onClick={() => (onRestore ?? session.restoreSave)("latest")}
					>
						Restore the autosave
					</button>
				)}
				<button
					type="button"
					disabled={busy}
					onClick={() => file.current?.click()}
				>
					Import a save (.json or .gz)
				</button>
				<input
					ref={file}
					type="file"
					hidden
					accept="application/json,application/gzip,.json,.gz"
					aria-label="Import town save"
					onChange={async (event) => {
						const input = event.currentTarget;
						const selected = input.files?.[0];
						if (selected) await (onImport ?? session.importSave)(selected);
						input.value = "";
					}}
				/>
				<form
					className="seed-form"
					onSubmit={(event) => {
						event.preventDefault();
						(onStart ?? session.startTown)();
					}}
				>
					<label htmlFor="town-seed">Start from a seed</label>
					<input
						id="town-seed"
						type="number"
						min="0"
						max="2147483647"
						step="1"
						required
						value={session.seedInput}
						onChange={(event) => session.setSeedInput(event.target.value)}
						disabled={busy}
					/>
					<p className="tiny muted">
						Your current town is kept as the previous town.
					</p>
					<button type="submit" disabled={busy}>
						Start
					</button>
				</form>
			</div>
		</section>
	);
}
