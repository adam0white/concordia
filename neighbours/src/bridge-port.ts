import type { TownPacket } from "./cast-session.ts";
import { checkpointSources } from "./checkpoint-source.ts";
import type { Intervention, TownRuntime } from "./contracts.ts";
import type { OwnerArchive } from "./core/hf4-owner.ts";
import type { NativeActor } from "./core/host-types.ts";
import { createRuntime, restoreRuntime } from "./core/index.ts";
import type { Runtime } from "./core/runtime.ts";
/** Shared transport boundary for CPython/Node and browser Pyodide. */
export class RuntimePort {
	runtime: TownRuntime;
	readonly wanted = new Set<string>();
	readonly boundaries = new Map<string, NativeActor>();
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
				const ready = this.runtime.prepareBoundary();
				if (this.wanted.size) {
					const save = this.runtime.export() as { owner: OwnerArchive };
					for (const request of ready.requests)
						if (
							request.kind === "action" &&
							request.stage === "start" &&
							this.wanted.has(request.person)
						) {
							const actor = save.owner.run.current.people[request.person];
							if (actor) this.boundaries.set(request.person, actor);
						}
				}
				return ready;
			}
			case "observe":
				return this.runtime.getObservation(actorId);
			case "offers":
				return this.runtime.getChoices(request.requestId as string);
			case "choose":
				return this.runtime.choose(request.requestId as string);
			case "apply":
				this.runtime.apply(
					request.requestId as string,
					request.actionId as string,
				);
				return null;
			case "view":
				return this.runtime.view();
			case "save-journal":
				return (this.runtime as Runtime).exportJournal();
			case "save":
				return this.runtime.export();
			case "validate-checkpoint-source":
				checkpointSources(request.packet as TownPacket);
				return true;
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
