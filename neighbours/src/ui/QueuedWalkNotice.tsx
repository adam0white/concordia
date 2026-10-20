import type { TownView } from "../contracts";

/** Read accepted host jobs only; local clicks cannot invent a journey. */
export default function QueuedWalkNotice({
	town,
	playing,
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
	if (playing || advancing || !job) return null;
	const starting = town.now === job.departedAt;
	if (job.kind === "work")
		return (
			<span role="status">
				{starting
					? "Press Play to begin your hour"
					: "Press Play to continue your hour"}
			</span>
		);
	return (
		<span role="status">
			{starting ? "Press Play to set off" : "Press Play to keep walking"}
		</span>
	);
}
