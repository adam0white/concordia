import { createLab } from "@adam0white/lab-client";
import { useEffect, useState } from "react";

export const lab = createLab({ game: "neighbours" });

export function LabPrivacy() {
	const [eventsOn, setEventsOn] = useState(lab.eventsOn);
	useEffect(() => {
		const sync = () => setEventsOn(lab.eventsOn);
		window.addEventListener("storage", sync);
		window.addEventListener("focus", sync);
		document.addEventListener("change", sync);
		return () => {
			window.removeEventListener("storage", sync);
			window.removeEventListener("focus", sync);
			document.removeEventListener("change", sync);
		};
	}, []);
	return (
		<details
			style={{
				padding: "0.4rem",
				background: "#f7f0e5",
				color: "#2b2622",
				maxWidth: "calc(100vw - 1rem)",
			}}
		>
			<summary>Playtest privacy</summary>
			<label>
				<input
					type="checkbox"
					checked={eventsOn}
					onChange={(event) => {
						lab.setEventsOff(!event.target.checked);
						setEventsOn(lab.eventsOn);
					}}
				/>{" "}
				Anonymous play events
			</label>
			<a href="https://human.adamwhite.work/lab/privacy/">Privacy</a>
		</details>
	);
}
