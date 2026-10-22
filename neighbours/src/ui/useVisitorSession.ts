import { useCallback, useEffect, useRef, useState } from "react";
import type {
	AdvanceRequest,
	Intervention,
	PlayerWorkKind,
	SpeechPrediction,
	TownComparison,
	TownView,
	UiCommand,
	UiReply,
} from "../contracts";
import { personOutcome, personOutcomeNotice } from "../person-outcome.ts";
import { RuntimeClient } from "../runtime-client";
import { orderedReplies } from "./durable-replies";
import { datedClock } from "./format";
import { lab } from "./lab";
import { type ObservedFeed, observe } from "./observations";
import { DeviceSaves, localSave, SaveConflictError } from "./persistence";
import { playbackRate, storyReadingKey } from "./playback-rate";
import { decodeSave, encodeSave, SaveFileError } from "./save-codec";
import { type HealthHistory, sampleHealth } from "./TownHealth";

const savedLabel = (save: unknown) => {
	const savedAt = (save as { runtime?: { now?: unknown } } | null)?.runtime
		?.now;
	return typeof savedAt === "number" && Number.isFinite(savedAt)
		? `Saved · ${datedClock(savedAt)}`
		: "Saved on this device";
};

// Own the runtime and device checkpoint lifecycle together. In particular, startup
// recovery must keep autosaves locked until an explicit visitor action succeeds.
export function useVisitorSession({
	enabled = true,
}: {
	enabled?: boolean;
} = {}) {
	const [town, setTown] = useState<TownView>();
	const [healthHistory, setHealthHistory] = useState<HealthHistory>();
	const [progress, setProgress] = useState("Preparing the live town…");
	const [error, setError] = useState("");
	const [playing, setPlaying] = useState(false);
	const playerPaused = useRef(false);
	const [comparing, setComparing] = useState(false);
	const [advancing, setAdvancing] = useState(false);
	const [advanceProgress, setAdvanceProgress] = useState("");
	const [advanceNotice, setAdvanceNotice] = useState("");
	const advancePending = useRef<number | null>(null);
	const advanceOrigin = useRef<{ view: TownView; actorId: string } | null>(
		null,
	);
	const advanceSequence = useRef(0);
	const [branchReport, setBranchReport] = useState<TownComparison>();
	const [branchStale, setBranchStale] = useState(false);
	const [branchHistory, setBranchHistory] = useState<
		{
			id: string;
			report: TownComparison;
			label: string;
			revision: number;
		}[]
	>([]);
	const [comparisonSetup, setComparisonSetup] = useState<{
		kind: "lend-tools" | "restore-bus" | "share-news";
		rounds: 24 | 96 | 672;
	}>({ kind: "lend-tools", rounds: 24 });
	const comparisonLabel = useRef("");
	const comparisonSequence = useRef(0);
	const liveRevision = useRef(0);
	const hasBranchReport = useRef(false);
	const [branchProgress, setBranchProgress] = useState("");
	const [branchRequest, setBranchRequest] = useState<{
		label: string;
		rounds: number;
	}>();
	const [branchError, setBranchError] = useState("");
	const comparisonPending = useRef(false);
	const [townEpoch, setTownEpoch] = useState(0);
	const [conversationPerson, updateConversationPerson] = useState<string>();
	const conversationHeld = useRef<string | undefined>(undefined);
	const setConversationPerson = useCallback((id: string | undefined) => {
		conversationHeld.current = id;
		updateConversationPerson(id);
	}, []);
	const clearConversationPerson = useCallback(
		(id: string | undefined) => {
			if (conversationHeld.current === id) setConversationPerson(undefined);
		},
		[setConversationPerson],
	);
	const [speed, setSpeed] = useState(1200);
	const menuWasPlaying = useRef(false);
	const rate = playbackRate(
		conversationPerson !== undefined,
		Boolean(town?.player?.job),
		speed,
	);
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
	const [intervening, setIntervening] = useState(false);
	const interventionSequence = useRef(0);
	const interventionPending = useRef<{
		id: number;
		kind: Intervention["kind"];
		remaining: number;
		spent: number;
	} | null>(null);
	const [saveConflict, setSaveConflict] = useState(false);
	// The player's own speech and movement: their rejections stay beside the speak panel.
	const [playerError, setPlayerError] = useState("");
	const [speechPrediction, setSpeechPrediction] = useState<{
		actorId: string;
		prediction?: SpeechPrediction;
		error?: string;
	}>();
	const predictionSequence = useRef(0);
	const predictionKey = useRef<{ actorId: string; town: TownView } | undefined>(
		undefined,
	);
	const playerSequence = useRef(0);
	const playerPendingRef = useRef<number | null>(null);
	const [playerPending, setPlayerPending] = useState(false);
	const saveConflictRef = useRef(false);
	const [hasSave, setHasSave] = useState(false);
	const [hasPrevious, setHasPrevious] = useState(false);
	const [trends, setTrends] = useState<Record<string, number[]>>({});
	const client = useRef<RuntimeClient | null>(null);
	const pending = useRef(false);
	const saveRequestId = useRef(0);
	const exportRequest = useRef<number | null>(null);
	const notebookRequest = useRef<number | null>(null);
	const rounds = useRef(0);
	const autosaveEnabled = useRef(false);
	const persistenceAfterState = useRef(false);
	const replacementIntent = useRef(0);
	const worldGeneration = useRef(0);
	const acceptedGeneration = useRef(0);
	const downloadGeneration = useRef(0);
	const errorRevision = useRef(0);
	// Worker replies keep command order; reset feedback on a successful replacement, never a rejected import.
	const [commandPending, setCommandPending] = useState(false);
	const stateCommands = useRef<
		{
			replacement: number | null;
			errorRevision: number;
			commandType: UiCommand["type"];
			interventionId?: number;
			playerAction?: number;
			generation: number;
		}[]
	>([]);
	// Save replies may arrive after a replacement or its canceled backup.
	const saveRequests = useRef(
		new Map<number, { generation: number; backup: boolean }>(),
	);
	const menuHeld = useRef(false);
	const menuWaiting = useRef(false);
	const [menuOpen, setMenuOpen] = useState(false);
	const [menuPausing, setMenuPausing] = useState(false);
	const clockHealthy = useRef(false);
	const readingUntil = useRef(0);
	const remainingReading = useRef(0);
	const previousStory = useRef<string | undefined>(undefined);
	const settleMenu = useCallback(() => {
		if (
			menuWaiting.current &&
			stateCommands.current.length === 0 &&
			!pending.current &&
			advancePending.current === null &&
			!comparisonPending.current
		) {
			menuWaiting.current = false;
			setMenuPausing(false);
			setMenuOpen(true);
		}
	}, []);
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
		if (
			["step", "advance", "intervene", "restore", "new"].includes(command.type)
		) {
			const replacement = command.type === "restore" || command.type === "new";
			if (replacement) {
				worldGeneration.current++;
				advanceOrigin.current = null;
			}
			setCommandPending(true);
			stateCommands.current.push({
				commandType: command.type,
				interventionId:
					command.type === "intervene" &&
					!command.intervention.kind.startsWith("player-")
						? interventionPending.current?.id
						: undefined,
				playerAction:
					command.type === "intervene" &&
					command.intervention.kind.startsWith("player-")
						? playerSequence.current
						: undefined,
				generation: worldGeneration.current,
				replacement: replacement ? worldGeneration.current : null,
				errorRevision: errorRevision.current,
			});
		}
		client.current?.send(command);
	}, []);
	const resetWorldFeedback = useCallback(
		(generation: number) => {
			advanceOrigin.current = null;
			acceptedGeneration.current = generation;
			setTownEpoch(generation);
			playerPendingRef.current = null;
			setPlayerPending(false);
			const requestedExport = exportRequest.current;
			if (
				requestedExport !== null &&
				(saveRequests.current.get(requestedExport)?.generation ?? -1) <
					generation
			)
				exportRequest.current = null;
			interventionPending.current = null;
			setIntervening(false);
			if (downloadGeneration.current < generation) {
				setDownloadUrl("");
				setDownloadLabel("");
			}
			setInterventionNotice("");
			setBranchReport(undefined);
			hasBranchReport.current = false;
			setBranchStale(false);
			setBranchHistory([]);
			setBranchRequest(undefined);
			setBranchProgress("");
			setBranchError("");
			setSaved("");
			setObserved(undefined);
			setTrends({});
			setHealthHistory(undefined);
			setAdvanceNotice("");
			setPlayerError("");
			setSpeechPrediction(undefined);
			predictionKey.current = undefined;
			predictionSequence.current++;
			setConversationPerson(undefined);
		},
		[setConversationPerson],
	);
	useEffect(() => {
		if (!enabled) return;
		let active = true;
		const saves = new DeviceSaves(() => {
			if (advancePending.current !== null)
				client.current?.send({
					type: "cancel-advance",
					requestId: advancePending.current,
				});
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
		let telemetryTown: TownView | undefined;
		let committedSave:
			| {
					generation: number;
					data: { slot: "latest" | "previous"; packet: unknown };
			  }
			| undefined;
		const recordCommittedSave = (
			packet: unknown,
			slot: "latest" | "previous",
			generation: number,
		) => {
			const data = { slot, packet: structuredClone(packet) };
			committedSave = { generation, data };
			lab.captureSave(data);
		};
		const telemetryRequests = new Map<
			number,
			{
				generation: number;
				resolve: (value: unknown) => void;
				timer: ReturnType<typeof setTimeout>;
			}
		>();
		const stopRecording = lab.trackRun(
			async () => {
				if (!runtime || !telemetryTown || !clockHealthy.current) return null;
				const generation = acceptedGeneration.current;
				const packet = await new Promise<unknown>((resolve) => {
					const requestId = -++saveRequestId.current;
					const timer = setTimeout(() => {
						telemetryRequests.delete(requestId);
						resolve(null);
					}, 15000);
					telemetryRequests.set(requestId, { generation, resolve, timer });
					runtime?.send({ type: "save", requestId });
				});
				if (!active || generation !== acceptedGeneration.current) return null;
				// Retry only checkpoints committed by this visitor's accepted world,
				// after identity is settled. Never attach a prior town's device save.
				if (committedSave?.generation === generation)
					lab.captureSave(committedSave.data);
				return active && generation === acceptedGeneration.current
					? packet
					: null;
			},
			{
				runKey: () =>
					telemetryTown
						? `${telemetryTown.seed}:${acceptedGeneration.current}`
						: "title",
				getLogs: () =>
					telemetryTown?.events.slice(-40).map((event) => event.text) ?? [],
			},
		);
		let initialSavedPacket: unknown;
		let savedReadFailed = false;
		let firstReady = true;
		let restoringStartup = false;
		let freshAtStartup: TownView | undefined;
		autosaveEnabled.current = false;
		setProgress("Checking the saved town on this device…");
		const handleReply = (reply: UiReply) => {
			if (!active) return;
			if (
				reply.type === "save" &&
				reply.requestId !== undefined &&
				telemetryRequests.has(reply.requestId)
			) {
				const request = telemetryRequests.get(reply.requestId);
				if (request) {
					clearTimeout(request.timer);
					telemetryRequests.delete(reply.requestId);
					request.resolve(
						request.generation === acceptedGeneration.current
							? reply.save
							: null,
					);
				}
				return;
			}
			if (reply.type === "error") lab.log("error", reply.message);
			if (reply.type === "progress") {
				setProgress(reply.message);
				if (comparisonPending.current) setBranchProgress(reply.message);
				if (reply.advance?.requestId === advancePending.current)
					setAdvanceProgress(reply.message);
			}
			if (reply.type === "speech-predictions") {
				if (reply.requestId !== predictionSequence.current) return;
				setSpeechPrediction({
					actorId: reply.actorId,
					...(reply.prediction ? { prediction: reply.prediction } : {}),
					...(reply.error ? { error: reply.error } : {}),
				});
				return;
			}
			if (reply.type === "comparison") {
				comparisonPending.current = false;
				setComparing(false);
				setPlaying(
					clockHealthy.current && !playerPaused.current && !menuHeld.current,
				);
				setBranchReport(reply.report);
				hasBranchReport.current = true;
				setBranchStale(false);
				const entry = {
					id: `comparison-${++comparisonSequence.current}`,
					report: reply.report,
					label: comparisonLabel.current,
					revision: liveRevision.current,
				};
				setBranchHistory((history) => [entry, ...history].slice(0, 4));
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
				const previouslyHealthy = clockHealthy.current;
				const failed = !comparisonPending.current
					? stateCommands.current.shift()
					: undefined;
				if (failed && failed.generation < acceptedGeneration.current) return;
				clockHealthy.current = false;
				// A rejected import leaves the existing engine intact. Closing its menu resumes that town.
				if (failed?.commandType === "restore" && !restoringStartup)
					clockHealthy.current = previouslyHealthy;
				if (failed?.commandType === "advance") {
					advanceOrigin.current = null;
					advancePending.current = null;
					setAdvancing(false);
					setAdvanceProgress("");
				}
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
						`The saved town could not be restored. Its device save is preserved while this fresh town is paused. Taking an action will replace that save. You can also import a compatible save or choose Start town in Game menu. ${reply.message}`,
					);
					return;
				}
				if (comparisonPending.current) {
					comparisonPending.current = false;
					setComparing(false);
					setBranchError(reply.message);
					return;
				}
				if (
					failed?.commandType === "intervene" &&
					failed.interventionId === interventionPending.current?.id
				) {
					interventionPending.current = null;
					setIntervening(false);
					setInterventionNotice("");
				}
				if (failed?.playerAction === playerPendingRef.current) {
					playerPendingRef.current = null;
					setPlayerPending(false);
				}
				if (failed?.playerAction !== undefined) {
					if (failed.playerAction === playerSequence.current)
						setPlayerError(reply.message);
					setPlaying(false);
					pending.current = false;
					return;
				}
				if (!failed || failed.errorRevision === errorRevision.current)
					setError(
						failed?.commandType === "restore"
							? `This save could not be loaded. Your current town is unchanged. ${reply.message}`
							: reply.message,
					);
				setPlaying(
					clockHealthy.current && !playerPaused.current && !menuHeld.current,
				);
				pending.current = false;
			}
			if (reply.type === "ready" || reply.type === "state") {
				if (reply.advance && reply.advance.requestId !== advancePending.current)
					return;
				const completed = stateCommands.current.shift();
				if (completed && completed.generation < acceptedGeneration.current)
					return;
				// A queued advance starts after preceding commands, so its notice must
				// compare against their accepted state, not the earlier rendered view.
				if (
					!reply.advance &&
					advancePending.current !== null &&
					advanceOrigin.current &&
					completed?.generation === worldGeneration.current
				)
					advanceOrigin.current = {
						actorId: advanceOrigin.current.actorId,
						view: structuredClone(reply.view),
					};
				if (reply.advance) {
					advancePending.current = null;
					setAdvancing(false);
					setAdvanceProgress("");
					const reason = reply.advance.reason;
					const origin = advanceOrigin.current;
					const outcome =
						reason === "person-story" && origin
							? personOutcomeNotice(
									personOutcome(origin.view, reply.view, origin.actorId),
								)
							: undefined;
					advanceOrigin.current = null;
					setAdvanceNotice(
						reason === "cancelled"
							? `Stopped at ${datedClock(reply.view.now)}. Completed time is kept.`
							: reason === "horizon"
								? `No matching event in ${reply.advance.rounds / 96} days. Paused at ${datedClock(reply.view.now)}.`
								: reason === "hall-choice"
									? `Evening choices are available · ${datedClock(reply.view.now)}.`
									: reason === "player"
										? `${reply.view.player?.latestNotice?.text ?? "Something you set in motion happened"} · ${datedClock(reply.view.now)}.`
										: outcome
											? `${outcome} · ${datedClock(reply.view.now)}.`
											: `${reason === "person-story" ? "A new outcome for the followed neighbour" : "A new story"} · ${datedClock(reply.view.now)}.`,
					);
				}
				if (reply.advance?.rounds !== 0) {
					liveRevision.current++;
					if (hasBranchReport.current) setBranchStale(true);
				}
				if (
					completed?.replacement !== null &&
					completed?.replacement !== undefined
				)
					resetWorldFeedback(completed.replacement);
				if (persistenceAfterState.current) {
					autosaveEnabled.current = true;
					persistenceAfterState.current = false;
				}
				telemetryTown = reply.view;
				const restoredAtStartup = restoringStartup && reply.type === "state";
				if (restoredAtStartup) {
					restoringStartup = false;
					autosaveEnabled.current = true;
					setPlaying(false);
					setSaved("Restored town from this device");
				}
				if (reply.type === "ready") autosaveEnabled.current = !savedReadFailed;
				if (completed?.playerAction === playerPendingRef.current) {
					playerPendingRef.current = null;
					setPlayerPending(false);
				}
				clockHealthy.current = !savedReadFailed;
				setPlaying(
					!savedReadFailed && !playerPaused.current && !menuHeld.current,
				);
				const storyKey = storyReadingKey(reply.view);
				if (
					previousStory.current !== undefined &&
					previousStory.current !== storyKey &&
					!completed?.replacement
				) {
					if (menuHeld.current) remainingReading.current = 6000;
					else readingUntil.current = Date.now() + 6000;
				}
				previousStory.current = storyKey;
				setTown(reply.view);
				setHealthHistory((previous) => sampleHealth(previous, reply.view));
				const intervention = interventionPending.current;
				if (
					intervention &&
					completed?.commandType === "intervene" &&
					completed.interventionId === intervention.id &&
					((intervention.kind === "request-inspection" &&
						reply.view.assistance !== undefined) ||
						reply.view.controlsRemaining < intervention.remaining ||
						(reply.view.stats.interventionsSpent ??
							3 - reply.view.controlsRemaining) > intervention.spent)
				) {
					setInterventionNotice(
						intervention.kind === "request-inspection"
							? reply.view.assistance?.received
								? "Inspection request received. Helping remains their choice."
								: "The neighbour did not receive the inspection request."
							: intervention.kind === "lend-tools"
								? `Tools added. ${reply.view.stats.tools ?? "Updated"} tools now available.`
								: intervention.kind === "restore-bus"
									? "Bus restored. Future trips can use it; current activities keep their durations."
									: intervention.kind === "open-evening-slot"
										? "Extra hall slot funded. The unposted opportunity moves to the next day; hosting remains their choice."
										: intervention.kind === "advertise-evening"
											? "Invitation advertised to awake neighbours. Hearing it does not mean accepting or attending."
											: "Hall news broadcast to awake neighbours. Each decides whether to act on it.",
					);
					interventionPending.current = null;
					setIntervening(false);
				} else if (
					intervention &&
					completed?.commandType === "intervene" &&
					completed.interventionId === intervention.id
				) {
					interventionPending.current = null;
					setIntervening(false);
					setInterventionNotice(
						"That intervention was not applied. No allowance was spent.",
					);
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
						!savedReadFailed && !playerPaused.current && !menuHeld.current,
					);
					savedReadFailed = false;
				}
				if (
					(++rounds.current % 6 === 0 ||
						reply.advance !== undefined ||
						typeof completed?.replacement === "number") &&
					autosaveEnabled.current &&
					reply.save === undefined
				)
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
							recordCommittedSave(
								reply.save,
								replace ? "previous" : "latest",
								generation,
							);
							setSaved(savedLabel(reply.save));
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
					if (notebookRequest.current === reply.requestId) {
						notebookRequest.current = null;
						exportRequest.current = null;
						lab.openSendDialog({ getRun: () => reply.save });
					} else {
						const requestId = reply.requestId;
						const revision = errorRevision.current;
						void encodeSave(reply.save).then(
							(blob) => {
								if (
									!active ||
									exportRequest.current !== requestId ||
									generation < acceptedGeneration.current
								)
									return;
								downloadGeneration.current = generation;
								const packet = reply.save as {
									runtime?: { now?: number };
								} | null;
								const at = packet?.runtime?.now;
								setDownloadLabel(
									typeof at === "number"
										? datedClock(at)
										: "Current checkpoint",
								);
								setDownloadUrl(URL.createObjectURL(blob));
								exportRequest.current = null;
							},
							(failure: unknown) => {
								if (
									!active ||
									exportRequest.current !== requestId ||
									generation < acceptedGeneration.current
								)
									return;
								exportRequest.current = null;
								if (revision !== errorRevision.current) return;
								errorRevision.current++;
								setError(
									failure instanceof SaveFileError
										? failure.message
										: "This save could not be compressed. The current town is unchanged.",
								);
							},
						);
					}
				}
			}
		};
		const handle = (reply: UiReply) => {
			try {
				handleReply(reply);
			} finally {
				setCommandPending(stateCommands.current.length > 0);
				settleMenu();
			}
		};
		// A player input's state reply carries its checkpoint; store it before the answer is shown.
		// The head of the state FIFO is this reply's command, because replies are delivered in order.
		const persistAnswer = (reply: UiReply & { save: unknown }) => {
			const command = stateCommands.current[0];
			if (
				!active ||
				saveConflictRef.current ||
				!command ||
				command.generation < acceptedGeneration.current ||
				!(autosaveEnabled.current || persistenceAfterState.current)
			)
				return undefined;
			const generation = command.generation;
			return saves.write(reply.save, "latest").then(
				() => {
					if (
						!active ||
						saveConflictRef.current ||
						generation < acceptedGeneration.current
					)
						return;
					recordCommittedSave(reply.save, "latest", generation);
					setSaved(savedLabel(reply.save));
					setHasSave(true);
				},
				(failure: unknown) => {
					if (
						!active ||
						generation < acceptedGeneration.current ||
						failure instanceof SaveConflictError ||
						saveConflictRef.current
					)
						return;
					setSaved("Device save unavailable");
				},
			);
		};
		const receive = orderedReplies(handle, persistAnswer);
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
			advanceOrigin.current = null;
			active = false;
			stopRecording();
			for (const request of telemetryRequests.values()) {
				clearTimeout(request.timer);
				request.resolve(null);
			}
			telemetryRequests.clear();
			saves.close();
			runtime?.close();
			if (client.current === runtime) client.current = null;
		};
	}, [dispatch, enabled, resetWorldFeedback, settleMenu]);
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
		if (!playing || !hasTown || rate.interval === 0) return;
		const timer = setInterval(() => {
			if (
				!menuHeld.current &&
				conversationHeld.current === undefined &&
				Date.now() >= readingUntil.current &&
				stateCommands.current.length === 0 &&
				playerPendingRef.current === null &&
				!pending.current &&
				!comparisonPending.current &&
				advancePending.current === null &&
				!saveConflictRef.current
			) {
				pending.current = true;
				dispatch({ type: "step" });
			}
		}, rate.interval);
		return () => clearInterval(timer);
	}, [playing, rate.interval, hasTown, dispatch]);
	const send = (command: UiCommand) => {
		if (
			!comparisonPending.current &&
			advancePending.current === null &&
			(!saveConflictRef.current || command.type === "save")
		) {
			if (
				command.type === "step" ||
				command.type === "intervene" ||
				command.type === "restore" ||
				command.type === "new"
			) {
				persistenceAfterState.current = true;
				setAdvanceNotice("");
			}
			dispatch(command);
		}
	};
	const compare = (intervention: Intervention, rounds: 24 | 96 | 672) => {
		if (
			comparisonPending.current ||
			advancePending.current !== null ||
			saveConflictRef.current
		)
			return;
		if (replaceAfterSave.current) {
			setBranchError("Wait for the new town to finish starting, then compare.");
			return;
		}
		setPlaying(false);
		const evening = town?.evenings?.find((e) => e.id === intervention.eventId);
		setBranchReport(undefined);
		hasBranchReport.current = false;
		setBranchStale(false);
		const label =
			intervention.kind === "open-evening-slot"
				? `Extra slot for ${evening?.title ?? "the selected evening"}`
				: intervention.kind === "advertise-evening"
					? `Advertising ${evening?.title ?? "the selected invitation"}`
					: intervention.kind === "request-inspection"
						? `Annex inspection requested from ${town?.people.find((p) => p.id === intervention.actorId)?.name ?? "the selected neighbour"}`
						: intervention.kind.replaceAll("-", " ");
		comparisonLabel.current = label;
		setBranchRequest({ rounds, label });
		setComparing(true);
		setBranchError("");
		setBranchProgress("Pausing the live town and taking its checkpoint…");
		comparisonPending.current = true;
		client.current?.send({ type: "compare", intervention, rounds });
	};
	const selectBranchReport = (report: TownComparison) => {
		if (comparisonPending.current) return;
		const entry = branchHistory.find((item) => item.report === report);
		if (!entry) return;
		setBranchReport(report);
		hasBranchReport.current = true;
		setBranchRequest({ label: entry.label, rounds: report.rounds });
		setBranchStale(entry.revision !== liveRevision.current);
		setBranchError("");
	};
	const cancelComparison = () => {
		if (!comparisonPending.current) return;
		setBranchProgress("Stopping comparison and restoring the live town…");
		client.current?.send({ type: "cancel-comparison" });
	};
	const stopAdvancing = () => {
		if (advancePending.current === null) return;
		setAdvanceProgress("Stopping the advance…");
		client.current?.send({
			type: "cancel-advance",
			requestId: advancePending.current,
		});
	};
	const advanceUntil = (
		until: AdvanceRequest["until"] = "story",
		actorId?: string,
	) => {
		if (
			!town ||
			comparisonPending.current ||
			advancePending.current !== null ||
			saveConflictRef.current ||
			replaceAfterSave.current ||
			interventionPending.current
		)
			return;
		setPlaying(false);
		setError("");
		setAdvanceNotice("");
		setAdvanceProgress("Advancing the real town to the next matching event…");
		const requestId = ++advanceSequence.current;
		advanceOrigin.current =
			until === "person-story" && actorId
				? { view: structuredClone(town), actorId }
				: null;
		advancePending.current = requestId;
		setAdvancing(true);
		persistenceAfterState.current = true;
		dispatch({
			type: "advance",
			requestId,
			until,
			maxRounds: 672,
			...(actorId ? { actorId } : {}),
		});
	};
	const intervene = (intervention: Intervention) => {
		if (
			!town ||
			comparisonPending.current ||
			advancePending.current !== null ||
			saveConflictRef.current ||
			interventionPending.current
		)
			return;
		interventionPending.current = {
			id: ++interventionSequence.current,
			kind: intervention.kind,
			remaining: town.controlsRemaining,
			spent: town.stats.interventionsSpent ?? 3 - town.controlsRemaining,
		};
		setIntervening(true);
		setInterventionNotice("Changing the circumstance…");
		send({ type: "intervene", intervention });
	};
	// Player inputs share the worker FIFO, export and replay; they spend no control allowance.
	const playerInput = (intervention: Intervention) => {
		if (
			!town ||
			playerPendingRef.current !== null ||
			comparisonPending.current ||
			advancePending.current !== null ||
			saveConflictRef.current
		)
			return;
		playerSequence.current++;
		playerPendingRef.current = playerSequence.current;
		setPlayerPending(true);
		setConversationPerson(undefined);
		setPlayerError("");
		setPlaying(false);
		send({ type: "intervene", intervention });
	};
	const movePlayer = (placeId: string) => {
		if (playerPendingRef.current !== null || !town?.player?.canMove) return;
		playerInput({ kind: "player-move", placeId });
	};
	const offerHelp = (actorId: string) =>
		playerInput({ kind: "player-help", actorId });
	const speak = (request: {
		actorId: string;
		affordanceId: string;
		mode: "ask" | "urge" | "promise";
		pledge?: { work: PlayerWorkKind; by?: number };
		acceptCounter?: boolean;
	}) => {
		setSpeechPrediction(undefined);
		predictionKey.current = undefined;
		setConversationPerson(undefined);
		playerInput({
			kind: "player-speak",
			actorId: request.actorId,
			affordanceId: request.affordanceId,
			mode: request.mode,
			...(request.pledge ? { pledge: request.pledge } : {}),
			...(request.acceptCounter ? { acceptCounter: true } : {}),
		});
	};
	/** Start a pledged hour, or an unpledged hour of the named work (cover-shift names whose shift). */
	const playerWork = (
		work: string | { work: PlayerWorkKind; actorId?: string },
	) =>
		playerInput(
			typeof work === "string"
				? { kind: "player-work", pledgeId: work }
				: {
						kind: "player-work",
						work: work.work,
						...(work.actorId ? { actorId: work.actorId } : {}),
					},
		);
	const predictSpeech = useCallback(
		(actorId: string) => {
			if (
				!town ||
				comparisonPending.current ||
				advancePending.current !== null ||
				saveConflictRef.current
			)
				return;
			if (
				predictionKey.current?.town === town &&
				predictionKey.current.actorId === actorId
			)
				return;
			predictionKey.current = { actorId, town };
			const requestId = ++predictionSequence.current;
			setSpeechPrediction({ actorId });
			// Not a state command: its reply never shifts the state FIFO bookkeeping.
			client.current?.send({ type: "predict-speech", requestId, actorId });
		},
		[town],
	);
	const pause = () => {
		playerPaused.current = true;
		setPlaying(false);
		if (advancePending.current !== null) {
			stopAdvancing();
			return;
		}
		send({ type: "save" });
	};

	const openMenu = () => {
		if (menuHeld.current) return;
		menuWasPlaying.current = playing;
		remainingReading.current = Math.max(0, readingUntil.current - Date.now());
		menuHeld.current = true;
		menuWaiting.current = true;
		setMenuPausing(true);
		setPlaying(false);
		stopAdvancing();
		settleMenu();
	};
	const closeMenu = () => {
		if (!menuHeld.current) return;
		readingUntil.current = Date.now() + remainingReading.current;
		remainingReading.current = 0;
		setMenuOpen(false);
		menuHeld.current = false;
		setPlaying(
			menuWasPlaying.current &&
				clockHealthy.current &&
				!saveConflictRef.current,
		);
	};
	const play = () => {
		if (
			saveConflictRef.current ||
			advancePending.current !== null ||
			comparisonPending.current
		)
			return;
		playerPaused.current = false;
		autosaveEnabled.current = true;
		setError("");
		setAdvanceNotice("");
		setPlaying(true);
	};
	const requestExport = (notebook: boolean) => {
		if (stateCommands.current.length > 0 || pending.current) return;
		if (advancePending.current !== null || comparisonPending.current) return;
		setDownloadUrl("");
		const requestId = ++saveRequestId.current;
		exportRequest.current = requestId;
		notebookRequest.current = notebook ? requestId : null;
		send({ type: "save", requestId });
	};
	const exportSave = () => requestExport(false);
	const sendRun = () => requestExport(true);
	const reportLocalError = (message: string) => {
		errorRevision.current++;
		setError(message);
	};
	const startTown = () => {
		if (
			saveConflictRef.current ||
			comparisonPending.current ||
			advancePending.current !== null
		)
			return;
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
		if (
			saveConflictRef.current ||
			comparisonPending.current ||
			advancePending.current !== null
		)
			return;
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
		if (
			saveConflictRef.current ||
			comparisonPending.current ||
			advancePending.current !== null
		)
			return;
		const intent = ++replacementIntent.current;
		replaceAfterSave.current = null;
		setPlaying(false);
		try {
			const save = await decodeSave(file);
			if (intent !== replacementIntent.current) return;
			send({ type: "restore", save });
		} catch (failure) {
			if (intent !== replacementIntent.current) return;
			reportLocalError(
				`${failure instanceof SaveFileError ? failure.message : "This save could not be read."} The current town is unchanged.`,
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
		advancing,
		advanceProgress,
		advanceNotice,
		clearAdvanceNotice: () => setAdvanceNotice(""),
		advanceUntil,
		stopAdvancing,
		branchReport,
		branchStale,
		branchHistory,
		selectBranchReport,
		comparisonSetup,
		setComparisonSetup,
		branchRequest,
		branchProgress,
		branchError,
		commandPending,
		menuOpen,
		menuPausing,
		openMenu,
		closeMenu,
		clockRate: playing ? rate.label : "Time stopped",
		speed,
		setSpeed,
		townEpoch,
		conversationPerson,
		setConversationPerson,
		clearConversationPerson,
		selected,
		setSelected,
		observed,
		seedInput,
		setSeedInput,
		downloadUrl,
		downloadLabel,
		saved,
		interventionNotice,
		intervening,
		saveConflict,
		hasSave,
		hasPrevious,
		trends,
		send,
		compare,
		cancelComparison,
		intervene,
		player: town?.player,
		playerError,
		playerPending,
		speechPrediction,
		movePlayer,
		offerHelp,
		speak,
		playerWork,
		predictSpeech,
		pause,
		play,
		exportSave,
		sendRun,
		startTown,
		restoreSave,
		importSave,
	};
}
