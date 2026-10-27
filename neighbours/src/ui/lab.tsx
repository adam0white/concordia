import { createLab } from "@adam0white/lab-client";
import { telemetryNotice } from "@adam0white/lab-kit";
import { type ReactNode, useEffect, useRef, useState } from "react";

const fileEntry =
	typeof location !== "undefined" && location.pathname === "/file/";
export const lab = createLab({
	game: "neighbours",
	...(fileEntry ? { preservation: "preserve" as const } : {}),
});
// Fail closed before any trackRun registration. Keep the real client; never fall back.
export function fileRecordingAllowed() {
	if (!fileEntry || lab.preservationStatus === "existing-local") return true;
	lab.dispose();
	return false;
}
fileRecordingAllowed();

function recordingStatus() {
	return fileEntry && !fileRecordingAllowed()
		? `Recording unavailable: ${lab.preservationStatus}. You can play this file in memory and download a copy.`
		: "";
}
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
		status: recordingStatus(),
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

export function LabPrivacy({ children }: { children?: ReactNode }) {
	const { telemetryOn, setRecording, status } = useLabRecording();
	return (
		<div className="lab-privacy">
			<label>
				<input
					type="checkbox"
					role="switch"
					aria-checked={telemetryOn}
					checked={telemetryOn}
					disabled={Boolean(status)}
					onChange={(event) => setRecording(event.target.checked)}
				/>{" "}
				Recording
			</label>
			<div className="lab-tools">
				<a href="https://human.adamwhite.work/lab/privacy/">Lab privacy</a>
				{children}
			</div>
		</div>
	);
}

const notice =
	typeof document === "undefined"
		? null
		: telemetryNotice(undefined, fileEntry ? { preservation: "preserve" } : {});
if (notice)
	Object.assign(notice.style, {
		position: "static",
		transform: "none",
		margin: "0 auto",
	});
export function LabNotice() {
	const { status } = useLabRecording();
	const host = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (notice && host.current) {
			// Keep the actual SDK node so asynchronous cross-game suppression can remove it.
			host.current.append(notice);
		}
	}, []);
	return (
		<>
			<div className="lab-notice-host" ref={host} />
			{status && <p role="status">{status}</p>}
		</>
	);
}
