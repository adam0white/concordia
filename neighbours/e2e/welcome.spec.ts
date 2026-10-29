import { expect, test } from "./clock-fixture";
import { enterLocalTown } from "./local-fixture";
import { openOtherWays, openSaves } from "./session-helpers";

test("title starts no runtime and keeps keyboard entry visible", async ({
	page,
}) => {
	const requests: string[] = [];
	page.on("request", (request) => {
		if (
			/pyodide|python_stdlib|\.wasm(?:\?|$)|runtime-worker/.test(request.url())
		)
			requests.push(request.url());
	});
	for (const viewport of [
		{ width: 360, height: 690 },
		{ width: 1280, height: 800 },
	]) {
		await page.setViewportSize(viewport);
		await page.goto("/");
		const scene = await page.locator(".welcome-scene").boundingBox();
		const premise = await page.locator(".welcome-premise").boundingBox();
		expect(scene).not.toBeNull();
		expect(premise).not.toBeNull();
		if (!scene || !premise) throw Error("Missing title regions");
		expect(scene.y + scene.height).toBeLessThanOrEqual(premise.y);
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= innerWidth,
			),
		).toBe(true);
	}
	await expect(
		page.getByRole("heading", { name: "A town is rebuilding after a flood." }),
	).toBeVisible();
	await expect(page.locator(".welcome-screen")).toContainText(
		"They decide for themselves.",
	);
	expect(requests).toEqual([]);
	const enter = page.getByRole("button", {
		name: "Enter Mill Bridge",
		exact: true,
	});
	await expect(enter).toBeInViewport({ ratio: 1 });
	expect(
		await page.evaluate(
			() =>
				(document.scrollingElement?.scrollHeight ?? Infinity) <= innerHeight,
		),
	).toBe(true);
	// Shared admission has its own failure control. Use the explicit local path
	// here so this keyboard/runtime check has no network ownership dependency.
	await page.getByRole("button", { name: /^Other ways in/ }).focus();
	await page.keyboard.press("Enter");
	await page
		.getByRole("button", { name: "Start a fresh local town", exact: true })
		.focus();
	await page.keyboard.press("Enter");
	await expect(page.locator(".town-ready")).toBeVisible({ timeout: 120000 });
	await expect(
		page.getByRole("button", { name: /^(Play|Pause|Step)/ }),
	).toHaveCount(0);
});

test("a new seed is durably saved while paused before its first round", async ({
	page,
}) => {
	await page.goto("/");
	await enterLocalTown(page);
	await expect(page.locator(".town-ready")).toBeVisible();
	await openSaves(page);
	await openOtherWays(page);
	await page.getByLabel("Start from a seed number").fill("71");
	await enterLocalTown(page);
	const latest = () =>
		page.evaluate(async () => {
			const database = await new Promise<IDBDatabase>((resolve, reject) => {
				const r = indexedDB.open("alder-quay", 1);
				r.onsuccess = () => resolve(r.result);
				r.onerror = () => reject(r.error);
			});
			try {
				return await new Promise<
					{ runtime: { physical: { seed: number; round: number } } } | undefined
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
	await expect
		.poll(async () => (await latest())?.runtime.physical.seed)
		.toBe(71);
	expect((await latest())?.runtime.physical.round).toBe(0);
	await page.reload();
	await enterLocalTown(page);
	await expect(page.locator(".town-ready")).toBeVisible();
	expect((await latest())?.runtime.physical.seed).toBe(71);
	expect((await latest())?.runtime.physical.round).toBe(0);
});

test("one top-bar information panel supports keyboard and Escape", async ({
	page,
}) => {
	await page.setViewportSize({ width: 360, height: 690 });
	await page.goto("/");
	const info = page.getByRole("button", { name: "Information", exact: true });
	await expect(info).toHaveCount(1);
	await info.focus();
	await page.keyboard.press("Space");
	const popup = page.getByRole("dialog", {
		name: "About Mill Bridge",
		exact: true,
	});
	await expect(popup).toBeVisible();
	await expect(popup).toContainText("nothing is played back");
	const box = await popup.boundingBox();
	expect(box?.x).toBeGreaterThanOrEqual(0);
	expect((box?.x ?? 0) + (box?.width ?? Infinity)).toBeLessThanOrEqual(360);
	await page.keyboard.press("Escape");
	await expect(popup).not.toBeVisible();
});
