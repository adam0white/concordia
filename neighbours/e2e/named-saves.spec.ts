import { readFile } from "node:fs/promises";
import { transformWithOxc } from "vite";
import { expect, type Page, step, test } from "./clock-fixture";
import { enterLocalTown } from "./local-fixture";
import { closeSaves, openDebug, openSaves } from "./session-helpers";

test("named records retain complete packets and reject stale, retired and failed writes", async ({
	page,
	context,
}) => {
	const source = await readFile("src/ui/persistence.ts", "utf8");
	const transformed = await transformWithOxc(source, "persistence.ts");
	await context.route("**/__test/persistence.js", (route) =>
		route.fulfill({ contentType: "text/javascript", body: transformed.code }),
	);
	await context.route("**/__test/slots", (route) =>
		route.fulfill({
			contentType: "text/html",
			body: "<title>Synthetic slots</title>",
		}),
	);
	await context.addInitScript(() => {
		Object.defineProperty(window, "BroadcastChannel", { value: undefined });
	});
	await page.goto("/__test/slots");
	const packet = {
		schema: "synthetic",
		runtime: { seed: 73, people: [], obligations: ["kept"] },
		provenance: { source: "recorded", opaque: [1, 2] },
	};
	await page.evaluate(async (packet) => {
		const { DeviceSaves } = await import(String("/__test/persistence.js"));
		const owner = new DeviceSaves(() => {});
		await owner.open();
		await owner.write(packet, "latest");
		const a = await owner.saveNamed("<script>same name</script>", packet);
		const b = await owner.saveNamed("<script>same name</script>", packet);
		Object.assign(window, { owner, a, b });
	}, packet);
	const other = await context.newPage();
	await other.goto("/__test/slots");
	await other.evaluate(async () => {
		const { DeviceSaves } = await import(String("/__test/persistence.js"));
		const owner = new DeviceSaves(() => {});
		await owner.open();
		await owner.write({ newTab: true }, "latest");
		owner.close();
	});
	const result = await page.evaluate(async () => {
		const { DeviceSaves, localSave } = await import(
			String("/__test/persistence.js")
		);
		const w = window as unknown as {
			owner: InstanceType<typeof DeviceSaves>;
			a: string;
			b: string;
		};
		const all = async () => [
			await localSave(),
			await localSave("previous"),
			await localSave("checkpoint-revision"),
			await localSave(w.a),
			await localSave(w.b),
		];
		const before = await all();
		const stale = await w.owner.saveNamed("stale", {}).then(
			() => false,
			() => true,
		);
		const staleLoad = await w.owner.replaceNamed(w.a, {}, {}).then(
			() => false,
			() => true,
		);
		w.owner.close();
		const unchanged = JSON.stringify(before) === JSON.stringify(await all());
		const owner = new DeviceSaves(() => {});
		await owner.open();
		const copies = await owner.listNamed();
		const record = await owner.readNamed(w.a);
		const invalidCandidate = await owner
			.replaceNamed(w.a, { changed: true }, {})
			.then(
				() => false,
				() => true,
			);
		const candidatePreserved =
			JSON.stringify(before) === JSON.stringify(await all());
		let casCurrent = true;
		const originalGet = IDBObjectStore.prototype.get;
		IDBObjectStore.prototype.get = function (key) {
			const req = originalGet.call(this, key);
			if (key === "checkpoint-revision")
				req.addEventListener(
					"success",
					() => {
						casCurrent = false;
					},
					{ once: true },
				);
			return req;
		};
		let retiredAtCas = false;
		try {
			retiredAtCas = await owner
				.saveNamed("retired at CAS", {}, () => casCurrent)
				.then(
					() => false,
					() => true,
				);
		} finally {
			IDBObjectStore.prototype.get = originalGet;
		}

		const put = IDBObjectStore.prototype.put;
		IDBObjectStore.prototype.put = () => {
			throw new DOMException("synthetic quota", "QuotaExceededError");
		};
		let quota = false;
		try {
			quota = await owner
				.replaceNamed(w.a, record.packet, { former: true })
				.then(
					() => false,
					() => true,
				);
		} finally {
			IDBObjectStore.prototype.put = put;
		}
		const quotaPreserved =
			JSON.stringify(before) === JSON.stringify(await all());
		let current = true;
		const retired = owner.saveNamed("retired", {}, () => current);
		current = false;
		const retiredRejected = await retired.then(
			() => false,
			() => true,
		);
		const queued = owner.saveNamed("closed", {});
		owner.close();
		const closedRejected = await queued.then(
			() => false,
			() => true,
		);
		const next = new DeviceSaves(() => {});
		await next.open();
		const get = IDBObjectStore.prototype.get;
		IDBObjectStore.prototype.get = function (key) {
			const req = get.call(this, key);
			if (key === "checkpoint-revision")
				req.addEventListener("success", () => next.close(), { once: true });
			return req;
		};
		let aborted = false;
		try {
			aborted = await next.replaceNamed(w.a, {}, {}).then(
				() => false,
				() => true,
			);
		} finally {
			IDBObjectStore.prototype.get = get;
			next.close();
		}
		const failurePreserved =
			JSON.stringify(before) === JSON.stringify(await all());
		const final = new DeviceSaves(() => {});
		await final.open();
		await final.replaceNamed(w.a, record.packet, { former: true });
		const latest = await localSave(),
			previous = await localSave("previous"),
			afterRecord = await final.readNamed(w.a);
		final.close();
		return {
			invalidCandidate,
			candidatePreserved,
			retiredAtCas,
			stale,
			staleLoad,
			unchanged,
			copies,
			record,
			quota,
			quotaPreserved,
			retiredRejected,
			closedRejected,
			aborted,
			failurePreserved,
			latest,
			previous,
			afterRecord,
			distinct: w.a !== w.b,
		};
	});
	expect(result).toMatchObject({
		invalidCandidate: true,
		candidatePreserved: true,
		retiredAtCas: true,
		stale: true,
		staleLoad: true,
		unchanged: true,
		quota: true,
		quotaPreserved: true,
		retiredRejected: true,
		closedRejected: true,
		aborted: true,
		failurePreserved: true,
		distinct: true,
		latest: packet,
		previous: { former: true },
	});
	expect(result.copies).toHaveLength(2);
	expect(result.record.packet).toEqual(packet);
	expect(result.afterRecord).toEqual(result.record);
	await other.close();
});

