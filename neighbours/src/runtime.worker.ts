/// <reference lib="webworker" />

import { AdvanceCancellation, advanceTown } from "./advance-town.ts";
import { RuntimePort } from "./bridge-port.ts";
import { compareTown } from "./comparison.ts";
import type { UiCommand, UiReply } from "./contracts";
import { restoreCheckpoint } from "./python-session.ts";

interface PythonRuntime {
	FS: {
		mkdirTree(path: string): void;
		writeFile(path: string, data: string | Uint8Array): void;
	};
	registerJsModule(name: string, value: unknown): void;
	runPythonAsync(code: string): Promise<unknown>;
	globals: { set(name: string, value: unknown): void };
}
const send = (reply: UiReply) => postMessage(reply);
const port = new RuntimePort();
const dispatch = (text: string) => port.call(text);
let py: PythonRuntime;
const castRequests = new Map<number, string>();
async function flushCastCaptures() {
	for (const [requestId, id] of castRequests) {
		const person = port.boundaries.get(id);
		if (!person) continue;
		const save = JSON.parse(
			String(await py.runPythonAsync("json.dumps(town_engine.save())")),
		);
		send({
			type: "cast-snapshot",
			requestId,
			save: { ...save, castBoundary: { actorId: id, person } },
		});
		castRequests.delete(requestId);
		if (![...castRequests.values()].includes(id)) {
			port.wanted.delete(id);
			port.boundaries.delete(id);
		}
	}
}

