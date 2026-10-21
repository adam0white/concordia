import { expect, test } from "./clock-fixture";
import { closeSaves, openSaves } from "./session-helpers";

test("welcome explains the town before starting any runtime, with keyboard entry and compact mobile controls", async ({
	page,
}, info) => {
	const runtimeRequests: string[] = [];
	page.on("request", (request) => {
		if (
			/pyodide|python_stdlib|\.wasm(?:\?|$)|runtime-worker/.test(request.url())
		) {
			runtimeRequests.push(request.url());
		}
	});
	await page.addInitScript(() => {
		const NativeWorker = window.Worker;
		Object.assign(window, { welcomeWorkerCount: 0 });
		window.Worker = class extends NativeWorker {
			constructor(url: string | URL, options?: WorkerOptions) {
				super(url, options);
				const state = window as unknown as { welcomeWorkerCount: number };
				state.welcomeWorkerCount++;
			}
		};
	});
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto("/");
	await expect(
		page.getByRole("heading", { name: "A town rebuilding after a flood." }),
	).toBeVisible();
	await expect(page.locator(".welcome-screen")).toContainText(
		"public transport",
	);
	await expect(page.locator(".welcome-screen")).toContainText(
		"shared repair tools",
	);
	await expect(page.locator(".welcome-screen")).toContainText(
		"starts when you enter",
	);
	await expect(
		page.getByRole("button", { name: "Game menu", exact: true }),
	).toHaveCount(0);
	await expect(page.locator(".runtime-label")).toHaveText(
		"A town on your device",
	);
	expect(
		await page.evaluate(
			() =>
				(window as unknown as { welcomeWorkerCount: number })
					.welcomeWorkerCount,
		),
	).toBe(0);
	expect(runtimeRequests).toEqual([]);
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= innerWidth,
		),
	).toBe(true);
	await page.screenshot({ path: info.outputPath("welcome-mobile.png") });
	await page.getByRole("button", { name: "Enter town", exact: true }).focus();
	await page.keyboard.press("Enter");
	await expect(
		page.getByRole("button", { name: "Game menu", exact: true }),
	).toBeVisible();
	expect(
		await page.evaluate(
			() =>
				(window as unknown as { welcomeWorkerCount: number })
					.welcomeWorkerCount,
		),
	).toBe(1);
	await openSaves(page);
	await expect(
		page.getByRole("button", { name: "Import", exact: true }),
	).toBeInViewport();
	await closeSaves(page);
	await expect(
		page.getByRole("button", { name: "Game menu", exact: true }),
	).toBeInViewport();
	await expect(
		page.getByRole("button", { name: "Step: Advance one round" }),
	).toHaveCount(0);
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= innerWidth,
		),
	).toBe(true);
	const playback = await page.locator(".playback").boundingBox();
	expect(playback?.height).toBeLessThanOrEqual(70);
	await page.screenshot({ path: info.outputPath("footer-mobile-sticky.png") });
	for (const width of [1280, 390]) {
		await page.setViewportSize({ width, height: 844 });
		await openSaves(page);
		const importButton = page.getByRole("button", {
			name: "Import",
			exact: true,
		});
		await importButton.scrollIntoViewIfNeeded();
		await expect(importButton).toBeInViewport();
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= innerWidth,
			),
		).toBe(true);
		await closeSaves(page);
	}
});

test("a new seed is durably saved while paused before its first round", async ({
	page,
}) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Enter town", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Game menu", exact: true }),
	).toBeVisible();
	await openSaves(page);
	await page.getByLabel("New town seed").fill("71");
	await page.getByRole("button", { name: "Start town", exact: true }).click();
	const latest = () =>
		page.evaluate(async () => {
			const database = await new Promise<IDBDatabase>((resolve, reject) => {
				const r = indexedDB.open("alder-quay", 1);
				r.onsuccess = () => resolve(r.result);
				r.onerror = () => reject(r.error);
			});
			try {
				return await new Promise<
					{ runtime: { seed: number; round: number } } | undefined
				>((resolve, reject) => {
					const r = database
						.transaction("saves")
						.objectStore("saves")
						.get("latest");
					r.onsuccess = () => resolve(r.result);
					r.onerror = () => reject(r.error);
				});
			} finally {
				database.close();
			}
		});
	await expect.poll(async () => (await latest())?.runtime.seed).toBe(71);
	expect((await latest())?.runtime.round).toBe(0);
	await page.reload();
	await page.getByRole("button", { name: "Enter town", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Game menu", exact: true }),
	).toBeVisible();
	expect((await latest())?.runtime.seed).toBe(71);
	expect((await latest())?.runtime.round).toBe(0);
});

test("the single native welcome help supports keyboard, Escape and outside dismissal", async ({
	page,
}) => {
	await page.setViewportSize({ width: 360, height: 690 });
	await page.goto("/");
	const info = page.getByRole("button", {
		name: "About Alder Quay",
		exact: true,
	});
	await info.focus();
	await page.keyboard.press("Space");
	const popup = page.locator("#welcome-help");
	await expect(popup).toBeVisible();
	await expect(popup).toContainText("More about Alder Quay");
	await expect(popup).toContainText("About the simulation");
	const box = await popup.boundingBox();
	expect(box).not.toBeNull();
	expect(box?.x).toBeGreaterThanOrEqual(0);
	expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(360);
	expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(690);
	await page.keyboard.press("Escape");
	await expect(popup).not.toBeVisible();
	await expect(info).toBeFocused();
	await info.click();
	await page.mouse.click(2, 2);
	await expect(popup).not.toBeVisible();
});
