import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { expect, type Page, type TestInfo, test } from "@playwright/test";
import { transformWithOxc } from "vite";

type Packet = {
	schema: string;
	rounds: number;
	runtime: {
		seed: number;
		now: number;
		hf: string;
		people: { person: { trace: unknown[] } }[];
	};
};
async function pause(page: Page) {
	const button = page.getByRole("button", { name: "Pause town", exact: true });
	if (await button.isVisible()) await button.click();
	await expect(
		page.getByRole("button", { name: "Play town", exact: true }),
	).toBeVisible();
}
async function packet(
	page: Page,
	info: TestInfo,
	name: string,
): Promise<Packet> {
	const link = page.getByRole("link", { name: /Download save/ });
	const previous = (await link.count())
		? await link.getAttribute("href")
		: null;
	await page.getByRole("button", { name: "Export", exact: true }).click();
	await expect
		.poll(async () => {
			const href = await link.getAttribute("href").catch(() => null);
			return Boolean(href && href !== previous);
		})
		.toBe(true);
	const downloadPromise = page.waitForEvent("download");
	await link.click();
	const download = await downloadPromise;
	const path = info.outputPath(`${name}.json.gz`);
	await download.saveAs(path);
	const result = JSON.parse(
		gunzipSync(await readFile(path)).toString("utf8"),
	) as Packet;
	expect(result.schema).toBe("neighbours/concordia@1");
	expect(result.runtime.people).toHaveLength(208);
	expect(result.runtime.hf).toBe("2.2.1");
	return result;
}
async function importPacket(page: Page, value: unknown) {
	await page.getByLabel("Import town save").setInputFiles({
		name: "town.json",
		mimeType: "application/json",
		buffer: Buffer.from(JSON.stringify(value)),
	});
}