async function records(page: Page) {
	return page.evaluate(async () => {
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			const req = indexedDB.open("alder-quay", 1);
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		});
		try {
			return await new Promise<Record<string, unknown>>((resolve, reject) => {
				const result: Record<string, unknown> = {};
				const tx = db.transaction("saves");
				const cursor = tx.objectStore("saves").openCursor();
				cursor.onsuccess = () => {
					const c = cursor.result;
					if (c) {
						result[String(c.key)] = c.value;
						c.continue();
					}
				};
				tx.oncomplete = () => resolve(result);
				tx.onabort = () => reject(tx.error);
			});
		} finally {
			db.close();
		}
	});
}
async function exported(page: Page) {
	await openDebug(page);
	const link = page.getByRole("link", { name: "Download save", exact: true });
	const old = await link.evaluateAll(
		(links) => links[0]?.getAttribute("href") ?? null,
	);
	await page
		.getByRole("button", { name: "Keep a copy of this run", exact: true })
		.click();
	await expect
		.poll(async () => {
			const href = await link.getAttribute("href").catch(() => null);
			return Boolean(href && href !== old);
		})
		.toBe(true);
	return page.evaluate(
		async (href) => {
			const blob = await (await fetch(href ?? "")).blob();
			return JSON.parse(
				await new Response(
					blob.stream().pipeThrough(new DecompressionStream("gzip")),
				).text(),
			);
		},
		await link.getAttribute("href"),
	);
}
async function confirmLoad(page: Page) {
	await page
		.getByRole("button", { name: "Load Before the work <one>", exact: true })
		.click();
	await page
		.getByRole("button", { name: "Replace active town", exact: true })
		.click();
	await expect(
		page.getByText("Preparing the complete town checkpoint…"),
	).toHaveCount(0);
}
test("public saved towns retain complete native packets, deterministic continuation and failed-load state", async ({
	page,
}) => {
	await page.goto("/");
	await enterLocalTown(page);
	await expect(page.locator(".town-ready")).toBeVisible();
	await openSaves(page);
	const initial = await exported(page);
	expect(initial.runtime.physical.people).toHaveLength(206);
	await page.getByText("Saved towns", { exact: true }).click();
	await page.getByLabel("Town copy name").fill("Before the work <one>");
	await page
		.getByRole("button", { name: "Save named copy", exact: true })
		.click();
	const load = page.getByRole("button", {
		name: "Load Before the work <one>",
		exact: true,
	});
	await expect(load).toBeVisible();
	const saved = await records(page);
	const key =
		Object.keys(saved).find((k) => k.startsWith("named-town:")) ?? "missing";
	expect((saved[key] as { packet: unknown }).packet).toEqual(initial);
	await closeSaves(page);
	await step(page);
	await openSaves(page);
	const continued = await exported(page);
	expect(continued.rounds).toBe(initial.rounds + 1);
	const beforeCancel = await records(page);
	await load.click();
	await page
		.getByRole("button", { name: "Keep active town", exact: true })
		.click();
	expect(await records(page)).toEqual(beforeCancel);
	await confirmLoad(page);
	await expect(page.getByText(/^Loaded Before the work/)).toBeVisible();
	const loaded = await records(page);
	expect(loaded.latest).toEqual(initial);
	expect(loaded.previous).toEqual(continued);
	expect(loaded[key]).toEqual(saved[key]);
	expect(await exported(page)).toEqual(initial);
	await closeSaves(page);
	await step(page);
	await openSaves(page);
	expect(await exported(page)).toEqual(continued);
	// Corrupt only a synthetic named source; production codec/runtime must refuse
	// before either native town or device checkpoint changes.
	await page.evaluate(async (key) => {
		const db = await new Promise<IDBDatabase>((resolve) => {
			const r = indexedDB.open("alder-quay", 1);
			r.onsuccess = () => resolve(r.result);
		});
		await new Promise<void>((resolve, reject) => {
			const tx = db.transaction("saves", "readwrite"),
				store = tx.objectStore("saves"),
				r = store.get(key);
			r.onsuccess = () =>
				store.put(
					{ ...r.result, packet: { ...r.result.packet, rounds: -1 } },
					key,
				);
			tx.oncomplete = () => resolve();
			tx.onabort = () => reject(tx.error);
		});
		db.close();
	}, key);
	const corrupt = await records(page);
	await confirmLoad(page);
	await expect(
		page.getByText(/Your current town and saved copies are unchanged/),
	).toBeVisible();
	expect(await records(page)).toEqual(corrupt);
	expect(await exported(page)).toEqual(continued);
	// Restore the unchanged original source, then fail the real atomic replacement.
	await page.evaluate(
		async ({ key, record }) => {
			const db = await new Promise<IDBDatabase>((resolve) => {
				const r = indexedDB.open("alder-quay", 1);
				r.onsuccess = () => resolve(r.result);
			});
			await new Promise<void>((resolve) => {
				const tx = db.transaction("saves", "readwrite");
				tx.objectStore("saves").put(record, key);
				tx.oncomplete = () => resolve();
			});
			db.close();
			const put = IDBObjectStore.prototype.put;
			Object.assign(window, {
				restoreSlotPut: () => {
					IDBObjectStore.prototype.put = put;
				},
			});
			IDBObjectStore.prototype.put = () => {
				throw new DOMException("synthetic quota", "QuotaExceededError");
			};
		},
		{ key, record: saved[key] },
	);
	const beforeQuota = await records(page);
	await confirmLoad(page);
	await expect(
		page.getByText(/Your current town and saved copies are unchanged/),
	).toBeVisible();
	expect(await records(page)).toEqual(beforeQuota);
	await page.evaluate(() =>
		(window as unknown as { restoreSlotPut: () => void }).restoreSlotPut(),
	);
	expect(await exported(page)).toEqual(continued);
	const beforeFile = await records(page);
	await page.addInitScript(() => {
		const nativeOpen = indexedDB.open.bind(indexedDB);
		Object.assign(window, {
			nativeSaveAccesses: 0,
			restoreNativeOpen: () => {
				indexedDB.open = nativeOpen;
			},
		});
		indexedDB.open = (name: string, version?: number) => {
			if (name === "alder-quay") {
				(window as unknown as { nativeSaveAccesses: number })
					.nativeSaveAccesses++;
				throw Error("File session touched native saves");
			}
			return nativeOpen(name, version);
		};
	});
	await page.goto("/?file=1");
	await page.getByLabel("Town file").setInputFiles({
		name: "synthetic-town.json",
		mimeType: "application/json",
		buffer: Buffer.from(JSON.stringify(initial)),
	});
	await expect(page.locator(".town-ready")).toBeVisible();
	await openSaves(page);
	await expect(page.getByText("Saved towns", { exact: true })).toHaveCount(0);
	const fileExport = await exported(page);
	expect(fileExport.runtime).toEqual(initial.runtime);
	expect(fileExport.castLocal.file).toBe(true);
	expect(
		await page.evaluate(
			() =>
				(window as unknown as { nativeSaveAccesses: number })
					.nativeSaveAccesses,
		),
	).toBe(0);
	await page.evaluate(() =>
		(
			window as unknown as { restoreNativeOpen: () => void }
		).restoreNativeOpen(),
	);
	expect(await records(page)).toEqual(beforeFile);
});

