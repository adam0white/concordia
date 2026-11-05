import type { TownRuntime } from "../contracts.ts";
import { Runtime } from "./runtime.ts";

/** Only live owned objects may branch. Files and bridge restores still replay strictly. */
export function forkRuntime(runtime: TownRuntime): Runtime {
	if (!(runtime instanceof Runtime))
		throw Error("Expected a live town runtime");
	return runtime.fork();
}
