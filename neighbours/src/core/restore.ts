import { restoreRunJournal } from "@adam0white/human-framework";
import type { Intervention, TownRuntime } from "../contracts.ts";
import { HF_VERSION } from "./hf-version.ts";
import { TownRunOwner } from "./hf4-owner.ts";
import {
	type JournalTownArchive,
	type NativeTownArchive,
	Runtime,
} from "./runtime.ts";
import { createRuntime } from "./scenario.ts";
import { known, SCHEMA } from "./state.ts";

/** JSON object order is immaterial. Array slots and scalar identity remain exact.
 * Scope: current native host + Run restore. Old 3.x saves require a fresh town.
 */
export function sameJSONValue(a: unknown, b: unknown): boolean {
	if (Object.is(a, b)) return true;
	if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
	if (Array.isArray(a) || Array.isArray(b)) {
		if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length)
			return false;
		for (let i = 0; i < a.length; i++)
			if (
				!Object.hasOwn(a, i) ||
				!Object.hasOwn(b, i) ||
				!sameJSONValue(a[i], b[i])
			)
				return false;
		return true;
	}
	const left = a as Record<string, unknown>,
		right = b as Record<string, unknown>;
	const keys = Object.keys(left).filter((key) => left[key] !== undefined);
	return (
		keys.length ===
			Object.keys(right).filter((key) => right[key] !== undefined).length &&
		keys.every(
			(key) =>
				Object.hasOwn(right, key) && sameJSONValue(left[key], right[key]),
		)
	);
}
/** Validate the closed public schema, exact engine and all accepted transactions.
 * Release this temporary Run before separately replaying the complete host controls. */
function validateJournal(input: unknown): void {
	const restored = restoreRunJournal(input);
	if (!restored.ok) throw Error(restored.error.message);
}
export function restoreRuntime(input: unknown): TownRuntime {
	if (!input || typeof input !== "object" || Array.isArray(input))
		throw Error("Invalid town save");
	const archive = input as NativeTownArchive | JournalTownArchive;
	if (
		(archive.format !== "neighbours-native" &&
			archive.format !== "neighbours-journal") ||
		archive.schema !== SCHEMA ||
		archive.hf !== HF_VERSION ||
		!archive.physical ||
		!archive.owner ||
		!archive.boundary ||
		!Array.isArray(archive.inputs) ||
		!Array.isArray(archive.physical.people)
	)
		throw Error(
			"Unsupported town save. Start a fresh HF4 town; historical 3.x reports remain readable separately.",
		);
	if (archive.format === "neighbours-journal")
		validateJournal(archive.owner.journal);
	const owner =
		archive.format === "neighbours-native"
			? TownRunOwner.restore(archive.owner)
			: null;
	// Rebuild every host consequence from actual accepted public controls. This also
	// validates canonical offer bodies, resource ledgers, pending receipts and counters.
	// No person, time, RNG, fingerprint or private history is patched to make it fit.
	const replayed = createRuntime(
		archive.physical.seed,
		archive.physical.people.length,
	);
	for (const record of archive.inputs) {
		if (!record || typeof record !== "object")
			throw Error("Malformed town replay input");
		if (record.op === "prepare" && Object.keys(record).length === 1)
			replayed.prepareBoundary();
		else if (
			record.op === "apply" &&
			Object.keys(record).length === 3 &&
			typeof record.requestId === "string" &&
			typeof record.actionId === "string"
		)
			replayed.apply(record.requestId, record.actionId);
		else if (record.op === "lifecycle" && Object.keys(record).length === 3)
			(replayed as Runtime).receiveLifecycle(
				record.receipt as import("@adam0white/human-framework").LifecycleReceipt,
			);
		else if (
			record.op === "intervene" &&
			Object.keys(record).length === 2 &&
			record.input &&
			typeof record.input === "object"
		)
			replayed.intervene(record.input as Intervention);
		else throw Error("Unsupported town replay input");
	}
	// After public journal validation, independently execute every host control
	// and compare all native transaction outcomes/digests plus host/owner fields.
	// Keep only this replayed owner alive; never install supplied current state.
	const regenerated =
		archive.format === "neighbours-journal"
			? (replayed as Runtime).exportJournal()
			: replayed.export();
	if (!sameJSONValue(archive, regenerated))
		throw Error("Town replay differs from host rules or native Run");
	if (archive.format === "neighbours-journal") return replayed;
	if (!owner) throw Error("Missing validated native owner");
	return Runtime.hydrate(archive, owner);
}
/** Historical callers can no longer substitute a roster into a current Run. */
export function restoreWithRoster(
	input: unknown,
	roster: string[][],
): TownRuntime {
	if (!sameJSONValue(roster, known))
		throw Error("Current HF4 towns use the canonical roster");
	return restoreRuntime(input);
}
