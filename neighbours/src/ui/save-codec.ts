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
		return JSON.parse(await json.text());
	} catch {
		throw new SaveFileError("This file is not valid JSON.");
	}
}
