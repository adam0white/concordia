import { type Person, snapshot } from "@adam0white/human-framework";
import type { Intervention, TownRuntime } from "./contracts.ts";
import { createRuntime, restoreRuntime } from "./core/index.ts";
import type { Save } from "./core/state.ts";
/** Shared transport boundary for CPython/Node and browser Pyodide. */
export class RuntimePort {
	runtime: TownRuntime;
	readonly wanted = new Set<string>();
	readonly boundaries = new Map<string, Person>();
	constructor(seed = 42, population = 206) {
		this.runtime = createRuntime(seed, population);
	}
	reset(seed: number, population: number) {
		this.runtime = createRuntime(seed, population);
	}
	dispatch(request: Record<string, unknown>): unknown {
		const actorId = request.actorId as string;
		switch (request.op) {
			case "prepare": {
				const ready = this.runtime.prepareRound();
				if (this.wanted.size) {
					const save = this.runtime.export() as Save;
					for (const r of save.people)
						if (
							this.wanted.has(r.person.id) &&
							r.person.nextDecision > 0 &&
							!r.job &&
							!r.person.activity
						)
							this.boundaries.set(r.person.id, snapshot(r.person));
				}
				return ready;
			}
			case "observe":
				return this.runtime.getObservation(actorId);
			case "offers":
				return this.runtime.getChoices(actorId);
			case "choose":
				return this.runtime.choose(actorId);
			case "apply":
				this.runtime.apply(actorId, request.actionId as string);
				return null;
			case "view":
				return this.runtime.view();
			case "save":
				return this.runtime.export();
			case "restore":
				this.runtime = restoreRuntime(request.save);
				return null;
			case "intervene": {
				// A refusal that left the town untouched is answered as such, so the engine stays usable. Anything
				// that changed state before failing stays an error and requires a restore.
				const before = JSON.stringify(this.runtime.export());
				try {
					this.runtime.intervene(request.intervention as Intervention);
				} catch (error) {
					if (JSON.stringify(this.runtime.export()) !== before) throw error;
					return {
						rejected:
							error instanceof Error
								? error.message
								: "You cannot do that now.",
					};
				}
				return null;
			}
			case "inspect":
				return this.runtime.inspect(actorId);
			default:
				throw new Error(`Unknown operation: ${String(request.op)}`);
		}
	}
	call(text: string): string {
		try {
			const request: unknown = JSON.parse(text);
			if (!request || typeof request !== "object" || Array.isArray(request))
				throw new Error("Invalid bridge request");
			return JSON.stringify(this.dispatch(request as Record<string, unknown>));
		} catch (error) {
			return JSON.stringify({
				error:
					error instanceof Error ? error.message : "Runtime operation failed",
			});
		}
	}
}
