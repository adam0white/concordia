import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
	decodeSave,
	encodeSave,
	MAX_COMPRESSED_SAVE_BYTES,
	MAX_SAVE_BYTES,
} from "../src/ui/save-codec";

function gzipFile(bytes: Uint8Array) {
	return new File([bytes as Uint8Array<ArrayBuffer>], "town.json.gz");
}

describe("shareable complete save files", () => {
	it("roundtrips exact runtime JSON with Unicode, retained history and RNG state", async () => {
		const packet = {
			version: 3,
			runtime: {
				now: 65000,
				rng: [0, 4294967295],
				people: [{ name: "Çağrı 🌳", memories: ["meal", "teaching"] }],
				history: Array.from({ length: 500 }, (_, round) => ({ round })),
			},
		};
		const compressed = await encodeSave(packet);
		expect(compressed.type).toBe("application/gzip");
		expect(compressed.size).toBeLessThan(JSON.stringify(packet).length);
		expect(JSON.stringify(await decodeSave(compressed))).toBe(
			JSON.stringify(packet),
		);
	});

	it("imports existing plain JSON and gzip detected by content", async () => {
		const json = '{"runtime":{"now":123,"people":[]}}';
		expect(await decodeSave(new File([json], "old.json"))).toEqual(
			JSON.parse(json),
		);
		expect(await decodeSave(new Blob([gzipSync(json)]))).toEqual(
			JSON.parse(json),
		);
	});

	it("rejects invalid JSON, invalid gzip, and truncated gzip", async () => {
		await expect(decodeSave(new Blob(["{broken"]))).rejects.toThrow(
			"not valid JSON",
		);
		await expect(
			decodeSave(gzipFile(new Uint8Array([1, 2, 3]))),
		).rejects.toThrow("invalid or incomplete");
		const compressed = gzipSync('{"runtime":{}}');
		await expect(
			decodeSave(gzipFile(compressed.subarray(0, -4))),
		).rejects.toThrow("invalid or incomplete");
		await expect(decodeSave(gzipFile(gzipSync("{broken")))).rejects.toThrow(
			"not valid JSON",
		);
	});

	it("rejects oversized input before reading it", async () => {
		const file = new Blob([]);
		Object.defineProperty(file, "size", {
			value: MAX_COMPRESSED_SAVE_BYTES + 1,
		});
		Object.defineProperty(file, "slice", {
			value: () => {
				throw new Error("read");
			},
		});
		await expect(decodeSave(file)).rejects.toThrow("50 MiB import limit");
	});

	it("rejects a small gzip bomb before retaining its full expansion", async () => {
		const compressed = gzipSync(`"${"a".repeat(MAX_SAVE_BYTES)}"`);
		expect(compressed.byteLength).toBeLessThan(100_000);
		await expect(decodeSave(gzipFile(compressed))).rejects.toThrow(
			"expands beyond the 50 MiB import limit",
		);
	});

	it("rejects an export beyond the complete JSON limit", async () => {
		await expect(encodeSave("a".repeat(MAX_SAVE_BYTES))).rejects.toThrow(
			"50 MiB export limit",
		);
	});
});
