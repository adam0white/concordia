import type { RuntimePort } from "./bridge-port.ts";
import type { Intervention, TownComparison, TownView } from "./contracts.ts";
import { type PythonSession, restoreCheckpoint } from "./python-session.ts";

function project(view: TownView): TownComparison["baseline"] {
	const known = view.people
		.filter((p) => p.known)
		.map(({ id, name, activity, wealth }) => ({ id, name, activity, wealth }));
	return {
		stats: {
			...view.stats,
			hallCapacity: view.places.find((p) => p.id === "hall")?.capacity ?? 0,
			inspectionRequests: view.assistance ? 1 : 0,
			annexOpened: view.assistance?.opened ? 1 : 0,
			availableFood: view.places.reduce((n, p) => n + p.stock, 0),
			totalKnownWealth: known.reduce((n, p) => n + p.wealth, 0),
		},
		known,
		stories: view.stories.map(({ title, summary }) => ({ title, summary })),
	};
}
/** Two isolated futures. The original runtime and Python engine are never advanced. */
export async function compareTown(
	py: PythonSession,
	port: RuntimePort,
	intervention: Intervention,
	rounds: number,
	progress: (message: string) => void = () => {},
	cancelled: () => boolean = () => false,
): Promise<TownComparison> {
	if (!Number.isSafeInteger(rounds) || rounds < 1 || rounds > 672)
		throw Error("Comparison must cover between 1 and 672 rounds");
	if (
		!intervention ||
		![
			"lend-tools",
			"restore-bus",
			"share-news",
			"open-evening-slot",
			"advertise-evening",
			"request-inspection",
		].includes(intervention.kind)
	)
		throw Error("Unknown comparison intervention");
	const checkCancellation = () => {
		if (cancelled())
			throw Error("Comparison cancelled. The live town is unchanged.");
	};
	checkCancellation();
	const originalRuntime = port.runtime;
	const start = originalRuntime.view();
	if (start.people.some((p) => p.policy === "llm"))
		throw Error(
			"Browser comparison requires local controllers; an LLM response tape belongs in the native runner",
		);
	const packet = String(
		await py.runPythonAsync("json.dumps(town_engine.save())"),
	);
	const bytes = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(packet),
	);
	const startHash = Array.from(new Uint8Array(bytes), (x) =>
		x.toString(16).padStart(2, "0"),
	).join("");
	await py.runPythonAsync("comparison_original_engine = town_engine");
	py.globals.set("comparison_rounds", rounds);
	py.globals.set("comparison_intervention", JSON.stringify(intervention));
	const advance = async (label: string) => {
		for (let completed = 0; completed < rounds; ) {
			checkCancellation();
			const chunk = Math.min(8, rounds - completed);
			py.globals.set("comparison_chunk", chunk);
			await py.runPythonAsync("town_engine.advance(comparison_chunk)\nNone");
			completed += chunk;
			progress(
				`${label}: ${completed} of ${rounds} rounds (${Math.round((completed / rounds) * 100)}%).`,
			);
			await new Promise((resolve) => setTimeout(resolve, 0));
		}
		checkCancellation();
	};
	try {
		progress("Comparing the unchanged conditions…");
		await restoreCheckpoint(py, port, JSON.parse(packet));
		await advance("Unchanged conditions");
		const baseline = project(port.runtime.view());
		progress("Comparing the intervention from the same checkpoint…");
		await restoreCheckpoint(py, port, JSON.parse(packet));
		await py.runPythonAsync(
			"town_engine.intervene(json.loads(comparison_intervention))\nNone",
		);
		await advance("Changed conditions");
		const result = port.runtime.view();
		return {
			schema: "town-comparison@1",
			seed: start.seed,
			startAt: start.now,
			endAt: result.now,
			rounds,
			startHash,
			intervention: { ...intervention },
			baseline,
			treatment: project(result),
			limits: [
				"One paired local run from an identical checkpoint, not an average effect across a population.",
				"Weather and external deliveries use the same keyed events; residents may make different choices after the changed circumstance.",
				"The allowance is spent only inside the hypothetical intervention branch. The live town is unchanged.",
				"All controllers here run locally. No model call or generated dialogue is used.",
			],
		};
	} finally {
		port.runtime = originalRuntime;
		await py.runPythonAsync(
			"town_engine = comparison_original_engine\ndel comparison_original_engine\nglobals().pop('comparison_rounds', None)\nglobals().pop('comparison_intervention', None)\nglobals().pop('comparison_chunk', None)\nNone",
		);
	}
}
