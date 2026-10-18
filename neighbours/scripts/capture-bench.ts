/** Fresh eight-person HF capture. No injected work, knowledge, or choices. */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { canProposeBench } from "../src/core/bench-opportunity.ts";
import { presentAt } from "../src/core/encounters.ts";
import { createRuntime } from "../src/core/index.ts";
import { Runtime } from "../src/core/runtime.ts";
import type { Save } from "../src/core/state.ts";

export function captureBench(seed = 42) {
	if (!Number.isSafeInteger(seed)) throw Error("Seed must be a safe integer");
	const host = new Runtime(createRuntime(seed, 8).export() as Save);
	const deadline = host.s.now + 40 * 1440;
	while (host.s.now < deadline) {
		// Completed rounds have assigned jobs. Probe the real next decision on a
		// restored copy, retaining the preceding complete checkpoint for restore.
		if (canProposeBench(host.s)) {
			const probe = new Runtime(host.export() as Save);
			const ready = probe.prepareRound();
			// Earlier scheduled residents may leave before Ravi can ask. Execute
			// their ordinary HF choices on this disposable copy, never on the capture.
			const precedingActors: string[] = [];
			if (ready.includes("ravi")) {
				for (const id of ready) {
					if (id === "ravi") break;
					probe.apply(id, probe.choose(id));
					precedingActors.push(id);
				}
			}
			const ada = probe.s.people.find((p) => p.person.id === "ada");
			if (
				canProposeBench(probe.s) &&
				ready.includes("ravi") &&
				ada &&
				presentAt(ada, "workshop", probe.s.now) &&
				probe.affordances("ravi").some((o) => o.action === "cart-ask")
			) {
				if (host.s.pending.length)
					throw Error("Capture is not a complete boundary");
				return {
					checkpoint: {
						schema: "neighbours/concordia@1",
						rounds: host.s.round,
						runtime: host.export() as Save,
					},
					captureEvidence: {
						seed,
						population: 8,
						completeBoundaryAt: host.s.now,
						nextDecisionAt: probe.s.now,
						premiseAdmissibleAtBoundary: true,
						premiseAdmissibleAtNextDecision: true,
						raviPlaceAtBoundary: host.actor("ravi").place,
						raviPhysicalPlaceAtBoundary:
							host.actor("ravi").job &&
							(host.actor("ravi").job?.arrive ?? Infinity) <= host.s.now
								? host.actor("ravi").job?.offer.placeId
								: host.actor("ravi").place,
						raviPresentAtWorkshop: presentAt(
							host.actor("ravi"),
							"workshop",
							host.s.now,
						),
						raviLegalAction: "cart-ask",
						precedingScheduledActors: precedingActors,
						raviLegalOfferIds: probe
							.affordances("ravi")
							.map((offer) => offer.id),
						adaPresentAtWorkshop: true,
						cartProgress: probe.s.handcart?.progress,
						method:
							"First natural premise-admissible complete boundary with an actual scheduled next-round legal cart-ask decision after preceding residents choose normally on a disposable copy; no Ravi choice or outcome selection",
					},
				};
			}
		}
		host.step();
	}
	throw Error(
		`No natural premise-admissible boundary with a genuine Ravi cart-ask decision within 40 days for seed ${seed}`,
	);
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
	const value = (flag: string) => process.argv[process.argv.indexOf(flag) + 1];
	if (
		!process.argv.includes("--output-directory") ||
		!value("--output-directory")
	)
		throw Error("Use --output-directory PATH");
	const directory = resolve(value("--output-directory") as string);
	const seed = process.argv.includes("--seed") ? Number(value("--seed")) : 42;
	const captured = captureBench(seed);
	mkdirSync(directory, { recursive: true });
	writeFileSync(
		resolve(directory, "checkpoint.json"),
		`${JSON.stringify(captured.checkpoint)}\n`,
	);
	writeFileSync(
		resolve(directory, "capture-evidence.json"),
		`${JSON.stringify(captured.captureEvidence)}\n`,
	);
	console.log(JSON.stringify(captured.captureEvidence));
}
