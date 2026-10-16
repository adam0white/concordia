import { useCallback, useEffect, useRef, useState } from "react";
import type {
	Intervention,
	TownComparison,
	TownView,
	UiCommand,
	UiReply,
} from "../contracts";
import { RuntimeClient } from "../runtime-client";
import { datedClock } from "./format";
import { type ObservedFeed, observe } from "./observations";
import { DeviceSaves, localSave, SaveConflictError } from "./persistence";
import { type HealthHistory, sampleHealth } from "./TownHealth";

// Own the runtime and device checkpoint lifecycle together. In particular, startup
// recovery must keep autosaves locked until an explicit visitor action succeeds.
export function useVisitorSession() {
	const [town, setTown] = useState<TownView>();
	const [healthHistory, setHealthHistory] = useState<HealthHistory>();
	const [progress, setProgress] = useState("Preparing the live town…");
	const [error, setError] = useState("");
	const [playing, setPlaying] = useState(false);
	const [comparing, setComparing] = useState(false);
	const [branchReport, setBranchReport] = useState<TownComparison>();
	const [branchProgress, setBranchProgress] = useState("");
	const [branchError, setBranchError] = useState("");
	const comparisonPending = useRef(false);
	const [speed, setSpeed] = useState(1200);
	const [selected, setSelected] = useState(() => {
		try {
			return localStorage.getItem("alder-follow") || "";
		} catch {
			return "";
		}
	});
	const [observed, setObserved] = useState<ObservedFeed>();
	const [seedInput, setSeedInput] = useState("42");
	const [downloadUrl, setDownloadUrl] = useState("");
	const [downloadLabel, setDownloadLabel] = useState("");
	const replaceAfterSave = useRef<{
		command: UiCommand;
		requestId: number;
	} | null>(null);
	const [saved, setSaved] = useState("");
	const [interventionNotice, setInterventionNotice] = useState("");
	const interventionPending = useRef<{
		kind: Intervention["kind"];
		remaining: number;
	} | null>(null);
	const [saveConflict, setSaveConflict] = useState(false);
	const saveConflictRef = useRef(false);
	const [hasSave, setHasSave] = useState(false);
	const [hasPrevious, setHasPrevious] = useState(false);
	const [trends, setTrends] = useState<Record<string, number[]>>({});
	const client = useRef<RuntimeClient | null>(null);
	const pending = useRef(false);
	const saveRequestId = useRef(0);
	const exportRequest = useRef<number | null>(null);
	const rounds = useRef(0);
	const autosaveEnabled = useRef(false);
	const persistenceAfterState = useRef(false);
	const replacementIntent = useRef(0);
	const worldGeneration = useRef(0);
	const acceptedGeneration = useRef(0);
	const downloadGeneration = useRef(0);
	const errorRevision = useRef(0);
	// Worker replies keep command order; reset feedback on a successful replacement, never a rejected import.
	const stateCommands = useRef<
		{ replacement: number | null; errorRevision: number }[]
	>([]);
	// Save replies may arrive after a replacement or its canceled backup.
	const saveRequests = useRef(
		new Map<number, { generation: number; backup: boolean }>(),
	);
	const dispatch = useCallback((command: UiCommand) => {
		if (command.type === "save") {
			const requestId = command.requestId ?? ++saveRequestId.current;
			saveRequests.current.set(requestId, {
				generation: worldGeneration.current,
				backup: replaceAfterSave.current?.requestId === requestId,
			});
			client.current?.send({ ...command, requestId });
			return;
		}
		if (["step", "intervene", "restore", "new"].includes(command.type)) {
			const replacement = command.type === "restore" || command.type === "new";
			if (replacement) worldGeneration.current++;
			stateCommands.current.push({
				replacement: replacement ? worldGeneration.current : null,
				errorRevision: errorRevision.current,
			});
		}
		client.current?.send(command);
	}, []);
	const resetWorldFeedback = useCallback((generation: number) => {
		acceptedGeneration.current = generation;
		const requestedExport = exportRequest.current;
		if (
			requestedExport !== null &&
			(saveRequests.current.get(requestedExport)?.generation ?? -1) < generation
		)
			exportRequest.current = null;
		interventionPending.current = null;
		if (downloadGeneration.current < generation) {
			setDownloadUrl("");
			setDownloadLabel("");
		}
		setInterventionNotice("");
		setBranchReport(undefined);
		setBranchProgress("");
		setBranchError("");
		setSaved("");
		setObserved(undefined);
		setTrends({});
		setHealthHistory(undefined);
	}, []);
	useEffect(() => {
		let active = true;
		const saves = new DeviceSaves(() => {
			if (!active) return;
			saveConflictRef.current = true;
			setSaveConflict(true);
			autosaveEnabled.current = false;
			persistenceAfterState.current = false;
			replaceAfterSave.current = null;
			setPlaying(false);
			setSaved("Device save changed in another tab");
		});
		let runtime: RuntimeClient | null = null;
		let initialSavedPacket: unknown;
		let savedReadFailed = false;
		let firstReady = true;
		let restoringStartup = false;
		let freshAtStartup: TownView | undefined;
		autosaveEnabled.current = false;
		setProgress("Checking the saved town on this device…");
		const receive = (reply: UiReply) => {
			if (!active) return;
			if (reply.type === "progress") {
				setProgress(reply.message);
				if (comparisonPending.current) setBranchProgress(reply.message);
			}
			if (reply.type === "comparison") {
				comparisonPending.current = false;
				setComparing(false);
				setBranchReport(reply.report);
				setBranchProgress("");
			}
			if (reply.type === "ready" && firstReady) {
				firstReady = false;
				if (initialSavedPacket !== undefined) {
					freshAtStartup = reply.view;
					restoringStartup = true;
					setProgress("Restoring the town saved on this device…");
					runtime?.send({ type: "restore", save: initialSavedPacket });
					return;
				}
			}
			if (reply.type === "error") {
				const failed = !comparisonPending.current
					? stateCommands.current.shift()
					: undefined;
				persistenceAfterState.current = false;
				if (restoringStartup && freshAtStartup) {
					restoringStartup = false;
					autosaveEnabled.current = false;
					setTown(freshAtStartup);
					setHealthHistory(sampleHealth(undefined, freshAtStartup));
					setObserved(observe(undefined, freshAtStartup));
					setPlaying(false);
					pending.current = false;
					setError(
						`The saved town could not be restored. Its device save is preserved while this fresh town is paused. Continuing with Play, Step or an intervention will replace that save. You can also import a compatible save or choose Start town in Inspector. ${reply.message}`,
					);
					return;
				}
				if (comparisonPending.current) {
					comparisonPending.current = false;
					setComparing(false);
					setBranchError(reply.message);
					return;
				}
				if (!failed || failed.errorRevision === errorRevision.current)
					setError(reply.message);
				setPlaying(false);
				pending.current = false;
			}
			if (reply.type === "ready" || reply.type === "state") {
				const completed = stateCommands.current.shift();
				if (
					completed?.replacement !== null &&
					completed?.replacement !== undefined
				)
					resetWorldFeedback(completed.replacement);
				if (persistenceAfterState.current) {
					autosaveEnabled.current = true;
					persistenceAfterState.current = false;
				}
				const restoredAtStartup = restoringStartup && reply.type === "state";
				if (restoredAtStartup) {
					restoringStartup = false;
					autosaveEnabled.current = true;
					setPlaying(false);
					setSaved("Restored town from this device");
				}
				if (reply.type === "ready") autosaveEnabled.current = !savedReadFailed;
				setTown(reply.view);
				setHealthHistory((previous) => sampleHealth(previous, reply.view));
				const intervention = interventionPending.current;
				if (
					intervention &&
					reply.view.controlsRemaining < intervention.remaining
				) {
					setInterventionNotice(
						intervention.kind === "lend-tools"
							? `Tools added. ${reply.view.stats.tools ?? "Updated"} tools now available.`
							: intervention.kind === "restore-bus"
								? "Bus restored. Future trips can use it; current activities keep their durations."
								: "Hall news broadcast to awake neighbours. Each decides whether to act on it.",
					);
					interventionPending.current = null;
				}
				setObserved((old) => observe(old, reply.view));
				if (!completed || completed.errorRevision === errorRevision.current)
					setError(
						savedReadFailed
							? "The device save could not be read. This fresh town is paused; device saving may be unavailable."
							: "",
					);
				pending.current = false;
				setTrends((old) => {
					const next = { ...old };
					for (const [key, value] of Object.entries(reply.view.stats))
						next[key] = [...(old[key] || []), value].slice(-40);
					return next;
				});
				if (reply.type === "ready") {
					setPlaying(
						!savedReadFailed &&
							!saveConflictRef.current &&
							!stateCommands.current.some(
								(command) => command.replacement !== null,
							),
					);
					savedReadFailed = false;
				}
				if (++rounds.current % 6 === 0 && autosaveEnabled.current)
					dispatch({ type: "save" });
			}
			if (reply.type === "save") {
				const request =
					reply.requestId === undefined
						? undefined
						: saveRequests.current.get(reply.requestId);
				if (reply.requestId !== undefined)
					saveRequests.current.delete(reply.requestId);
				if (
					!request ||
					request.generation < acceptedGeneration.current ||
					(request.backup &&
						replaceAfterSave.current?.requestId !== reply.requestId)
				)
					return;
				const generation = request.generation;
				const replacement = replaceAfterSave.current;
				const replace =
					replacement?.requestId === reply.requestId ? replacement : null;
				if (!saveConflictRef.current && (autosaveEnabled.current || replace))
					void saves
						.write(reply.save, replace ? "previous" : "latest")
						.then(() => {
							if (
								!active ||
								saveConflictRef.current ||
								generation < acceptedGeneration.current
							)
								return;
							const checkpoint = reply.save as { runtime?: { now?: unknown } };
							const savedAt = checkpoint?.runtime?.now;
							setSaved(
								typeof savedAt === "number" && Number.isFinite(savedAt)
									? `Saved · ${datedClock(savedAt)}`
									: "Saved on this device",
							);
							if (
								replace &&
								replaceAfterSave.current?.requestId === replace.requestId
							) {
								replaceAfterSave.current = null;
								setHasPrevious(true);
								dispatch(replace.command);
							}
							setHasSave(true);
						})
						.catch((failure: unknown) => {
							if (
								!active ||
								generation < acceptedGeneration.current ||
								failure instanceof SaveConflictError ||
								saveConflictRef.current
							)
								return;
							setSaved("Device save unavailable");
							if (
								replace &&
								replaceAfterSave.current?.requestId === replace.requestId
							) {
								replaceAfterSave.current = null;
								if (
									window.confirm(
										"The current town could not be saved on this device. Replace it with a new town anyway?",
									)
								) {
									dispatch(replace.command);
								}
							}
						});
				if (
					exportRequest.current !== null &&
					reply.requestId === exportRequest.current
				) {
					downloadGeneration.current = generation;
					const packet = reply.save as { runtime?: { now?: number } } | null;
					const at = packet?.runtime?.now;
					setDownloadLabel(
						typeof at === "number" ? datedClock(at) : "Current checkpoint",
					);
					setDownloadUrl(
						URL.createObjectURL(
							new Blob([JSON.stringify(reply.save)], {
								type: "application/json",
							}),
						),
					);
					exportRequest.current = null;
				}
			}
		};
		const startRuntime = () => {
			if (!active) return;
			runtime = new RuntimeClient(receive);
			client.current = runtime;
		};
		void saves.open().then(
			(value) => {
				if (!active) return;
				initialSavedPacket = value;
				setHasSave(value !== undefined);
				startRuntime();
			},
			() => {
				if (!active) return;
				savedReadFailed = true;
				setSaved("Device save unavailable");
				startRuntime();
			},
		);
		void localSave("previous")
			.then((value) => {
				if (active) setHasPrevious(value !== undefined);
			})
			.catch(() => {});
		return () => {
			active = false;
			saves.close();
			runtime?.close();
			if (client.current === runtime) client.current = null;
		};
	}, [dispatch, resetWorldFeedback]);
	useEffect(() => {
		try {
			localStorage.setItem("alder-follow", selected);
		} catch {}
	}, [selected]);
	useEffect(
		() => () => {
			if (downloadUrl) URL.revokeObjectURL(downloadUrl);
		},
		[downloadUrl],
	);
	const hasTown = town !== undefined;
	useEffect(() => {
		if (!playing || !hasTown) return;
		const timer = setInterval(() => {
			if (
				!pending.current &&
				!comparisonPending.current &&
				!saveConflictRef.current
			) {
				pending.current = true;
				dispatch({ type: "step" });
			}
		}, speed);
		return () => clearInterval(timer);
	}, [playing, speed, hasTown, dispatch]);
	const send = (command: UiCommand) => {
		if (
			!comparisonPending.current &&
			(!saveConflictRef.current || command.type === "save")
		) {
			if (
				command.type === "step" ||
				command.type === "intervene" ||
				command.type === "restore" ||
				command.type === "new"
			)
				persistenceAfterState.current = true;
			dispatch(command);
		}
	};
	const compare = (intervention: Intervention, rounds: 24 | 96) => {
		if (comparisonPending.current || saveConflictRef.current) return;
		if (replaceAfterSave.current) {
			setBranchError("Wait for the new town to finish starting, then compare.");
			return;
		}
		setPlaying(false);
		setComparing(true);
		setBranchError("");
		setBranchProgress("Pausing the live town and taking its checkpoint…");
		comparisonPending.current = true;
		client.current?.send({ type: "compare", intervention, rounds });
	};
	const intervene = (intervention: Intervention) => {
		if (!town || comparisonPending.current) return;
		interventionPending.current = {
			kind: intervention.kind,
			remaining: town.controlsRemaining,
		};
		setInterventionNotice("Changing the circumstance…");
		send({ type: "intervene", intervention });
	};
	const pause = () => {
		setPlaying(false);
		send({ type: "save" });
	};

	const play = () => {
		if (saveConflictRef.current) return;
		autosaveEnabled.current = true;
		setError("");
		setPlaying(true);
	};
	const exportSave = () => {
		setDownloadUrl("");
		const requestId = ++saveRequestId.current;
		exportRequest.current = requestId;
		send({ type: "save", requestId });
	};
	const reportLocalError = (message: string) => {
		errorRevision.current++;
		setError(message);
	};
	const startTown = () => {
		if (saveConflictRef.current || comparisonPending.current) return;
		const seed = Number(seedInput);
		if (!Number.isSafeInteger(seed) || seed < 0 || seed > 2147483647) {
			reportLocalError("Choose a whole-number seed from 0 to 2147483647.");
			return;
		}
		setPlaying(false);
		replacementIntent.current++;
		const requestId = ++saveRequestId.current;
		replaceAfterSave.current = { command: { type: "new", seed }, requestId };
		send({ type: "save", requestId });
	};
	const restoreSave = (slot: "previous" | "latest") => {
		if (saveConflictRef.current || comparisonPending.current) return;
		const intent = ++replacementIntent.current;
		replaceAfterSave.current = null;
		setPlaying(false);
		void localSave(slot)
			.then((save) => {
				if (save !== undefined && intent === replacementIntent.current) {
					send({ type: "restore", save });
				}
			})
			.catch(() => {
				if (intent !== replacementIntent.current) return;
				reportLocalError(
					slot === "previous"
						? "Could not read the previous town."
						: "Could not read the device save.",
				);
			});
	};
	const importSave = async (file: File) => {
		if (saveConflictRef.current || comparisonPending.current) return;
		const intent = ++replacementIntent.current;
		replaceAfterSave.current = null;
		if (file.size > 50 * 1024 * 1024) {
			reportLocalError(
				"This save is larger than the 50 MiB import limit. The current town is unchanged.",
			);
			return;
		}
		setPlaying(false);
		try {
			const save = JSON.parse(await file.text());
			if (intent !== replacementIntent.current) return;
			send({ type: "restore", save });
		} catch {
			if (intent !== replacementIntent.current) return;
			reportLocalError(
				"This file is not valid JSON. The current town is unchanged.",
			);
		}
	};
	return {
		town,
		healthHistory,
		progress,
		error,
		playing,
		comparing,
		branchReport,
		branchProgress,
		branchError,
		speed,
		setSpeed,
		selected,
		setSelected,
		observed,
		seedInput,
		setSeedInput,
		downloadUrl,
		downloadLabel,
		saved,
		interventionNotice,
		saveConflict,
		hasSave,
		hasPrevious,
		trends,
		send,
		compare,
		intervene,
		pause,
		play,
		exportSave,
		startTown,
		restoreSave,
		importSave,
	};
}
