import { sha256 } from "@noble/hashes/sha2.js";
export function canonicalJson(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
	return `{${Object.entries(value)
		.filter(([, item]) => item !== undefined)
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
		.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
		.join(",")}}`;
}
export function canonicalHash(value: unknown): string {
	return Array.from(
		sha256(new TextEncoder().encode(canonicalJson(value))),
		(byte) => byte.toString(16).padStart(2, "0"),
	).join("");
}
