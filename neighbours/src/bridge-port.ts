import type { Intervention, TownRuntime } from "./contracts.ts";
import { createRuntime, restoreRuntime } from "./core/index.ts";
/** Shared transport boundary for CPython/Node and browser Pyodide. */
export class RuntimePort {
	runtime: TownRuntime;
	constructor(seed = 42, population = 208) {
		this.runtime = createRuntime(seed, population);
	}
	reset(seed: number, population: number) {
		this.runtime = createRuntime(seed, population);
	}
	dispatch(request: Record<string, unknown>): unknown {
		const actorId = request.actorId as string;
		switch (request.op) {
			case "prepare":
				return this.runtime.prepareRound();
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
			case "intervene":
				this.runtime.intervene(request.intervention as Intervention);
				return null;
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