test("real WASM town preserves requested exports, imports, reloads and previous seed", async ({
	page,
}, info) => {
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto("/");
	await expect(
		page.getByRole("button", { name: "Pause town", exact: true }),
	).toBeVisible();
	await pause(page);
	const initial = await packet(page, info, "initial");
	expect(initial.runtime.seed).toBe(42);
	let current = initial;
	// Cross the autosave cadence; each export must own its request despite pause/step save traffic.
	for (let i = 0; i < 7; i++) {
		await page.getByRole("button", { name: "Advance one round" }).click();
		const next = await packet(page, info, `step-${i}`);
		expect(next.runtime.now).toBe(current.runtime.now + 15);
		expect(next.rounds).toBe(current.rounds + 1);
		current = next;
	}
	expect(
		current.runtime.people.every(
			(resident) => resident.person.trace.length > 0,
		),
	).toBe(true);
	await importPacket(page, initial);
	await expect
		.poll(async () => (await packet(page, info, "imported")).runtime.now)
		.toBe(initial.runtime.now);
	await page.getByRole("button", { name: "Advance one round" }).click();
	const continued = await packet(page, info, "continued");
	expect(continued.runtime.now).toBe(initial.runtime.now + 15);
	const minutes = continued.runtime.now;
	const committed = `Saved · Day ${Math.floor(minutes / 1440) + 1} · ${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
	await expect(page.getByText(committed, { exact: true })).toBeVisible();
	await page.reload();
	await expect(
		page.getByRole("button", { name: "Play town", exact: true }),
	).toBeVisible();
	expect(await packet(page, info, "reload")).toEqual(continued);
	await page.getByRole("tab", { name: "Inspector", exact: true }).click();
	await page.getByLabel("New town seed").fill("73");
	await page.getByRole("button", { name: "Start town", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Pause town", exact: true }),
	).toBeVisible();
	await pause(page);
	expect((await packet(page, info, "seed73")).runtime.seed).toBe(73);
	await page
		.getByRole("button", { name: "Restore previous town", exact: true })
		.click();
	await expect
		.poll(async () => (await packet(page, info, "previous")).runtime.seed)
		.toBe(42);
	const previousTown = await packet(page, info, "before-invalid");
	await page.getByLabel("Import town save").setInputFiles({
		name: "broken.json",
		mimeType: "application/json",
		buffer: Buffer.from('{"schema":"invalid"}'),
	});
	await expect(page.getByRole("alert")).toBeVisible();
	const before = await packet(page, info, "after-invalid");
	expect(before).toEqual(previousTown);
	await page.getByRole("button", { name: "Advance one round" }).click();
	expect((await packet(page, info, "usable")).runtime.now).toBe(
		before.runtime.now + 15,
	);
	expect(errors).toEqual([]);
});

test("390px town has no horizontal overflow and keyboard can open a person", async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto("/");
	await expect(
		page.getByRole("button", { name: "Pause town", exact: true }),
	).toBeVisible();
	await pause(page);
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= window.innerWidth,
		),
	).toBe(true);
	const ada = page.getByRole("button", { name: /Ada:/ }).first();
	await ada.focus();
	await page.keyboard.press("Enter");
	await expect(page.getByLabel("Ada's details", { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Close person details" }).focus();
	await page.keyboard.press("Enter");
	await expect(page.getByLabel("Ada's details", { exact: true })).toHaveCount(
		0,
	);
});

async function deviceCheckpoint(page: Page) {
	return page.evaluate(async () => {
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open("alder-quay", 1);
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		return new Promise<{
			latest: unknown;
			previous: unknown;
			revision: { revision: string; source: string };
		}>((resolve, reject) => {
			const tx = db.transaction("saves", "readonly");
			const store = tx.objectStore("saves");
			const latest = store.get("latest");
			const previous = store.get("previous");
			const revision = store.get("checkpoint-revision");
			tx.oncomplete = () => {
				db.close();
				resolve({
					latest: latest.result,
					previous: previous.result,
					revision: revision.result,
				});
			};
			tx.onabort = () => reject(tx.error);
		});
	});
}

test("another tab's checkpoint locks stale saves, preserves export and resumes through reload", async ({
	page,
	context,
}, info) => {
	await page.goto("/");
	await expect(
		page.getByRole("button", { name: "Pause town", exact: true }),
	).toBeVisible();
	await pause(page);
	const initial = await packet(page, info, "owner-initial");
	await expect
		.poll(async () => (await deviceCheckpoint(page)).latest)
		.toEqual(initial);
	// Pre-protection saves remain raw packets. Adopt one only after reading it.
	await page.evaluate(async () => {
		await new Promise<void>((resolve, reject) => {
			const request = indexedDB.open("alder-quay", 1);
			request.onsuccess = () => {
				const db = request.result;
				const tx = db.transaction("saves", "readwrite");
				tx.objectStore("saves").delete("checkpoint-revision");
				tx.oncomplete = () => {
					db.close();
					resolve();
				};
				tx.onabort = () => reject(tx.error);
			};
		});
	});
	await page.reload();
	await expect(
		page.getByRole("button", { name: "Play town", exact: true }),
	).toBeVisible();
	expect(await packet(page, info, "legacy-adopted")).toEqual(initial);
	await expect
		.poll(async () => (await deviceCheckpoint(page)).latest)
		.toEqual(initial);
	const other = await context.newPage();
	await other.goto("/");
	await expect(
		other.getByRole("button", { name: "Play town", exact: true }),
	).toBeVisible();
	await page.getByRole("button", { name: "Advance one round" }).click();
	const advanced = await packet(page, info, "owner-advanced");
	await expect(
		other.getByRole("button", { name: "Load device town", exact: true }),
	).toBeVisible();
	await expect(
		other.getByRole("button", { name: "Play town", exact: true }),
	).toBeDisabled();
	const beforeExport = await deviceCheckpoint(page);
	expect(beforeExport.latest).toEqual(advanced);
	expect(await packet(other, info, "stale-tab-export")).toEqual(initial);
	expect(await deviceCheckpoint(page)).toEqual(beforeExport);
	await other
		.getByRole("button", { name: "Load device town", exact: true })
		.click();
	await expect(
		other.getByRole("button", { name: "Play town", exact: true }),
	).toBeEnabled();
	expect(await packet(other, info, "reloaded-device-town")).toEqual(advanced);
	await expect(
		page.getByRole("button", { name: "Load device town", exact: true }),
	).toBeVisible();
	await other.getByRole("button", { name: "Advance one round" }).click();
	expect((await packet(other, info, "new-owner-continued")).runtime.now).toBe(
		advanced.runtime.now + 15,
	);
	await other.close();
});

test("IndexedDB rejects a stale autosave even without cross-tab notifications", async ({
	page,
	context,
}, info) => {
	await context.addInitScript(() => {
		Object.defineProperty(globalThis, "BroadcastChannel", { value: undefined });
	});
	await page.goto("/");
	await expect(
		page.getByRole("button", { name: "Pause town", exact: true }),
	).toBeVisible();
	await pause(page);
	const initial = await packet(page, info, "cas-initial");
	await expect
		.poll(async () => (await deviceCheckpoint(page)).latest)
		.toEqual(initial);
	const other = await context.newPage();
	await other.goto("/");
	await expect(
		other.getByRole("button", { name: "Play town", exact: true }),
	).toBeEnabled();
	await page.getByRole("button", { name: "Advance one round" }).click();
	const advanced = await packet(page, info, "cas-owner-advanced");
	await expect
		.poll(async () => (await deviceCheckpoint(page)).latest)
		.toEqual(advanced);
	const beforeConflict = await deviceCheckpoint(page);
	// Reach the real autosave cadence without Pause or Export issuing a save first.
	await other.getByLabel("Playback speed").selectOption("120");
	await other.getByRole("button", { name: "Play town", exact: true }).click();
	await expect(
		other.getByRole("button", { name: "Load device town", exact: true }),
	).toBeVisible();
	const staleExport = await packet(other, info, "cas-stale-export");
	expect(staleExport.runtime.now).toBeGreaterThanOrEqual(
		initial.runtime.now + 75,
	);
	expect(await deviceCheckpoint(page)).toEqual(beforeConflict);
	// Export remains usable after the rejected write and cannot alter either slot.
	expect(await packet(other, info, "cas-conflicted-export")).toEqual(
		staleExport,
	);
	expect(await deviceCheckpoint(page)).toEqual(beforeConflict);
	await other.close();
});

test("a corrupt startup checkpoint stays protected until deliberate recovery", async ({
	page,
}, info) => {
	await page.goto("/");
	await expect(
		page.getByRole("button", { name: "Pause town", exact: true }),
	).toBeVisible();
	await pause(page);
	const valid = await packet(page, info, "recovery-original");
	await expect
		.poll(async () => (await deviceCheckpoint(page)).latest)
		.toEqual(valid);
	await page.evaluate(async () => {
		await new Promise<void>((resolve, reject) => {
			const request = indexedDB.open("alder-quay", 1);
			request.onsuccess = () => {
				const db = request.result;
				const tx = db.transaction("saves", "readwrite");
				tx.objectStore("saves").put({ schema: "invalid-startup" }, "latest");
				tx.oncomplete = () => {
					db.close();
					resolve();
				};
				tx.onabort = () => reject(tx.error);
			};
		});
	});
	await page.reload();
	await expect(page.getByRole("alert")).toContainText(
		"The saved town could not be restored.",
	);
	await expect(
		page.getByRole("button", { name: "Play town", exact: true }),
	).toBeVisible();
	await expect(page.getByRole("alert")).toContainText(
		"Continuing with Play, Step or an intervention will replace that save.",
	);
	const protectedDevice = await deviceCheckpoint(page);
	expect(protectedDevice.latest).toEqual({ schema: "invalid-startup" });
	await packet(page, info, "recovery-export-does-not-overwrite");
	expect(await deviceCheckpoint(page)).toEqual(protectedDevice);
	await page.getByRole("button", { name: "Advance one round" }).click();
	const recovered = await packet(page, info, "deliberate-recovery");
	await expect
		.poll(async () => (await deviceCheckpoint(page)).latest)
		.toEqual(recovered);
});

test("closed visitor sessions cannot commit queued or already-started saves", async ({
	page,
}) => {
	const source = await readFile("src/ui/persistence.ts", "utf8");
	const transformed = await transformWithOxc(source, "persistence.ts");
	await page.route("**/__test/persistence.js", (route) =>
		route.fulfill({ contentType: "text/javascript", body: transformed.code }),
	);
	await page.route("**/__test/persistence-harness", (route) =>
		route.fulfill({
			contentType: "text/html",
			body: "<title>Persistence lifecycle regression</title>",
		}),
	);
	await page.goto("/__test/persistence-harness");
	const result = await page.evaluate(async () => {
		const moduleUrl = "/__test/persistence.js";
		const { DeviceSaves, localSave } = await import(moduleUrl);
		const snapshot = () =>
			Promise.all(
				["latest", "previous", "checkpoint-revision"].map((key) =>
					localSave(key),
				),
			);
		const queued = new DeviceSaves(() => {});
		await queued.open();
		await queued.write({ name: "committed-before-close" }, "latest");
		const beforeQueued = await snapshot();
		const write = queued.write({ name: "must-not-commit" }, "previous");
		queued.close();
		const queuedRejected = await write.then(
			() => false,
			() => true,
		);
		const afterQueued = await snapshot();

		const started = new DeviceSaves(() => {});
		await started.open();
		const beforeStarted = await snapshot();
		const get = IDBObjectStore.prototype.get;
		let closedAtRevision = false;
		// Close at the actual IDB revision success event, before the CAS callback.
		IDBObjectStore.prototype.get = function (key) {
			const request = get.call(this, key);
			if (key === "checkpoint-revision")
				request.addEventListener(
					"success",
					() => {
						closedAtRevision = true;
						started.close();
					},
					{ once: true },
				);
			return request;
		};
		let startedRejected = false;
		try {
			startedRejected = await started
				.write({ name: "also-must-not-commit" }, "latest")
				.then(
					() => false,
					() => true,
				);
		} finally {
			IDBObjectStore.prototype.get = get;
			started.close();
		}
		return {
			beforeQueued,
			afterQueued,
			queuedRejected,
			beforeStarted,
			afterStarted: await snapshot(),
			startedRejected,
			closedAtRevision,
		};
	});
	expect(result.queuedRejected).toBe(true);
	expect(result.afterQueued).toEqual(result.beforeQueued);
	expect(result.closedAtRevision).toBe(true);
	expect(result.startedRejected).toBe(true);
	expect(result.afterStarted).toEqual(result.beforeStarted);
});

test("map selection keeps 44px targets and places clusters truthfully on narrow maps", async ({
	page,
}) => {
	await page.goto("/");
	await expect(
		page.getByRole("button", { name: "Pause town", exact: true }),
	).toBeVisible();
	await pause(page);
	for (const width of [1280, 390]) {
		await page.setViewportSize({ width, height: 900 });
		await expect
			.poll(() =>
				page.locator(".map-person,.map-cluster").evaluateAll((markers) => {
					const boxes = markers.map((marker) => marker.getBoundingClientRect());
					const represented = markers.reduce(
						(count, marker) =>
							count + Number(marker.getAttribute("data-count") ?? 1),
						0,
					);
					return (
						represented === 8 &&
						boxes.every(
							(box, i) =>
								box.width >= 43.8 &&
								box.height >= 43.8 &&
								boxes
									.slice(i + 1)
									.every(
										(other) =>
											box.right <= other.left + 0.2 ||
											other.right <= box.left + 0.2 ||
											box.bottom <= other.top + 0.2 ||
											other.bottom <= box.top + 0.2,
									),
						)
					);
				}),
			)
			.toBe(true);
		const direct = page.locator(".map-person");
		for (let i = 0; i < (await direct.count()); i++) {
			const marker = direct.nth(i);
			const name = (await marker.getAttribute("aria-label"))?.split(":")[0];
			await marker.click();
			await expect(
				page.getByLabel(`${name}'s details`, { exact: true }),
			).toBeVisible();
			await page
				.getByRole("button", { name: "Close person details", exact: true })
				.click();
		}
		const clusters = page.locator(".map-cluster");
		for (let i = 0; i < (await clusters.count()); i++) {
			const cluster = clusters.nth(i);
			await cluster.focus();
			await page.keyboard.press("Enter");
			const names = await page
				.locator(".map-chooser [data-person] strong")
				.allTextContents();
			for (let j = 0; j < names.length; j++) {
				if (j > 0) await cluster.click();
				await page.locator(".map-chooser [data-person]").nth(j).click();
				await expect(
					page.getByLabel(`${names[j]}'s details`, { exact: true }),
				).toBeVisible();
				await expect(page.locator(".map-chooser")).toHaveCount(0);
				await page
					.getByRole("button", { name: "Close person details", exact: true })
					.click();
			}
		}
		const ada = page
			.getByRole("navigation", { name: "Familiar neighbours" })
			.getByRole("button", { name: /Ada/ });
		await ada.focus();
		await page.keyboard.press("Enter");
		await expect(
			page.getByLabel("Ada's details", { exact: true }),
		).toBeVisible();
		await page
			.getByRole("button", { name: "Close person details", exact: true })
			.click();
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= innerWidth,
			),
		).toBe(true);
	}
});

