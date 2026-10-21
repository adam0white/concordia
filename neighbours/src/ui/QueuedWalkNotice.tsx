import type { TownView } from "../contracts";

/** Read accepted host jobs only; local clicks cannot invent a journey. */
export default function QueuedWalkNotice({
	town,
	advancing,
	pending = false,
}: {
	town: TownView;
	playing: boolean;
	advancing: boolean;
	pending?: boolean;
}) {
	if (pending)
		return (
			<span role="status" aria-busy="true">
				Requesting your action…
			</span>
		);
	const job = town.player?.job;
	if (advancing || !job) return null;
	const starting = town.now === job.departedAt;
	if (job.kind === "work")
		return (
			<span role="status">
				{starting
					? "Your hour starts automatically"
					: "Your hour continues automatically"}
			</span>
		);
	return (
		<span role="status">
			{starting
				? "You set off automatically"
				: "You keep walking automatically"}
		</span>
	);
}
