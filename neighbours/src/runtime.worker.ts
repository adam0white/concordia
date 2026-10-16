/// <reference lib="webworker" />

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
async function boot() {
	send({
		type: "progress",
		message: "Loading the Python runtime. This first download is about 13 MB.",
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
		message: "Connecting Concordia to 208 Human Framework people…",
	});
	const [manifestResponse, wheelResponse] = await Promise.all([
		fetch("/runtime/python-files.json", { cache: "no-cache" }),
		fetch("/runtime/absl.whl"),
	]);
	if (!manifestResponse.ok || !wheelResponse.ok)
		throw Error("Python runtime assets could not load");
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
	send({ type: "error", message: `Python could not start: ${String(error)}` });
	throw error;
});
self.onmessage = (event: MessageEvent<UiCommand>) => {
	queue = queue
		.then(async () => {
			const q = event.data;
			const start = performance.now();
			switch (q.type) {
				case "step": {
					const rounds = q.rounds ?? 1;
					if (!Number.isSafeInteger(rounds) || rounds < 1 || rounds > 16)
						throw Error("Choose between 1 and 16 rounds");
					py.globals.set("requested_rounds", rounds);
					await py.runPythonAsync(
						"town_engine.advance(requested_rounds)\nNone",
					);
					send({
						type: "state",
						view: port.runtime.view(),
						elapsedMs: performance.now() - start,
					});
					break;
				}
				case "new":
					port.reset(q.seed, q.population ?? 208);
					await py.runPythonAsync("town_engine = TownEngine(call)");
					send({ type: "ready", view: port.runtime.view() });
					break;
				case "save":
					send({
						type: "save",
						save: JSON.parse(
							String(await py.runPythonAsync("json.dumps(town_engine.save())")),
						),
					});
					break;
				case "restore": {
					await restoreCheckpoint(py, port, q.save);
					send({ type: "state", view: port.runtime.view() });
					break;
				}

				case "intervene":
					py.globals.set("intervention_packet", JSON.stringify(q.intervention));
					await py.runPythonAsync(
						"town_engine.intervene(json.loads(intervention_packet))\nNone",
					);
					send({ type: "state", view: port.runtime.view() });
					break;
				case "compare": {
					const report = await compareTown(
						py,
						port,
						q.intervention,
						q.rounds,
						(message) => send({ type: "progress", message }),
					);
					send({ type: "comparison", report });
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
			send({
				type: "error",
				message: error instanceof Error ? error.message : String(error),
			});
		});
};