// Source invalidation can arrive after the last put, or after durable commit.
// The first boundary must roll back; the second must adopt the committed town.
test("source invalidation and named load stay consistent across the real commit boundary", async ({
	page,
}) => {
	await page.goto("/");
	await enterLocalTown(page);
	await expect(page.locator(".town-ready")).toBeVisible();
	await openSaves(page);
	const initial = await exported(page);
	await page.getByText("Saved towns", { exact: true }).click();
	await page.getByLabel("Town copy name").fill("Before the work <one>");
	await page
		.getByRole("button", { name: "Save named copy", exact: true })
		.click();
	await expect(
		page.getByRole("button", {
			name: "Load Before the work <one>",
			exact: true,
		}),
	).toBeVisible();
	await closeSaves(page);
	await step(page);
	await openSaves(page);
	const former = await exported(page);
	const before = await records(page);
	await page.evaluate(() => {
		const put = IDBObjectStore.prototype.put;
		Object.assign(window, {
			restoreBoundaryPut: () => {
				IDBObjectStore.prototype.put = put;
			},
			boundaryInvalidated: false,
		});
		IDBObjectStore.prototype.put = function (value, key) {
			const request = put.call(this, value, key);
			if (key === "latest" && this.name === "saves")
				queueMicrotask(() => {
					Object.assign(window, { boundaryInvalidated: true });
					window.dispatchEvent(
						new StorageEvent("storage", {
							key: "synthetic-source-invalidation",
							newValue: "changed",
						}),
					);
				});
			return request;
		};
	});
	await confirmLoad(page);
	await page.evaluate(() =>
		(
			window as unknown as { restoreBoundaryPut: () => void }
		).restoreBoundaryPut(),
	);
	expect(
		await page.evaluate(
			() =>
				(window as unknown as { boundaryInvalidated: boolean })
					.boundaryInvalidated,
		),
	).toBe(true);
	expect(JSON.stringify(await records(page)) === JSON.stringify(before)).toBe(
		true,
	);
	expect(await exported(page)).toEqual(former);
	await expect(
		page.getByText(/Your current town and saved copies are unchanged/),
	).toBeVisible();
	// Run the same real storage source handler after IDB has already committed,
	// before the application's transaction-complete handler receives the event.
	await page.evaluate(() => {
		const transaction = IDBDatabase.prototype.transaction;
		Object.assign(window, {
			restoreBoundaryTransaction: () => {
				IDBDatabase.prototype.transaction = transaction;
			},
			durableInvalidated: false,
		});
		IDBDatabase.prototype.transaction = function (
			...args: Parameters<typeof transaction>
		) {
			const tx = transaction.apply(this, args);
			if (this.name === "alder-quay" && args[1] === "readwrite")
				tx.addEventListener(
					"complete",
					() => {
						Object.assign(window, { durableInvalidated: true });
						window.dispatchEvent(
							new StorageEvent("storage", {
								key: "synthetic-source-invalidation",
								newValue: "changed",
							}),
						);
					},
					{ once: true },
				);
			return tx;
		};
	});
	await confirmLoad(page);
	await page.evaluate(() =>
		(
			window as unknown as { restoreBoundaryTransaction: () => void }
		).restoreBoundaryTransaction(),
	);
	await expect(page.getByText(/^Loaded Before the work/)).toBeVisible();
	expect(
		await page.evaluate(
			() =>
				(window as unknown as { durableInvalidated: boolean })
					.durableInvalidated,
		),
	).toBe(true);
	const after = await records(page);
	expect(after.latest).toEqual(initial);
	expect(after.previous).toEqual(former);
	expect(await exported(page)).toEqual(initial);
	await expect(
		page.getByText(/Your current town and saved copies are unchanged/),
	).toHaveCount(0);
});
