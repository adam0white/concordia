import { useEffect, useState } from "react";
import { shelf } from "../cast-session.ts";
import { ALLOCATION } from "../core/canonical-cast.ts";
export default function CastMenu({
	checkpoint,
	recording: _recording,
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
					"The person is saved for another chapter. This loaded town keeps its current people and history.",
				),
			(error) =>
				setStatus(String(error instanceof Error ? error.message : error)),
		);
	};
	return (
		<details className="cast-menu">
			<summary>People between chapters</summary>
			<fieldset>
				<legend>People saved in this browser</legend>
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
					A fresh town brings in all eligible people together. A loaded town
					keeps its saved people and history. People cannot travel with
					unfinished work or care duties the town cannot support. Their full
					earlier memories remain in the original archives.
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
					Save an alternative version
				</button>
				<p className="tiny muted">
					If the person is finishing an action, close this menu and let the town
					continue. Reopen it to see whether their chapter was saved.
				</p>
				<p role="status">{status}</p>
				<p>
					Recorded play links across games on this device. Switch recording off
					in the game menu.
				</p>
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
