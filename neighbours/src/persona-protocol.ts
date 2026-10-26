/** Synchronous SDK0.4.11 envelope protocol for native/Pyodide restore.
 * Uses the SDK's public JSON bounds/canonicalization and the same SHA-256 body checksum.
 * This checks consistency, not authentication. No person model or ownership service lives here.
 */
import {
	boundedPersonaJson,
	canonicalPersona,
	type PersonaEnvelope,
} from "@adam0white/lab-client";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

export function personaDigest(value: unknown): string {
	return bytesToHex(sha256(new TextEncoder().encode(canonicalPersona(value))));
}
const token = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const hash = /^[a-f0-9]{64}$/;
export function validateReceivingPersona(value: unknown): PersonaEnvelope {
	boundedPersonaJson(value);
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw Error("Invalid persona.");
	const p = value as PersonaEnvelope;
	const keys = [
		"format",
		"castId",
		"castRevision",
		"branchId",
		"revision",
		"parentRevision",
		"source",
		"transfer",
		"limitations",
	];
	if (
		Object.keys(p).some((k) => !keys.includes(k) && k !== "terminal") ||
		keys.some((k) => !Object.hasOwn(p, k)) ||
		(p.terminal !== undefined &&
			(!p.terminal ||
				Object.keys(p.terminal).sort().join(",") !== "at,kind" ||
				p.terminal.kind !== "dead" ||
				!Number.isSafeInteger(p.terminal.at) ||
				p.terminal.at < 0)) ||
		p.format !== "hf-persona/1" ||
		![p.castId, p.castRevision, p.branchId].every(
			(v) => typeof v === "string" && token.test(v),
		) ||
		["constructor", "prototype", "__proto__"].includes(p.castId) ||
		typeof p.revision !== "string" ||
		!hash.test(p.revision) ||
		!(
			p.parentRevision === null ||
			(typeof p.parentRevision === "string" && hash.test(p.parentRevision))
		) ||
		!p.source ||
		Object.keys(p.source).sort().join(",") !== "build,engine,game,rules" ||
		!Object.values(p.source).every(
			(v) => typeof v === "string" && token.test(v),
		) ||
		!p.transfer ||
		typeof p.transfer !== "object" ||
		Array.isArray(p.transfer) ||
		!Array.isArray(p.limitations) ||
		p.limitations.length > 64 ||
		!p.limitations.every((v) => typeof v === "string" && v.length <= 500)
	)
		throw Error("Invalid persona envelope.");
	const { revision, ...body } = p;
	if (personaDigest(body) !== revision)
		throw Error("Persona checksum does not match.");
	return structuredClone(p);
}
