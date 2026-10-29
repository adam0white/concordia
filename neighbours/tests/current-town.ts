/** Current public Run fixture. No historical Person constructor or mutable actor facade. */
import {
	createRuntime as create,
	restoreRuntime as restore,
} from "../src/core/index.ts";
import type { Runtime } from "../src/core/runtime.ts";

export { stateHash } from "../src/core/hash.ts";
export function createRuntime(seed = 42, population = 6): Runtime {
	return create(seed, population) as Runtime;
}
export function restoreRuntime(value: unknown): Runtime {
	return restore(value) as Runtime;
}