test("retained outcomes stay near the clock and promise results survive into the next day", async ({
	page,
}) => {
	await page.goto("/");
	await expect(
		page.getByRole("button", { name: "Pause town", exact: true }),
	).toBeVisible();
	await page.getByLabel("Playback speed").selectOption("120");
	await expect(page.locator(".town-time .eyebrow")).toContainText("Day 2", {
		timeout: 30000,
	});
	await pause(page);
	await page
		.getByRole("navigation", { name: "Familiar neighbours" })
		.getByRole("button", { name: /Ada/ })
		.click();
	const ada = page.getByLabel("Ada's details", { exact: true });
	await expect(ada.locator(".promise-result")).toContainText(
		/Promise result · (Kept|Broken|Released)/,
	);
	await expect(ada.locator(".promise-result")).toContainText(
		"Deadline · Day 1",
	);
	await expect(ada.locator(".promise-history")).not.toHaveAttribute("open");
	await expect(ada.locator(".reason")).not.toHaveAttribute("open");
	await expect(ada.locator(".reason summary")).toContainText("Why this choice");
	await page
		.getByRole("button", { name: "Close person details", exact: true })
		.click();
	if (!(await page.locator(".story-headline").count())) {
		await page.getByRole("button", { name: "Play town", exact: true }).click();
		await expect(page.locator(".story-headline")).toBeVisible({
			timeout: 30000,
		});
		await pause(page);
	}
	await expect(page.locator(".story-headline .eyebrow")).toContainText("Day ");
	await page.locator(".story-headline").focus();
	await page.keyboard.press("Enter");
	await expect(
		page.getByRole("tab", { name: "Stories", exact: true }),
	).toHaveAttribute("aria-selected", "true");
	await expect(page.locator("article.event:focus")).toBeVisible();
	await expect(page.locator("article.event:focus > .eyebrow")).toContainText(
		"Day ",
	);
	await expect(
		page.locator("article.event:focus .story-sources"),
	).not.toHaveAttribute("open");
});
