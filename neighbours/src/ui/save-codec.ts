import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

// Shareable files contain the complete runtime JSON. Device saves stay unchanged.
export const MAX_SAVE_BYTES = 50 * 1024 * 1024;
export const MAX_COMPRESSED_SAVE_BYTES = 50 * 1024 * 1024;

export class SaveFileError extends Error {}

async function boundedBlob(
	stream: ReadableStream<Uint8Array>,
	limit: number,
	message: string,
	mime: string,
): Promise<Blob> {
	const reader = stream.getReader();
	const chunks: BlobPart[] = [];
	let size = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > limit) {
				void reader.cancel().catch(() => {});
				throw new SaveFileError(message);
			}
			chunks.push(value as Uint8Array<ArrayBuffer>);
		}
	} finally {
		reader.releaseLock();
	}
	return new Blob(chunks, { type: mime });
}

export async function encodeSave(save: unknown): Promise<Blob> {
	const json = new Blob([JSON.stringify(save)], { type: "application/json" });
	if (json.size > MAX_SAVE_BYTES)
		throw new SaveFileError(
			"This save is larger than the 50 MiB export limit.",
		);
	if (typeof CompressionStream === "undefined")
		throw new SaveFileError("This browser cannot compress save files.");
	return boundedBlob(
		json.stream().pipeThrough(new CompressionStream("gzip")),
		MAX_COMPRESSED_SAVE_BYTES,
		"This compressed save is larger than the 50 MiB export limit.",
		"application/gzip",
	);
}

export async function decodeSave(
	file: Blob & { name?: string },
): Promise<unknown> {
	if (file.size > MAX_COMPRESSED_SAVE_BYTES)
		throw new SaveFileError(
			"This save is larger than the 50 MiB import limit.",
		);
	const header = new Uint8Array(await file.slice(0, 2).arrayBuffer());
	const compressed =
		(header[0] === 0x1f && header[1] === 0x8b) ||
		/\.gz$/i.test(file.name ?? "");
	let json = file;
	if (compressed) {
		if (typeof DecompressionStream === "undefined")
			throw new SaveFileError(
				"This browser cannot open compressed save files.",
			);
		try {
			json = await boundedBlob(
				file.stream().pipeThrough(new DecompressionStream("gzip")),
				MAX_SAVE_BYTES,
				"This save expands beyond the 50 MiB import limit.",
				"application/json",
			);
		} catch (error) {
			if (error instanceof SaveFileError) throw error;
			throw new SaveFileError("This compressed save is invalid or incomplete.");
		}
	}
	try {
		return await decodeRecording(JSON.parse(await json.text()));
	} catch (error) {
		if (error instanceof SaveFileError) throw error;
		throw new SaveFileError("This file is not valid JSON.");
	}
}

const RECORDING_SCHEMA = "neighbours/recording@1";
const object = (value: unknown): Record<string, unknown> | undefined =>
	value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
function recording(value: unknown) {
	const schema = object(value)?.schema;
	return (
		typeof schema === "string" && schema.startsWith("neighbours/recording@")
	);
}
export interface RecordingExport {
	schema: typeof RECORDING_SCHEMA;
	codec: "gzip-base64";
	decodedBytes: number;
	sha256: string;
	data: string;
}
/** Full JSON only. This transport wrapper grants no source trust or admission. */
export async function encodeRecording(
	packet: unknown,
): Promise<RecordingExport> {
	if (recording(packet) || recording(object(packet)?.packet))
		throw new SaveFileError("Nested recordings are not supported.");
	const raw = new TextEncoder().encode(JSON.stringify(packet));
	const compressed = new Uint8Array(
		await (await encodeSave(packet)).arrayBuffer(),
	);
	let binary = "";
	for (let offset = 0; offset < compressed.length; offset += 32768)
		binary += String.fromCharCode(
			...compressed.subarray(offset, offset + 32768),
		);
	return {
		schema: RECORDING_SCHEMA,
		codec: "gzip-base64",
		decodedBytes: raw.byteLength,
		sha256: bytesToHex(sha256(raw)),
		data: btoa(binary),
	};
}
/** One decoded layer, then the ordinary strict journal/native/host admission. */
async function decodeRecording(value: unknown): Promise<unknown> {
	let r = object(value);
	if (r && recording(r.packet)) {
		const keys = Object.keys(r).sort().join(",");
		if (
			!(
				(keys === "packet,slot" &&
					typeof r.slot === "string" &&
					["latest", "previous"].includes(r.slot)) ||
				(keys === "file,packet" && r.file === true)
			)
		)
			throw new SaveFileError("Invalid recorded save wrapper.");
		r = object(r.packet);
	}
	if (!recording(r)) return value;
	if (
		!r ||
		Object.keys(r).sort().join(",") !==
			"codec,data,decodedBytes,schema,sha256" ||
		r.schema !== RECORDING_SCHEMA ||
		r.codec !== "gzip-base64" ||
		typeof r.decodedBytes !== "number" ||
		!Number.isSafeInteger(r.decodedBytes) ||
		r.decodedBytes < 1 ||
		r.decodedBytes > MAX_SAVE_BYTES ||
		typeof r.sha256 !== "string" ||
		!/^[a-f0-9]{64}$/.test(r.sha256) ||
		typeof r.data !== "string" ||
		r.data.length > 4 * Math.ceil(MAX_COMPRESSED_SAVE_BYTES / 3) ||
		r.data.length % 4 !== 0 ||
		/[^A-Za-z0-9+/=]/.test(r.data)
	)
		throw new SaveFileError(
			"Invalid recording or decoded size beyond the 50 MiB limit.",
		);
	try {
		const binary = atob(r.data);
		if (btoa(binary) !== r.data)
			throw new SaveFileError("Invalid recording base64.");
		const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
		if (typeof DecompressionStream === "undefined")
			throw Error("No gzip support");
		const decoded = await boundedBlob(
			new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")),
			MAX_SAVE_BYTES,
			"This recording expands beyond the 50 MiB import limit.",
			"application/json",
		);
		const raw = new Uint8Array(await decoded.arrayBuffer());
		if (
			raw.byteLength !== r.decodedBytes ||
			bytesToHex(sha256(raw)) !== r.sha256
		)
			throw new SaveFileError(
				"Recording size or hash does not match its complete JSON.",
			);
		const packet: unknown = JSON.parse(
			new TextDecoder("utf-8", { fatal: true }).decode(raw),
		);
		if (recording(packet) || recording(object(packet)?.packet))
			throw new SaveFileError("Nested recordings are not supported.");
		return packet;
	} catch (error) {
		if (error instanceof SaveFileError) throw error;
		throw new SaveFileError("This recording is invalid or incomplete.");
	}
}
