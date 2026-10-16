import type { RuntimePort } from "./bridge-port.ts";
export interface PythonSession {
	runPythonAsync(code: string): Promise<unknown>;
	globals: { set(name: string, value: unknown): void };
}
/** A damaged engine cannot save. Validate a replacement without asking it to. */
export async function restoreCheckpoint(
	py: PythonSession,
	port: RuntimePort,
	packet: unknown,
): Promise<void> {
	const previous = port.runtime;
	py.globals.set("import_packet", JSON.stringify(packet));
	try {
		await py.runPythonAsync(
			"candidate_engine = TownEngine(call)\ncandidate_engine.restore(json.loads(import_packet))\ntown_engine = candidate_engine\ndel candidate_engine",
		);
	} catch (error) {
		// RuntimePort.restore constructs a new validated runtime before replacing it.
		// Keep the former object even if an unexpected later Python error occurred.
		port.runtime = previous;
		throw error;
	} finally {
		await py.runPythonAsync(
			"globals().pop('candidate_engine', None)\nglobals().pop('import_packet', None)\nNone",
		);
	}
}
