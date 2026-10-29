/** Capture actual choices for regression controls. Never inject a successful event. */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { holds } from "../src/core/cast.ts";
import {
	allEvenings,
	canAdvertiseEvening,
	canOpenEveningSlot,
} from "../src/core/evenings.ts";
import { createRuntime } from "../src/core/index.ts";
import { Runtime } from "../src/core/runtime.ts";
import type { Save } from "../src/core/state.ts";

type Packet = { schema: string; rounds: number; runtime: Save };
export function captureWeekly(exhaustOriginal = false, seed = 42) {
	const host = new Runtime(createRuntime(seed, 8).export() as Save);
	if (exhaustOriginal)
		for (let i = 0; i < 3; i++) host.intervene({ kind: "lend-tools" });
	let candidate: Packet | undefined;
	for (let round = 0; round < 96 * 40; round++) {
		host.step();
		const events = allEvenings(host.s);
		const packet = (): Packet => ({
			schema: "neighbours/concordia@1",
			rounds: host.s.round,
			runtime: host.export() as Save,
		});
		if (
			!candidate &&
			events.some(
				(e) =>
					holds(host.actor(e.organiserId), "teacher") &&
					canOpenEveningSlot(host.s, e),
			)
		)
			candidate = packet();
		if (
			candidate &&
			events.some(
				(e) => e.cycle !== undefined && canAdvertiseEvening(host.s, e),
			)
		)
			return { candidate, notice: packet() };
	}
	throw Error("A genuine weekly opportunity did not occur");
}
if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
	const directory =
		process.argv[process.argv.indexOf("--output-directory") + 1];
	if (!process.argv.includes("--output-directory") || !directory)
		throw Error("Use --output-directory PATH");
	mkdirSync(directory, { recursive: true });
	for (const [name, packet] of Object.entries(
		captureWeekly(
			false,
			process.argv.includes("--seed")
				? Number(process.argv[process.argv.indexOf("--seed") + 1])
				: 42,
		),
	)) {
		writeFileSync(
			resolve(directory, `${name}.json`),
			`${JSON.stringify(packet)}\n`,
		);
		console.log(
			`${name}: ${packet.runtime.people.length} actual HF people, round ${packet.rounds}`,
		);
	}
}
