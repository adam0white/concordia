import { useState } from "react";
import type { useVisitorSession } from "./useVisitorSession";

/** Device copies only; native packets and ownership receipts stay inside persistence. */
export default function SavedTowns({
	session,
}: {
	session: ReturnType<typeof useVisitorSession>;
}) {
	const [name, setName] = useState("");
	const [choice, setChoice] = useState<{ key: string; name: string }>();
	const disabled =
		session.slotBusy ||
		session.saveConflict ||
		session.commandPending ||
		!session.town;
	return (
		<details
			onToggle={(event) => {
				if (event.currentTarget.open) session.listNamedTowns();
			}}
		>
			<summary>Saved towns</summary>
			<p>
				Named copies stay on this device. They do not synchronize a shared town.
			</p>
			<form
				onSubmit={(event) => {
					event.preventDefault();
					void session.saveNamedTown(name);
				}}
			>
				<label htmlFor="town-copy-name">Town copy name</label>
				<input
					id="town-copy-name"
					value={name}
					maxLength={120}
					required
					disabled={disabled}
					onChange={(event) => setName(event.target.value)}
				/>
				<button type="submit" disabled={disabled || !name.trim()}>
					Save named copy
				</button>
			</form>
			<ul>
				{session.namedTowns.map((copy) => (
					<li key={copy.key}>
						<span>
							{copy.name} · {new Date(copy.savedAt).toLocaleString()}
						</span>{" "}
						<button
							type="button"
							disabled={disabled}
							onClick={() => setChoice(copy)}
						>
							Load {copy.name}
						</button>
					</li>
				))}
			</ul>
			{choice && (
				<fieldset aria-label="Confirm saved town load">
					<p>
						Replace the active device town with {choice.name}? Your current town
						will be kept as the previous town.
					</p>
					<button
						type="button"
						disabled={disabled}
						onClick={() => {
							void session.loadNamedTown(choice.key);
							setChoice(undefined);
						}}
					>
						Replace active town
					</button>
					<button
						type="button"
						disabled={session.slotBusy}
						onClick={() => setChoice(undefined)}
					>
						Keep active town
					</button>
				</fieldset>
			)}
			{session.slotBusy && (
				<p role="status">Preparing the complete town checkpoint…</p>
			)}
			{session.slotNotice && <p role="status">{session.slotNotice}</p>}
		</details>
	);
}
