import { inkLine } from "./ink";

type Props = { onEnter: () => void };

/** The opening page: a returning resident's first look, with no exposition dump. */
export default function Welcome({ onEnter }: Props) {
	return (
		<main className="welcome-screen">
			<span className="eyebrow">Alder Quay · a field notebook</span>
			<h2>A town rebuilding after a flood.</h2>
			<p className="welcome-goal">
				Watch a day unfold, or help your neighbours rebuild.
			</p>
			<button type="button" className="enter-town" onClick={onEnter}>
				Enter town
			</button>
			<details className="welcome-details">
				<summary>More about Alder Quay</summary>
				<svg className="welcome-rule" viewBox="0 0 320 16" aria-hidden="true">
					<path
						className="high-water"
						d={inkLine(
							"welcome-water",
							[
								[4, 9],
								[316, 7],
							],
							1.8,
							10,
						)}
					/>
					<text x="316" y="5" textAnchor="end" className="map-note">
						the water came up to here
					</text>
				</svg>
				<p className="welcome-intro">
					You are back in Alder Quay. The river has gone down, but the line it
					left is still on the hall wall. Eight neighbours you know, and two
					hundred you know by sight, are putting ordinary days back together.
				</p>
				<ol className="welcome-steps">
					<li>
						<strong>Watch a day unfold.</strong>
						<span>
							Press Play, or Step through one round. Pick a neighbour on the map
							to follow them.
						</span>
					</li>
					<li>
						<strong>Help when you choose.</strong>
						<span>
							Restore public transport, lend shared repair tools, or spread hall
							news. People decide for themselves how to respond, and they may
							say no.
						</span>
					</li>
					<li>
						<strong>See what changes.</strong>
						<span>
							Will the hall reopen? Will anyone make time for a class or a
							shared supper? The journal keeps what happened.
						</span>
					</li>
				</ol>
			</details>
			<p className="welcome-device muted">
				Continuing downloads the Python runtime on your first visit. The
				simulation runs on this device and starts paused. Your saved town is
				loaded when available; you can import a save inside.
			</p>
			<details className="welcome-details">
				<summary>About the simulation</summary>
				<p>
					Python Concordia coordinates the town. Human Framework makes the
					residents’ decisions. This is your device’s town, with autosaves and
					exportable saves. It does not run while this page is closed.
				</p>
			</details>
		</main>
	);
}