async function boot() {
	send({
		type: "progress",
		message: "Loading the town. The first download is about 13 MB.",
	});
	const url = new URL("/runtime/pyodide.mjs", self.location.origin).href;
	const { loadPyodide } = await import(/* @vite-ignore */ url);
	py = await loadPyodide({
		indexURL: new URL("/runtime/", self.location.origin).href,
		stdout: () => {},
		stderr: (message: string) => console.warn(message),
	});
	send({
		type: "progress",
		message: "Your neighbours are getting ready…",
	});
	const [manifestResponse, wheelResponse] = await Promise.all([
		fetch("/runtime/python-files.json", { cache: "no-cache" }),
		fetch("/runtime/absl.whl"),
	]);
	if (!manifestResponse.ok || !wheelResponse.ok)
		throw Error("The town files could not load. Reload to try again.");
	const manifest = await manifestResponse.json();
	for (const [path, content] of Object.entries(
		manifest.files as Record<string, string>,
	)) {
		const absolute = `/town/${path}`;
		py.FS.mkdirTree(absolute.slice(0, absolute.lastIndexOf("/")));
		py.FS.writeFile(absolute, content);
	}
	py.FS.writeFile(
		"/town/absl.whl",
		new Uint8Array(await wheelResponse.arrayBuffer()),
	);
	py.registerJsModule("town_bridge", { call: dispatch });
	await py.runPythonAsync(
		`import sys, zipfile, json\nsys.path.insert(0, '/town')\nzipfile.ZipFile('/town/absl.whl').extractall('/town')\nfrom concordia.contrib.neighbours.engine import TownEngine\nfrom town_bridge import call\ntown_engine = TownEngine(call)\n`,
	);
	send({ type: "ready", view: port.runtime.view() });
}
let queue = boot().catch((error) => {
	console.error("Town startup failed", error);
	send({
		type: "error",
		message: "The town could not start. Reload to try again.",
	});
	throw error;
});
const comparisons = new Set<{ cancelled: boolean }>();
const advances = new AdvanceCancellation();
self.onmessage = (event: MessageEvent<UiCommand>) => {
	if (event.data.type === "cancel-advance") {
		advances.cancel(event.data.requestId);
		return;
	}
	if (event.data.type === "cancel-comparison") {
		for (const comparison of comparisons) comparison.cancelled = true;
		return;
	}
	let advanceCancelled: (() => boolean) | undefined;
	let advanceValidationError: unknown;
	if (event.data.type === "advance") {
		try {
			advanceCancelled = advances.begin(event.data);
		} catch (error) {
			advanceValidationError = error;
		}
	}
	const comparison =
		event.data.type === "compare" ? { cancelled: false } : undefined;
	if (comparison) comparisons.add(comparison);
	queue = queue
		.then(async () => {
			// Rejections occupy the same FIFO position as valid state commands.
			if (advanceValidationError) throw advanceValidationError;
			const q = event.data;
			const start = performance.now();
			switch (q.type) {
				case "cast-cancel": {
					const id = castRequests.get(q.requestId);
					castRequests.delete(q.requestId);
					if (id && ![...castRequests.values()].includes(id)) {
						port.wanted.delete(id);
						port.boundaries.delete(id);
					}
					break;
				}
				case "cast-capture": {
					castRequests.set(q.requestId, q.actorId);
					port.wanted.add(q.actorId);
					const r = (
						port.runtime.export() as import("./core/state.ts").Save
					).people.find((r) => r.person.id === q.actorId);
					if (
						r &&
						(!r.person.body.alive ||
							(r.person.nextDecision > 0 && !r.job && !r.person.activity))
					)
						port.boundaries.set(q.actorId, r.person);
					await flushCastCaptures();
					break;
				}
				case "advance": {
					const advance = await advanceTown(
						py,
						port,
						q,
						(value) => {
							const minute = value.now % 1440;
							const time = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
							send({
								type: "progress",
								message: `Advancing the town: ${value.rounds} of ${value.maxRounds} rounds. Day ${value.day}, ${time}.`,
								advance: value,
							});
						},
						advanceCancelled,
					);
					await flushCastCaptures();
					send({
						type: "state",
						view: port.runtime.view(),
						elapsedMs: performance.now() - start,
						advance,
					});
					advances.finish(q.requestId);
					break;
				}
				case "step": {
					const rounds = q.rounds ?? 1;
					if (!Number.isSafeInteger(rounds) || rounds < 1 || rounds > 16)
						throw Error("Choose between 1 and 16 rounds.");
					py.globals.set("requested_rounds", rounds);
					await py.runPythonAsync(
						"town_engine.advance(requested_rounds)\nNone",
					);
					await flushCastCaptures();
					send({
						type: "state",
						view: port.runtime.view(),
						elapsedMs: performance.now() - start,
					});
					break;
				}
				case "new":
					castRequests.clear();
					port.wanted.clear();
					port.boundaries.clear();
					if (q.initial) {
						await restoreCheckpoint(py, port, q.initial);
						send({
							type: "ready",
							view: port.runtime.view(),
							newRequestId: q.newRequestId,
						});
						break;
					}
					port.reset(q.seed, q.population ?? 206);
					await py.runPythonAsync("town_engine = TownEngine(call)");
					send({
						type: "ready",
						view: port.runtime.view(),
						newRequestId: q.newRequestId,
					});
					break;
				case "save":
					send({
						type: "save",
						...(q.requestId === undefined ? {} : { requestId: q.requestId }),
						save: JSON.parse(
							String(await py.runPythonAsync("json.dumps(town_engine.save())")),
						),
					});
					break;
				case "restore": {
					castRequests.clear();
					port.wanted.clear();
					port.boundaries.clear();
					await restoreCheckpoint(py, port, q.save);
					send({
						type: "state",
						view: port.runtime.view(),
						restoreRequestId: q.restoreRequestId,
					});
					break;
				}

				case "intervene":
					py.globals.set("intervention_packet", JSON.stringify(q.intervention));
					await py.runPythonAsync(
						"town_engine.intervene(json.loads(intervention_packet))\nNone",
					);
					// A player's answer is shown only after this checkpoint is on the device, so a
					// reload can never lose an answered request or let the player ask it again.
					await flushCastCaptures();
					send({
						type: "state",
						view: port.runtime.view(),
						...(q.intervention.kind.startsWith("player-")
							? {
									save: JSON.parse(
										String(
											await py.runPythonAsync("json.dumps(town_engine.save())"),
										),
									),
								}
							: {}),
					});
					break;
				case "compare": {
					const report = await compareTown(
						py,
						port,
						q.intervention,
						q.rounds,
						(message) => send({ type: "progress", message }),
						() => comparison?.cancelled ?? false,
					);
					send({ type: "comparison", report });
					if (comparison) comparisons.delete(comparison);
					break;
				}

				case "predict-speech": {
					// A pure telegraph never fails the FIFO: its error travels in its own reply.
					try {
						send({
							type: "speech-predictions",
							requestId: q.requestId,
							actorId: q.actorId,
							prediction: port.runtime.predictSpeech(q.actorId),
						});
					} catch (error) {
						send({
							type: "speech-predictions",
							requestId: q.requestId,
							actorId: q.actorId,
							error: error instanceof Error ? error.message : String(error),
						});
					}
					break;
				}
				case "inspect":
					send({
						type: "inspection",
						actorId: q.actorId,
						data: port.runtime.inspect(q.actorId),
					});
					break;
			}
		})
		.catch((error) => {
			if (event.data.type === "advance" && advanceCancelled)
				advances.finish(event.data.requestId);
			if (comparison) comparisons.delete(comparison);
			const message = error instanceof Error ? error.message : String(error);
			// The host refused before changing anything (bridge-port.ts): say why, in one line.
			const rejected = message.match(/InterventionRejected: (.+)/)?.[1]?.trim();
			send({
				type: "error",
				...(event.data.type === "new"
					? { newRequestId: event.data.newRequestId }
					: {}),
				...(event.data.type === "restore"
					? { restoreRequestId: event.data.restoreRequestId }
					: {}),
				message: rejected
					? `You cannot do that now: ${rejected}. The town has not changed.`
					: message,
			});
		});
};
