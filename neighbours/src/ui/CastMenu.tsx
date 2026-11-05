export default function CastMenu({
	checkpoint: _checkpoint,
	recording: _recording,
}: {
	checkpoint: (id: string, fork?: boolean) => Promise<void>;
	recording: (allow: boolean) => Promise<void> | undefined;
}) {
	return (
		<details className="cast-menu">
			<summary>People in this town</summary>
			<p>
				Fresh towns start with newly authored people. People stored in this
				browser stay unchanged. Continuing or publishing people between games is
				unavailable in this version.
			</p>
			<p>
				A restored town keeps its saved people and history. Download the
				complete town to keep or replay it.
			</p>
		</details>
	);
}
