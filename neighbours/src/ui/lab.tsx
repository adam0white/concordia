import { createLab } from "@adam0white/lab-client";
import { telemetryNotice } from "@adam0white/lab-kit";
import { useEffect, useRef, useState } from "react";

export const lab = createLab({ game: "neighbours" });
// Close recording before save/run/log hooks can observe an imported or mixed-history chapter.
lab.setPersonaRecording("pending-startup");

function readRecordingPreference() {
	let switchedOff = false;
	try {
		switchedOff = localStorage.getItem("hf-lab-recording-off") === "1";
	} catch {
		/* Storage can be unavailable. */
	}
	return {
		switchedOff,
		telemetryOn: lab.telemetryOn,
		privacySignalOn: lab.privacySignalOn && !lab.privacyOverride,
	};
}
export function useLabRecording() {
	const [preference, setPreference] = useState(readRecordingPreference);
	useEffect(() => {
		const sync = () => setPreference(readRecordingPreference());
		window.addEventListener("storage", sync);
		window.addEventListener("focus", sync);
		window.addEventListener("hf-lab-preference", sync);
		return () => {
			window.removeEventListener("storage", sync);
			window.removeEventListener("focus", sync);
			window.removeEventListener("hf-lab-preference", sync);
		};
	}, []);
	return {
		...preference,
		setRecording: (enabled: boolean) => {
			lab.setTelemetryOff(!enabled);
			window.dispatchEvent(new Event("hf-lab-preference"));
			setPreference(readRecordingPreference());
		},
	};
}

export function LabPrivacy() {
	const { switchedOff, setRecording } = useLabRecording();
	return (
		<div className="lab-privacy">
			<label>
				<input
					type="checkbox"
					role="switch"
					aria-checked={!switchedOff}
					checked={!switchedOff}
					onChange={(event) => setRecording(event.target.checked)}
				/>{" "}
				Record play for the lab
			</label>
			<a href="https://human.adamwhite.work/lab/privacy/">Lab privacy</a>
		</div>
	);
}

let notice = typeof document === "undefined" ? null : telemetryNotice();
if (notice)
	Object.assign(notice.style, {
		position: "static",
		transform: "none",
		margin: "0 auto",
	});
export function LabNotice() {
	const host = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (notice && host.current) {
			// The host owns the node through Strict Mode's effect rehearsal.
			// Removing the host removes the notice; a later title visit cannot append it again.
			host.current.append(notice);
			notice = null;
		}
	}, []);
	return <div className="lab-notice-host" ref={host} />;
}
