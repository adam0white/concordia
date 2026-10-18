/** Exercise actual WASM Python, native Python, the shared bridge and restore. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { loadPyodide } from "pyodide";
import { advanceTown } from "../src/advance-town.ts";
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
	await assert.rejects(
		compareTown(py, port, { kind: "lend-tools" }, 673),
		/between 1 and 672/,
	);
	assert.equal(
		port.runtime,
		original,
		"Out-of-bounds comparison touched live runtime",
	);
	assert.equal(
		String(await py.runPythonAsync("json.dumps(town_engine.save())")),
		originalPacket,
		"Out-of-bounds comparison changed live checkpoint",
	);
	await assert.rejects(
		compareTown(py, port, { kind: "advertise-evening", eventId: "missing" }, 4),
		/no longer available/,
	);
	assert.equal(
		port.runtime,
		original,
		"Bad contextual comparison replaced live runtime",
	);
	assert.equal(
		String(await py.runPythonAsync("json.dumps(town_engine.save())")),
		originalPacket,
		"Bad contextual comparison changed live Python checkpoint",
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

	// These are actual live advances, unlike the isolated comparison futures.
	// Match the complete Python/HF checkpoint against plain native continuation.
	const advanceStartPath = resolve(temporary, "advance-start.json");
	await writeFile(advanceStartPath, JSON.stringify(native.checkpoint));
	const assertAdvanceParity = async (label, rounds) => {
		const expectedPath = resolve(temporary, `advance-${label}.json`);
		execFileSync(
			process.env.PYTHON ?? "python3",
			[
				resolve(app, "scripts/run-town.py"),
				"--restore",
				advanceStartPath,
				"--rounds",
				String(rounds),
				"--output",
				expectedPath,
			],
			{
				cwd: root,
				env: { ...process.env, NODE: process.execPath },
				stdio: "pipe",
			},
		);
		const expected = JSON.parse(await readFile(expectedPath, "utf8"));
		assert.deepEqual(
			JSON.parse(
				String(await py.runPythonAsync("json.dumps(town_engine.save())")),
			),
			expected.checkpoint,
			`Actual ${label} advance differs from complete native continuation`,
		);
	};
	await restoreCheckpoint(py, port, native.checkpoint);
	const initialStoryIds = new Set(
		port.runtime.view().stories.map((story) => story.id),
	);
	const advancedStory = await advanceTown(py, port, {
		type: "advance",
		requestId: 1,
		until: "story",
		maxRounds: 16,
	});
	assert(advancedStory.rounds > 0 && advancedStory.rounds <= 16);
	const newStory = port.runtime
		.view()
		.stories.some((story) => !initialStoryIds.has(story.id));
	if (advancedStory.reason === "story") assert(newStory);
	else {
		assert.equal(advancedStory.reason, "horizon");
		assert.equal(advancedStory.rounds, 16);
		assert.equal(
			newStory,
			false,
			"Advance passed a real new story without stopping",
		);
	}
	await assertAdvanceParity("story", advancedStory.rounds);
	console.log(
		`PASS: actual WASM advance stops for ${advancedStory.reason} after ${advancedStory.rounds} rounds and matches the complete native checkpoint`,
	);
	await restoreCheckpoint(py, port, native.checkpoint);
	const backgroundPerson = port.runtime
		.view()
		.people.find((person) => !person.known);
	assert(
		backgroundPerson,
		"Cancellation probe needs an actual background person",
	);
	let stopAdvance = false;
	const advancedCancellation = await advanceTown(
		py,
		port,
		{
			type: "advance",
			requestId: 2,
			until: "person-story",
			actorId: backgroundPerson.id,
			maxRounds: 16,
		},
		(progress) => {
			assert.equal(progress.now, port.runtime.view().now);
			assert.equal(progress.day, port.runtime.view().day);
			if (progress.rounds === 8) stopAdvance = true;
		},
		() => stopAdvance,
	);
	assert.deepEqual(advancedCancellation, {
		requestId: 2,
		reason: "cancelled",
		rounds: 8,
	});
	assert.equal(port.runtime.view().now, native.view.now + 8 * 15);
	await assertAdvanceParity("cancelled", advancedCancellation.rounds);
	console.log(
		"PASS: cancellation after eight actual WASM rounds retains live progress and matches the complete native checkpoint",
	);
	// Keep subsequent checks independent of the real advances and spent allowance.
	await restoreCheckpoint(py, port, native.checkpoint);

	// Optional real, late-world checkpoints exercise reservations, invitations and
	// repaired objects through the actual Python engine in both runtimes.
	const checkpointArgs = process.argv.slice(2);
	assert(
		checkpointArgs.length % 2 === 0,
		"Use --checkpoint PATH or --checkpoint-directory DIR pairs",
	);
	const checkpointPaths = [];
	for (let i = 0; i < checkpointArgs.length; i += 2) {
		const flag = checkpointArgs[i],
			value = checkpointArgs[i + 1];
		if (flag === "--checkpoint") checkpointPaths.push(resolve(value));
		else {
			assert.equal(flag, "--checkpoint-directory");
			const entries = (await readdir(value))
				.filter((name) => name.endsWith(".json"))
				.sort();
			assert(entries.length > 0, "No late-world checkpoints were produced");
			checkpointPaths.push(...entries.map((name) => resolve(value, name)));
		}
	}
	const contextualChecks = new Set();
	for (const [i, sourcePath] of checkpointPaths.entries()) {
		const source = JSON.parse(await readFile(sourcePath, "utf8"));
		const checkpoint = source.checkpoint ?? source;
		assert.equal(checkpoint.schema, "neighbours/concordia@1");
		assert.equal(checkpoint.runtime.pending.length, 0);
		const expectedPath = resolve(temporary, `continued-${i}.json`);
		execFileSync(
			process.env.PYTHON ?? "python3",
			[
				resolve(app, "scripts/run-town.py"),
				"--restore",
				sourcePath,
				"--rounds",
				"16",
				"--output",
				expectedPath,
			],
			{
				cwd: root,
				env: { ...process.env, NODE: process.execPath },
				stdio: "pipe",
			},
		);
		const expected = JSON.parse(await readFile(expectedPath, "utf8"));
		await restoreCheckpoint(py, port, checkpoint);
		const contextualView = port.runtime.view();
		for (const [kind, eligibility] of [
			["open-evening-slot", "canOpenSlot"],
			["advertise-evening", "canAdvertise"],
		]) {
			if (contextualChecks.has(kind) || !contextualView.controlsRemaining)
				continue;
			const evening = contextualView.evenings?.find(
				(event) => event[eligibility],
			);
			if (!evening) continue;
			const liveRuntime = port.runtime;
			const livePacket = String(
				await py.runPythonAsync("json.dumps(town_engine.save())"),
			);
			const input = { kind, eventId: evening.id };
			const paired = await compareTown(py, port, input, 672);
			assert.deepEqual(
				paired.intervention,
				input,
				"Context event target was dropped",
			);
			assert.equal(paired.rounds, 672);
			assert.equal(paired.endAt - paired.startAt, 7 * 1440);
			assert.equal(
				port.runtime,
				liveRuntime,
				"Week comparison replaced the live runtime",
			);
			assert.equal(
				String(await py.runPythonAsync("json.dumps(town_engine.save())")),
				livePacket,
				"Week comparison changed the complete live Python checkpoint",
			);
			contextualChecks.add(kind);
			console.log(
				`PASS: actual WASM paired seven-day ${kind} (${evening.id}) preserves live checkpoint from ${sourcePath}`,
			);
		}
		await py.runPythonAsync("town_engine.advance(16)\nNone");
		const actual = JSON.parse(
			String(await py.runPythonAsync("json.dumps(town_engine.save())")),
		);
		assert.deepEqual(
			actual,
			expected.checkpoint,
			`Late-world native/WASM mismatch: ${sourcePath}`,
		);
		const actualView = JSON.parse(
			String(await py.runPythonAsync("json.dumps(town_engine.view())")),
		);
		assert.deepEqual(
			actualView,
			expected.view,
			`Late-world native/WASM view mismatch: ${sourcePath}`,
		);
		await restoreCheckpoint(py, port, actual);
		assert.deepEqual(
			JSON.parse(
				String(await py.runPythonAsync("json.dumps(town_engine.save())")),
			),
			actual,
		);
		console.log(
			`PASS: native/WASM sixteen-round continuation and restore from ${sourcePath}`,
		);
	}

	// Cancellation needs a legal intervention, independent of late restored towns.
	await restoreCheckpoint(py, port, native.checkpoint);
	const cancellationRuntime = port.runtime;
	const cancellationPacket = String(
		await py.runPythonAsync("json.dumps(town_engine.save())"),
	);
	let stopComparison = false;
	await assert.rejects(
		compareTown(
			py,
			port,
			{ kind: "lend-tools" },
			16,
			(message) => {
				if (message.includes("8 of 16")) stopComparison = true;
			},
			() => stopComparison,
		),
		/Comparison cancelled/,
	);
	assert(
		stopComparison,
		"Cancellation did not occur after actual branch advancement",
	);
	assert.equal(port.runtime, cancellationRuntime);
	assert.equal(
		String(await py.runPythonAsync("json.dumps(town_engine.save())")),
		cancellationPacket,
	);
	console.log(
		"PASS: cancellation after actual WASM branch advancement restores the full live checkpoint",
	);
	if (checkpointPaths.length)
		console.log(
			`Contextual seven-day checks exercised: ${[...contextualChecks].join(", ") || "none eligible in supplied checkpoints"}`,
		);
	console.log(
		"PASS: 208 HF people match across native/WASM Python; restore, interrupted-engine recovery and isolated comparisons pass.",
	);
} finally {
	await rm(temporary, { recursive: true, force: true });
}
