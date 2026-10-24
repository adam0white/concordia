import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { expect, type Page, step, type TestInfo, test } from "./clock-fixture";
import {
	closeSaves,
	openDownload,
	openOtherWays,
	openSaves,
	showTab,
} from "./session-helpers";

type Packet = {
	runtime: { now: number; people: unknown[] };
	castLocal?: Record<string, unknown>;
};
async function exportFile(page: Page, info: TestInfo, name: string) {
	await openSaves(page);
	const link = page.getByRole("link", { name: /Download save/ });
	const previous = (await link.count())
		? await link.getAttribute("href")
		: null;
	await openSaves(page);
	await openDownload(page);
	await page
		.getByRole("button", { name: "Keep a copy of this run", exact: true })
		.click();
	await expect
		.poll(async () => {
			const next = await link
				.getAttribute("href", { timeout: 500 })
				.catch(() => null);
			return Boolean(next && next !== previous);
		})
		.toBe(true);
	await expect(link).toHaveAttribute("download", "alder-quay-save.json.gz");
	const pending = page.waitForEvent("download");
	await link.click();
	const download = await pending;
	expect(download.suggestedFilename()).toBe("alder-quay-save.json.gz");
	const path = info.outputPath(`${name}.json.gz`);
	await download.saveAs(path);
	const compressed = await readFile(path);
	expect([...compressed.subarray(0, 2)]).toEqual([0x1f, 0x8b]);
	const json = gunzipSync(compressed);
	return {
		compressed,
		json,
		packet: JSON.parse(json.toString("utf8")) as Packet,
	};
}
async function startPaused(page: Page) {
	await page.goto("/?lab=1");
	await page
		.getByRole("button", { name: /^(Enter|Return to) Alder Quay/ })
		.click();
	await closeSaves(page);
	await expect(page.locator(".town-ready")).toBeVisible();
	await closeSaves(page);
	await expect(page.locator(".town-ready")).toBeVisible();
}

test("actual browser gzip export preserves the complete town across import and device reload", async ({
	page,
}, info) => {
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await startPaused(page);
	const original = await exportFile(page, info, "complete-original");
	expect(original.packet.runtime.people).toHaveLength(206);
	expect(original.compressed.byteLength).toBeLessThan(
		original.json.byteLength / 2,
	);
	await closeSaves(page);
	await step(page);
	const advanced = await exportFile(page, info, "advanced");
	expect(advanced.packet.runtime.now).toBe(original.packet.runtime.now + 15);
	await openSaves(page);
	await openOtherWays(page);
	await page.getByLabel("Import town save").setInputFiles({
		name: "complete-town.json.gz",
		mimeType: "application/gzip",
		buffer: original.compressed,
	});
	await expect(page.getByRole("link", { name: /Download save/ })).toHaveCount(
		0,
	);
	const restored = await exportFile(page, info, "restored");
	const imported = {
		...original.packet,
		castLocal: { ...original.packet.castLocal, file: true },
	};
	expect(restored.packet).toEqual(imported);
	// The uncompressed packet remains the actual device persistence format.
	await expect
		.poll(() =>
			page.evaluate(async () => {
				const db = await new Promise<IDBDatabase>((resolve) => {
					const request = indexedDB.open("alder-quay", 1);
					request.onsuccess = () => resolve(request.result);
				});
				return new Promise<number>((resolve) => {
					const request = db
						.transaction("saves")
						.objectStore("saves")
						.get("latest");
					request.onsuccess = () => {
						db.close();
						resolve(request.result.runtime.now);
					};
				});
			}),
		)
		.toBe(original.packet.runtime.now);
	await page.reload();
	await page
		.getByRole("button", { name: /^(Enter|Return to) Alder Quay/ })
		.click();
	await closeSaves(page);
	await expect(page.locator(".town-ready")).toBeVisible();
	expect((await exportFile(page, info, "reload")).packet).toEqual(imported);
	await openSaves(page);
	await openOtherWays(page);
	await page.getByLabel("Import town save").setInputFiles({
		name: "truncated.json.gz",
		mimeType: "application/gzip",
		buffer: original.compressed.subarray(0, -8),
	});
	await expect(page.getByRole("alert")).toContainText("invalid or incomplete");
	expect((await exportFile(page, info, "invalid-preserved")).packet).toEqual(
		imported,
	);
	expect(errors).toEqual([]);
});

type CompressionGate = {
	hold: boolean;
	held: (() => void)[];
	completed: number;
};
test("compression finishing after a newer export or accepted import cannot publish a stale download", async ({
	page,
}, info) => {
	await page.addInitScript(() => {
		const gate: CompressionGate = { hold: false, held: [], completed: 0 };
		Object.assign(window, { compressionGate: gate });
		const NativeCompressionStream = window.CompressionStream;
		window.CompressionStream = class {
			readable: ReadableStream<Uint8Array<ArrayBuffer>>;
			writable: WritableStream<BufferSource>;
			constructor(format: CompressionFormat) {
				const compressor = new NativeCompressionStream(format);
				this.writable = compressor.writable;
				this.readable = compressor.readable.pipeThrough(
					new TransformStream({
						transform(chunk, controller) {
							controller.enqueue(chunk);
						},
						async flush() {
							if (gate.hold)
								await new Promise<void>((resolve) => gate.held.push(resolve));
							gate.completed++;
						},
					}),
				);
			}
		};
	});
	await startPaused(page);
	const original = await exportFile(page, info, "race-original");
	const hold = async () => {
		await page.evaluate(() => {
			(
				window as unknown as { compressionGate: CompressionGate }
			).compressionGate.hold = true;
		});
		await openSaves(page);
		await openDownload(page);
		await page
			.getByRole("button", { name: "Keep a copy of this run", exact: true })
			.click();
		await expect
			.poll(() =>
				page.evaluate(
					() =>
						(window as unknown as { compressionGate: CompressionGate })
							.compressionGate.held.length,
				),
			)
			.toBe(1);
	};
	const release = async () => {
		await page.evaluate(async () => {
			const gate = (window as unknown as { compressionGate: CompressionGate })
				.compressionGate;
			gate.hold = false;
			for (const finish of gate.held.splice(0)) finish();
		});
		await page.clock.runFor(40);
	};
	await hold();
	await page.evaluate(() => {
		(
			window as unknown as { compressionGate: CompressionGate }
		).compressionGate.hold = false;
	});
	await exportFile(page, info, "newer-export");
	const link = page.getByRole("link", { name: /Download save/ });
	const newer = await link.getAttribute("href");
	await release();
	await expect(link).toHaveAttribute("href", newer ?? "missing-newer-export");
	await showTab(page, "Help");
	await page.getByRole("button", { name: /^Lend tools/ }).click();
	await expect(page.locator(".intervention-result")).toContainText(
		"The tools were added",
	);
	await hold();
	// A valid legacy JSON import accepts a replacement while the old compressor is still running.
	await openSaves(page);
	await openOtherWays(page);
	await page.getByLabel("Import town save").setInputFiles({
		name: "legacy.json",
		mimeType: "application/json",
		buffer: original.json,
	});
	await expect(link).toHaveCount(0);
	await closeSaves(page);
	await expect(page.locator(".town-ready")).toBeVisible();
	await expect(page.locator(".intervention-result")).toHaveCount(0);
	await release();
	await expect(link).toHaveCount(0);
	expect(
		(await exportFile(page, info, "after-old-compression")).packet,
	).toEqual({
		...original.packet,
		castLocal: { ...original.packet.castLocal, file: true },
	});
});
