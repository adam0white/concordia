import { createHash, randomBytes } from "node:crypto";
import { gzipSync } from "node:zlib";
import { expect, it } from "vitest";
import {
	decodeSave,
	encodeRecording,
	MAX_SAVE_BYTES,
} from "../src/ui/save-codec.ts";

// Codec-only fixtures: strict host/native admission remains a separate boundary.
const packet = {
	schema: "neighbours/concordia@2",
	rounds: 1,
	runtime: { history: ["Çağrı 🌳"], rng: [0, 4294967295] },
	castLocal: { sources: [], file: true },
};
function envelope(value: unknown = packet) {
	const text = JSON.stringify(value);
	return {
		schema: "neighbours/recording@1",
		codec: "gzip-base64",
		decodedBytes: Buffer.byteLength(text),
		sha256: createHash("sha256").update(text).digest("hex"),
		data: gzipSync(text).toString("base64"),
	};
}
const file = (value: unknown) => new Blob([JSON.stringify(value)]);
it("opens complete encoded recordings and actual linked save wrappers without changing any field", async () => {
	const packed = envelope();
	expect(await decodeSave(file(packed))).toEqual(packet);
	expect(await decodeSave(file({ slot: "previous", packet: packed }))).toEqual(
		packet,
	);
	expect(await decodeSave(file({ file: true, packet: packed }))).toEqual(
		packet,
	);
});
it("refuses changed hashes, sizes, codecs, base64, extra fields and nested recordings", async () => {
	const packed = envelope();
	for (const value of [
		{ ...packed, sha256: "0".repeat(64) },
		{ ...packed, decodedBytes: packed.decodedBytes + 1 },
		{ ...packed, decodedBytes: MAX_SAVE_BYTES + 1 },
		{ ...packed, codec: "other" },
		{ ...packed, data: "!" },
		{ ...packed, extra: true },
		envelope(packed),
		{ slot: "latest", packet: packed, extra: true },
		{ slot: ["latest"], packet: packed },
	])
		await expect(decodeSave(file(value))).rejects.toThrow();
});
it("bounds actual decoded expansion even when the declared size lies", async () => {
	const oversized = envelope("a".repeat(MAX_SAVE_BYTES));
	oversized.decodedBytes = 2;
	await expect(decodeSave(file(oversized))).rejects.toThrow("50 MiB");
});

it("encodes identical complete JSON deterministically with declared raw bytes and hash", async () => {
	const a = await encodeRecording(packet),
		b = await encodeRecording(packet);
	expect(a).toEqual(b);
	expect(a.decodedBytes).toBe(Buffer.byteLength(JSON.stringify(packet)));
	expect(a.sha256).toBe(
		createHash("sha256").update(JSON.stringify(packet)).digest("hex"),
	);
	expect(await decodeSave(file(a))).toEqual(packet);
});

it("opens a complete multi-megabyte base64 payload without recursive regex validation", async () => {
	const large = { history: randomBytes(2 * 1024 * 1024).toString("base64") };
	const packed = envelope(large);
	expect(packed.data.length).toBeGreaterThan(2 * 1024 * 1024);
	expect(await decodeSave(file(packed))).toEqual(large);
});
