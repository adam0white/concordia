import { useEffect, useState } from "react";
import { labMode } from "./lab-mode";
import OtherWaysIn, { type TitleActions } from "./OtherWaysIn";
import { localSave } from "./persistence";
import type { useVisitorSession } from "./useVisitorSession";

type Session = ReturnType<typeof useVisitorSession>;
export default function Welcome({
	session,
	onEnter,
	...actions
}: TitleActions & { session: Session; onEnter: () => void }) {
	const [otherWays, setOtherWays] = useState(false);
	const [confirmNew, setConfirmNew] = useState(false);
	const [deviceDay, setDeviceDay] = useState<number>();
	const [previous, setPrevious] = useState(false);
	useEffect(() => {
		let active = true;
		void Promise.all([localSave(), localSave("previous")])
			.then(([latest, prior]) => {
				if (!active) return;
				const packet = latest as { runtime?: { now?: number } } | undefined;
				if (packet)
					setDeviceDay(Math.floor((packet.runtime?.now ?? 0) / 1440) + 1);
				setPrevious(prior !== undefined);
			})
			.catch(() => {});
		return () => {
			active = false;
		};
	}, []);
	const hasSave = session.hasSave || deviceDay !== undefined;
	const day = session.town?.day ?? deviceDay;
	return (
		<main className="welcome-screen">
			<div className="welcome-scene" aria-hidden="true">
				<svg viewBox="0 0 360 200" aria-hidden="true">
					<path
						className="welcome-river"
						d="M-20 28C90 135 110 25 185 110S290 145 380 190"
						fill="none"
						stroke="currentColor"
						strokeWidth="24"
						opacity=".13"
					/>
					<path
						d="M45 70h55v42H45zM235 50h65v45h-65zM195 145h60v35h-60z"
						fill="none"
						stroke="currentColor"
						opacity=".25"
					/>
				</svg>
				<span className="eyebrow">NEIGHBOURS · Alder Quay</span>
			</div>
			<div className="welcome-premise">
				<h2>A town is rebuilding after a flood.</h2>
				<p className="welcome-goal">
					Help your neighbours reopen the flooded hall. They decide for
					themselves.
				</p>
			</div>
			{labMode() && (
				<button
					type="button"
					className="other-ways-trigger"
					onClick={() => setOtherWays(true)}
				>
					Other ways in <span aria-hidden="true">▸</span>
				</button>
			)}
			<div className="welcome-actions action-bar">
				{confirmNew ? (
					<div className="new-town-confirm">
						<p>Your current town is kept as the previous town.</p>
						<button
							type="button"
							className="primary"
							onClick={() => (actions.onStart ?? session.startTown)()}
						>
							Start a new town
						</button>
						<button type="button" onClick={() => setConfirmNew(false)}>
							Keep this town
						</button>
					</div>
				) : (
					<>
						<button
							type="button"
							className="enter-town primary"
							onClick={onEnter}
						>
							{hasSave
								? `Return to Alder Quay${day ? ` · day ${day}` : ""}`
								: "Enter Alder Quay"}
						</button>
						{hasSave && (
							<button type="button" onClick={() => setConfirmNew(true)}>
								New game
							</button>
						)}
					</>
				)}
				<p className="welcome-device muted">
					The first visit downloads the town to this device.
				</p>
			</div>
			{otherWays && (
				<OtherWaysIn
					session={session}
					hasSave={hasSave}
					hasPrevious={session.hasPrevious || previous}
					onClose={() => setOtherWays(false)}
					{...actions}
				/>
			)}
		</main>
	);
}
