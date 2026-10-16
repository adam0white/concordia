type Props = { onEnter: () => void };

export default function Welcome({ onEnter }: Props) {
	return (
		<main className="welcome-screen">
			<span className="eyebrow">Welcome to Alder Quay</span>
			<h2>A town rebuilding after a flood.</h2>
			<p className="welcome-intro">
				Follow eight neighbours as they work, rest and try to reopen their
				community hall. Two hundred other residents share the town.
			</p>
			<ol className="welcome-steps">
				<li>
					<strong>Watch a day unfold.</strong>
					<span>
						Press Play, or Step through one round. Select a neighbour on the map
						to follow them.
					</span>
				</li>
				<li>
					<strong>Help when you choose.</strong>
					<span>
						Restore public transport, lend shared repair tools, or spread hall
						news. People decide how to respond.
					</span>
				</li>
				<li>
					<strong>See what changes.</strong>
					<span>
						Can the hall reopen? Will neighbours make time for a class or a
						shared meal? Stories collect what happens.
					</span>
				</li>
			</ol>
			<button type="button" className="enter-town" onClick={onEnter}>
				Enter town
			</button>
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
