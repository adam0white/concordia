import { useRef } from "react";
import type { useVisitorSession } from "./useVisitorSession";

type Session = ReturnType<typeof useVisitorSession>;
type Props = Pick<
	Session,
	| "saved"
	| "hasPrevious"
	| "hasSave"
	| "comparing"
	| "saveConflict"
	| "downloadUrl"
	| "downloadLabel"
	| "restoreSave"
	| "exportSave"
	| "sendRun"
	| "importSave"
>;
export default function SessionFooter({
	saved,
	hasPrevious,
	hasSave,
	comparing,
	saveConflict,
	downloadUrl,
	downloadLabel,
	restoreSave,
	exportSave,
	sendRun,
	importSave,
}: Props) {
	const file = useRef<HTMLInputElement>(null);
	return (
		<footer className="session-footer">
			<span>Neighbours · A live town, on your device.</span>
			<div className="session-actions">
				<span className="save-status">{saved}</span>
				{hasPrevious && (
					<button
						type="button"
						disabled={comparing || saveConflict}
						onClick={() => restoreSave("previous")}
					>
						Restore previous town
					</button>
				)}
				{hasSave && (
					<button
						type="button"
						disabled={comparing || saveConflict}
						onClick={() => restoreSave("latest")}
					>
						Restore autosave
					</button>
				)}
				<button type="button" disabled={comparing} onClick={sendRun}>
					Send this run to the notebook
				</button>
				<button type="button" disabled={comparing} onClick={exportSave}>
					Download this run
				</button>
				<button
					type="button"
					disabled={comparing || saveConflict}
					onClick={() => file.current?.click()}
				>
					Import
				</button>
				{downloadUrl && (
					<a
						className="download-save"
						href={downloadUrl}
						download="alder-quay-save.json.gz"
					>
						Download save ↓ <span className="tiny">({downloadLabel})</span>
					</a>
				)}
				<input
					ref={file}
					disabled={comparing || saveConflict}
					type="file"
					accept="application/json,application/gzip,.json,.gz"
					hidden
					aria-label="Import town save"
					onChange={async (e) => {
						const input = e.currentTarget;
						const selectedFile = input.files?.[0];
						if (!selectedFile) return;
						await importSave(selectedFile);
						input.value = "";
					}}
				/>
			</div>
		</footer>
	);
}
