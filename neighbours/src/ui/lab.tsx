import { createLab } from "@adam0white/lab-client";
import { telemetryNotice } from "@adam0white/lab-kit";
import { useEffect, useRef, useState } from "react";

export const lab = createLab({ game: "neighbours" });

export function LabPrivacy() {
	const [eventsOn, setEventsOn] = useState(lab.telemetryOn);
	useEffect(() => {
		const sync = () => setEventsOn(lab.telemetryOn);
		window.addEventListener("storage", sync);
		window.addEventListener("focus", sync);
		window.addEventListener("hf-lab-preference", sync);
		document.addEventListener("change", sync);
		return () => {
			window.removeEventListener("storage", sync);
			window.removeEventListener("focus", sync);
			window.removeEventListener("hf-lab-preference", sync);
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
			<summary
				style={{
					minHeight: 44,
					minWidth: 44,
					alignContent: "center",
					cursor: "pointer",
				}}
			>
				Playtest privacy
			</summary>
			<label>
				<input
					type="checkbox"
					checked={eventsOn}
					onChange={(event) => {
						lab.setTelemetryOff(!event.target.checked);
						setEventsOn(lab.telemetryOn);
					}}
				/>{" "}
				Record play for the lab
			</label>
			<a href="https://human.adamwhite.work/lab/privacy/">Privacy</a>
		</details>
	);
}

const notice = typeof document === "undefined" ? null : telemetryNotice();
if (notice)
	Object.assign(notice.style, {
		position: "static",
		transform: "none",
		margin: "0 auto",
	});
export function LabNotice() {
	const host = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (notice) host.current?.append(notice);
		return () => notice?.remove();
	}, []);
	return <div ref={host} />;
}
