import { useEffect, useState } from "react";
import { shelf } from "../cast-session.ts";
import { ALLOCATION } from "../core/canonical-cast.ts";
export default function CastMenu({
	checkpoint,
	recording,
}: {
	checkpoint: (id: string, fork?: boolean) => Promise<void>;
	recording: (allow: boolean) => Promise<void> | undefined;
}) {
	const [enabled, setEnabled] = useState(shelf.enabled),
		[selected, select] = useState(ALLOCATION[0]?.castId ?? ""),
		[status, setStatus] = useState("");
	useEffect(() => {
		void shelf.ready.then(() => setEnabled(shelf.enabled));
	}, []);
	const save = (fork = false) => {
		setStatus("Checking the finished action and obligations…");
		void checkpoint(selected, fork).then(
			() =>
				setStatus(
					"Saved for another chapter. This loaded town remains pinned.",
				),
			(error) =>
				setStatus(String(error instanceof Error ? error.message : error)),
		);
	};
	return (
		<details className="cast-menu">
			<summary>People between chapters</summary>
			<fieldset>
				<legend>Browser continuity</legend>
				<label>
					<input
						type="checkbox"
						checked={enabled}
						onChange={(e) => {
							shelf.setEnabled(e.target.checked);
							setEnabled(e.target.checked);
						}}
					/>{" "}
					Keep people in this browser
				</label>
				<p className="tiny muted">
					Fresh towns admit all applicable people together. Loaded towns stay
					pinned. Unfinished work and unsupported care refuse travel. Full
					source memories stay in their source archives.
				</p>
				<label>
					Save a person{" "}
					<select value={selected} onChange={(e) => select(e.target.value)}>
						{ALLOCATION.map((p) => (
							<option key={p.castId} value={p.castId}>
								{p.name}
							</option>
						))}
					</select>
				</label>
				<button type="button" disabled={!enabled} onClick={() => save()}>
					Save finished chapter
				</button>
				<button type="button" disabled={!enabled} onClick={() => save(true)}>
					Save an explicit alternate branch
				</button>
				<p className="tiny muted">
					If the person is finishing an action, close this menu and let the town
					continue. Reopen it to see whether their chapter was saved.
				</p>
				<p role="status">{status}</p>
				<details>
					<summary>Recording carried histories</summary>
					<p>
						Continuity is separate from lab recording. A file stays local.
						Recording a shared chapter can link every carried history to this
						recording identity.
					</p>
					<button type="button" onClick={() => void recording(true)}>
						Permit recording all pinned histories
					</button>
					<button type="button" onClick={() => void recording(false)}>
						Keep this chapter local
					</button>
				</details>
				<a
					href="https://human.adamwhite.work/lab/people/"
					target="_blank"
					rel="noreferrer"
				>
					Inspect, export or delete browser people
				</a>
			</fieldset>
		</details>
	);
}
