/** Exercise actual WASM Python, native Python, the shared bridge and restore. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { loadPyodide } from "pyodide";
import { RuntimePort } from "../src/bridge-port.ts";
import { compareTown } from "../src/comparison.ts";
import { restoreCheckpoint } from "../src/python-session.ts";

const app = resolve(import.meta.dirname, "..");
const root = resolve(app, "..");
const temporary = await mkdtemp(resolve(tmpdir(), "neighbours-parity-"));
try {
	const packetPath = resolve(temporary, "native.json");
	execFileSync(
		process.env.PYTHON ?? "python3",
		[
			resolve(app, "scripts/run-town.py"),
			"--rounds",
			"12",
			"--seed",
			"77",
			"--population",
			"208",
			"--output",
			packetPath,
		],
		{
			cwd: root,
			env: { ...process.env, NODE: process.execPath },
			stdio: "pipe",
		},
	);
	const native = JSON.parse(await readFile(packetPath, "utf8"));
	const py = await loadPyodide({
		indexURL: `${resolve(app, "public/runtime")}/`,
		stdout: () => {},
		stderr: console.error,
	});
	const manifest = JSON.parse(
		await readFile(resolve(app, "public/runtime/python-files.json"), "utf8"),
	);
	for (const [path, contents] of Object.entries(manifest.files)) {
		const absolute = `/town/${path}`;
		py.FS.mkdirTree(absolute.slice(0, absolute.lastIndexOf("/")));
		py.FS.writeFile(absolute, contents);
	}
	py.FS.writeFile(
		"/town/absl.whl",
		await readFile(resolve(app, "public/runtime/absl.whl")),
	);
	const port = new RuntimePort(77, 208);
	py.registerJsModule("town_bridge", { call: (text) => port.call(text) });
	await py.runPythonAsync(
		"import sys, zipfile, json\nsys.path.insert(0, '/town')\nzipfile.ZipFile('/town/absl.whl').extractall('/town')\nfrom concordia.contrib.neighbours.engine import TownEngine\nfrom town_bridge import call\ne = TownEngine(call)\ne.advance(6)\nNone",
	);
	const halfway = String(await py.runPythonAsync("json.dumps(e.save())"));
	await py.runPythonAsync("e.advance(6)\nNone");
	const complete = JSON.parse(
		String(await py.runPythonAsync("json.dumps(e.save())")),
	);
	assert.deepEqual(
		complete,
		native.checkpoint,
		"Actual WASM/native checkpoints differ",
	);
	py.globals.set("halfway", halfway);
	await py.runPythonAsync("e.restore(json.loads(halfway))\ne.advance(6)\nNone");
	assert.deepEqual(
		JSON.parse(String(await py.runPythonAsync("json.dumps(e.save())"))),
		complete,
		"WASM restored continuation differs",
	);
	// An actual interrupted Python round leaves its engine unable to save.
	await py.runPythonAsync("town_engine = e\ntown_engine._ready = False");
	await restoreCheckpoint(py, port, complete);
	assert.deepEqual(
		JSON.parse(
			String(await py.runPythonAsync("json.dumps(town_engine.save())")),
		),
		complete,
		"Cannot recover an interrupted engine",
	);
	const priorRuntime = port.runtime;
	await assert.rejects(restoreCheckpoint(py, port, { schema: "broken" }));
	assert.equal(
		port.runtime,
		priorRuntime,
		"Rejected import replaced the healthy runtime",
	);
	await py.runPythonAsync("town_engine.advance(1)\nNone");
	assert.equal(
		port.runtime.view().now,
		native.view.now + 15,
		"Rejected import broke subsequent progress",
	);

	const original = port.runtime;
	const originalPacket = String(
		await py.runPythonAsync("json.dumps(town_engine.save())"),
	);
	const report = await compareTown(py, port, { kind: "lend-tools" }, 4);
	assert.equal(port.runtime, original, "Comparison replaced live runtime");
	assert.equal(
		String(await py.runPythonAsync("json.dumps(town_engine.save())")),
		originalPacket,
		"Comparison changed live checkpoint",
	);
	assert.equal(
		report.treatment.stats.totalTools - report.baseline.stats.totalTools,
		3,
		"Treatment did not conserve the lent tools",
	);
	assert.equal(report.startHash.length, 64);
	assert.equal(report.endAt - report.startAt, 60);
	await py.runPythonAsync(
		"town_engine.intervene({'kind':'lend-tools'})\ntown_engine.intervene({'kind':'lend-tools'})\ntown_engine.intervene({'kind':'lend-tools'})\nNone",
	);
	const exhausted = String(
		await py.runPythonAsync("json.dumps(town_engine.save())"),
	);
	await assert.rejects(
		compareTown(py, port, { kind: "lend-tools" }, 4),
		/allowance/,
	);
	assert.equal(
		port.runtime,
		original,
		"Failed comparison replaced live runtime",
	);
	assert.equal(
		String(await py.runPythonAsync("json.dumps(town_engine.save())")),
		exhausted,
		"Failed comparison changed live checkpoint",
	);
	await py.runPythonAsync("town_engine.advance(1)\nNone");

	console.log(
		"PASS: 208 HF people match across native/WASM Python; restore, interrupted-engine recovery and isolated comparisons pass.",
	);
} finally {
	await rm(temporary, { recursive: true, force: true });
}
