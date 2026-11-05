import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { chromium, expect, type Page, test } from "@playwright/test";

test("foreign file preserves occupied native slots through full export and reimport", async ({
	browserName,
}, info) => {
	test.skip(
		!process.env.NEIGHBOURS_FOREIGN_FIXTURE,
		"Manual full-native source proof requires an explicit private fixture and --global-timeout=0",
	);
	if (browserName !== "chromium")
		throw Error("This source control uses the cached Chromium runtime");
	test.setTimeout(0);
	if (info.config.globalTimeout !== 0)
		throw Error(
			"Run this preservation control with --global-timeout=0; unknown queue must hold, not auto-teardown",
		);
	const file = process.env.NEIGHBOURS_FOREIGN_FIXTURE;
	if (!file)
		throw Error(
			"Bind NEIGHBOURS_FOREIGN_FIXTURE to the complete retained packet",
		);
	const original = JSON.parse(await readFile(file, "utf8"));
	expect(original.runtime.physical.people).toHaveLength(206);
	const profile = info.outputPath("source-test-profile");
	const baseURL = info.project.use.baseURL;
	if (
		!baseURL ||
		!["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname)
	)
		throw Error("Source control requires a task localhost origin");
	const context = await chromium.launchPersistentContext(profile, {
		headless: true,
		baseURL,
	});
	let page: Page | undefined;
	let owned: string[] = [];
	try {
		page = await context.newPage();
		page.setDefaultTimeout(15000);
		owned = execFileSync("ps", ["-ax", "-o", "pid,ppid,command"], {
			encoding: "utf8",
		})
			.split("\n")
			.filter((line) => line.includes(`--user-data-dir=${profile}`));
		await writeFile(
			info.outputPath("owned-launch.json"),
			JSON.stringify(
				{ profile, owned, scope: "ephemeral localhost source regression only" },
				null,
				2,
			),
			{ mode: 0o600 },
		);
		await page.clock.install();
		await page.clock.pauseAt(new Date());
		await page.goto("/?file=1");
		await page.evaluate(async () => {
			localStorage.setItem("alder-follow", "occupied-owner-selection");
			localStorage.setItem("foreign-test-sentinel", "occupied-owner-data");
			const db = await new Promise<IDBDatabase>((resolve, reject) => {
				const r = indexedDB.open("alder-quay", 1);
				r.onupgradeneeded = () => r.result.createObjectStore("saves");
				r.onsuccess = () => resolve(r.result);
				r.onerror = () => reject(r.error);
			});
			await new Promise<void>((resolve, reject) => {
				const tx = db.transaction("saves", "readwrite");
				for (const key of ["latest", "previous", "checkpoint-revision"])
					tx.objectStore("saves").put({ sentinel: key }, key);
				tx.oncomplete = () => resolve();
				tx.onerror = () => reject(tx.error);
			});
			db.close();
		});
		await page.reload();
		await expect(
			page.getByText("Open a saved town file", { exact: true }),
		).toBeVisible();

		const activePage = page;
		const deferNextFileRead = async () => {
			await activePage.evaluate(() => {
				const original = Blob.prototype.text;
				const control = { started: false, settled: false, release: () => {} };
				const gate = new Promise<void>((resolve) => {
					control.release = resolve;
				});
				(
					window as unknown as { fileReadControl: typeof control }
				).fileReadControl = control;
				Blob.prototype.text = function () {
					Blob.prototype.text = original;
					control.started = true;
					return gate
						.then(() => original.call(this))
						.finally(() => {
							control.settled = true;
						});
				};
			});
		};
		const readStarted = () =>
			activePage.evaluate(
				() =>
					(window as unknown as { fileReadControl: { started: boolean } })
						.fileReadControl.started,
			);
		const releaseRead = async () => {
			await activePage.evaluate(() =>
				(
					window as unknown as { fileReadControl: { release: () => void } }
				).fileReadControl.release(),
			);
			await expect
				.poll(() =>
					activePage.evaluate(
						() =>
							(window as unknown as { fileReadControl: { settled: boolean } })
								.fileReadControl.settled,
					),
				)
				.toBe(true);
		};
		await deferNextFileRead();
		await page.getByLabel("Town file", { exact: true }).setInputFiles(file);
		await expect.poll(readStarted).toBe(true);
		await page
			.getByRole("button", { name: "Cancel file selection", exact: true })
			.click();
		await releaseRead();
		await expect(page.locator(".town-ready")).toHaveCount(0);
		await expect(
			page.getByText("Open a saved town file", { exact: true }),
		).toBeVisible();
		await page.getByLabel("Town file", { exact: true }).setInputFiles(file);
		await expect(page.locator(".town-ready")).toBeVisible();
		const exportPacket = async () => {
			await activePage
				.getByRole("button", { name: "Game menu", exact: true })
				.click();
			const link = activePage.getByRole("link", {
				name: "Download save",
				exact: true,
			});
			const previous = (await link.count())
				? await link.getAttribute("href")
				: null;
			await activePage
				.getByRole("button", { name: "Keep a copy of this run", exact: true })
				.click();
			await expect.poll(() => link.getAttribute("href")).not.toBe(previous);
			await expect(link).toBeVisible();
			const [download] = await Promise.all([
				activePage.waitForEvent("download"),
				link.click(),
			]);
			const out = info.outputPath(`foreign-${Date.now()}.json.gz`);
			await download.saveAs(out);
			const packet = JSON.parse(
				gunzipSync(await readFile(out)).toString("utf8"),
			);
			await activePage
				.getByRole("button", { name: "Close Game menu", exact: true })
				.click();
			return { packet, out };
		};
		const first = await exportPacket();
		expect(first.packet.runtime).toEqual(original.runtime);
		expect(first.packet.rounds).toBe(original.rounds);
		expect(first.packet.castLocal.heads).toEqual(original.castLocal.heads);
		expect(first.packet.castLocal.sources).toEqual(original.castLocal.sources);
		expect(first.packet.castLocal.file).toBe(true);
		await page
			.getByRole("button", { name: "Walk somewhere", exact: true })
			.click();
		await page
			.getByRole("button", { name: "Market kitchen about 30 min", exact: true })
			.click();
		const played = await exportPacket();
		expect(played.packet.runtime.physical.player).toBeDefined();
		// Independent full restore, identical ordinary input, whole packet replay equality.
		await page
			.getByRole("button", { name: "Close file session", exact: true })
			.click();
		await page.getByLabel("Town file", { exact: true }).setInputFiles(file);
		await expect(page.locator(".town-ready")).toBeVisible();
		await page
			.getByRole("button", { name: "Walk somewhere", exact: true })
			.click();
		await page
			.getByRole("button", { name: "Market kitchen about 30 min", exact: true })
			.click();
		expect((await exportPacket()).packet).toEqual(played.packet);
		await page
			.getByRole("button", { name: "Close file session", exact: true })
			.click();
		// A delayed older played file must not overwrite the later original selection.
		await deferNextFileRead();
		await page
			.getByLabel("Town file", { exact: true })
			.setInputFiles(played.out);
		await expect.poll(readStarted).toBe(true);
		await page.getByLabel("Town file", { exact: true }).setInputFiles(file);
		await expect(page.locator(".town-ready")).toBeVisible();
		const latest = await exportPacket();
		expect(latest.packet.runtime).toEqual(original.runtime);
		await releaseRead();
		expect((await exportPacket()).packet).toEqual(latest.packet);

		await page
			.getByRole("button", { name: "Close file session", exact: true })
			.click();
		await page
			.getByLabel("Town file", { exact: true })
			.setInputFiles(played.out);
		await expect(page.locator(".town-ready")).toBeVisible();
		expect((await exportPacket()).packet).toEqual(played.packet);
		const native = await page.evaluate(async () => {
			const db = await new Promise<IDBDatabase>((resolve, reject) => {
				const r = indexedDB.open("alder-quay", 1);
				r.onsuccess = () => resolve(r.result);
				r.onerror = () => reject(r.error);
			});
			const rows = await new Promise<unknown[]>((resolve, reject) => {
				const tx = db.transaction("saves", "readonly");
				const r = tx.objectStore("saves").getAll();
				tx.oncomplete = () => resolve(r.result);
				tx.onerror = () => reject(tx.error);
			});
			db.close();
			return {
				rows,
				follow: localStorage.getItem("alder-follow"),
				sentinel: localStorage.getItem("foreign-test-sentinel"),
			};
		});
		expect(native).toEqual({
			rows: [
				{ sentinel: "checkpoint-revision" },
				{ sentinel: "latest" },
				{ sentinel: "previous" },
			],
			follow: "occupied-owner-selection",
			sentinel: "occupied-owner-data",
		});
	} finally {
		try {
			const observedPage =
				page ??
				(await Promise.reject<never>(
					Error("No page available for final queue observation"),
				));
			const evidence = await Promise.race([
				observedPage.evaluate(async () => {
					const metadata = await indexedDB.databases();
					const rows: unknown[] = [];
					if (metadata.some((d) => d.name === "hf-lab-pending")) {
						const db = await new Promise<IDBDatabase>((resolve, reject) => {
							const r = indexedDB.open("hf-lab-pending");
							r.onsuccess = () => resolve(r.result);
							r.onerror = () => reject(r.error);
						});
						for (const name of db.objectStoreNames) {
							const records = await new Promise<unknown[]>(
								(resolve, reject) => {
									const tx = db.transaction(name, "readonly");
									const r = tx.objectStore(name).getAll();
									tx.oncomplete = () => resolve(r.result);
									tx.onerror = () => reject(tx.error);
								},
							);
							for (const record of records) {
								const value: Record<string, unknown> = {};
								for (const [key, field] of Object.entries(
									record as Record<string, unknown>,
								))
									value[key] =
										field instanceof Blob
											? {
													type: field.type,
													bytes: Array.from(
														new Uint8Array(await field.arrayBuffer()),
													),
												}
											: field;
								rows.push({ store: name, value });
							}
						}
						db.close();
					}
					return {
						rows,
						count: rows.length,
						origin: location.origin,
						localStorage: { ...localStorage },
						sessionStorage: { ...sessionStorage },
					};
				}),
				new Promise<never>((_, reject) =>
					setTimeout(
						() => reject(Error("Final queue observation deadline")),
						5000,
					),
				),
			]);
			const retained = info.outputPath("queue-before-close-private.json");
			const bytes = JSON.stringify(evidence);
			await writeFile(retained, bytes, { mode: 0o600 });
			expect(await readFile(retained, "utf8")).toBe(bytes);
			await info.attach("queue-before-close-private", {
				body: JSON.stringify(evidence),
				contentType: "application/json",
			});
			if (evidence.count)
				await Promise.reject(
					Error(
						"Unexpected pending SDK rows retained privately; preserve context and block source gate",
					),
				);
			await context.close();
			await writeFile(
				info.outputPath("source-context-closed.json"),
				JSON.stringify({
					closed: true,
					profile,
					queue_count: evidence.count,
					owned_after: execFileSync("ps", ["-ax", "-o", "pid,ppid,command"], {
						encoding: "utf8",
					})
						.split("\n")
						.filter((line) => line.includes(`--user-data-dir=${profile}`)),
				}),
				{ mode: 0o600 },
			);
		} catch (error) {
			try {
				await writeFile(
					info.outputPath("HOLD-DO-NOT-CLOSE.json"),
					JSON.stringify(
						{
							profile,
							owned,
							error: String(error),
							queue: "UNKNOWN_OR_NONZERO",
							action: "preserve browser/profile; root must resolve",
							at: new Date().toISOString(),
						},
						null,
						2,
					),
					{ mode: 0o600 },
				);
			} catch (failure) {
				console.error(
					"HOLD receipt write failed; still preserving context",
					failure,
				);
			}
			console.error(
				"HOLD: queue unknown/nonzero. Browser/profile retained; no runner teardown.",
				profile,
			);
			await new Promise<never>(() => {});
		}
	}
});
