import { expect, test } from "./clock-fixture";
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
	await page.setViewportSize({ width: 360, height: 690 });
	await page.goto("/?lab=1");
	await expect(
		page.getByRole("heading", { name: "A town is rebuilding after a flood." }),
	).toBeVisible();
	await expect(page.locator(".welcome-screen")).toContainText(
		"They decide for themselves.",
	);
	expect(requests).toEqual([]);
	const enter = page.getByRole("button", {
		name: "Enter Alder Quay",
		exact: true,
	});
	await expect(enter).toBeInViewport({ ratio: 1 });
	expect(
		await page.evaluate(
			() =>
				(document.scrollingElement?.scrollHeight ?? Infinity) <= innerHeight,
		),
	).toBe(true);
	await enter.focus();
	await page.keyboard.press("Enter");
	await expect(page.locator(".town-ready")).toBeVisible({ timeout: 120000 });
	await expect(
		page.getByRole("button", { name: /^(Play|Pause|Step)/ }),
	).toHaveCount(0);
});

test("a new seed is durably saved while paused before its first round", async ({
	page,
}) => {
	await page.goto("/?lab=1");
	await page
		.getByRole("button", { name: /^(Enter|Return to) Alder Quay/ })
		.click();
	await expect(page.locator(".town-ready")).toBeVisible();
	await openSaves(page);
	await openOtherWays(page);
	await page.getByLabel("Start from a seed number").fill("71");
	await page.getByRole("button", { name: "Start", exact: true }).click();
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
	await page
		.getByRole("button", { name: /^(Enter|Return to) Alder Quay/ })
		.click();
	await expect(page.locator(".town-ready")).toBeVisible();
	expect((await latest())?.runtime.seed).toBe(71);
	expect((await latest())?.runtime.round).toBe(0);
});

test("one top-bar information panel supports keyboard and Escape", async ({
	page,
}) => {
	await page.setViewportSize({ width: 360, height: 690 });
	await page.goto("/?lab=1");
	const info = page.getByRole("button", { name: "Information", exact: true });
	await expect(info).toHaveCount(1);
	await info.focus();
	await page.keyboard.press("Space");
	const popup = page.getByRole("dialog", {
		name: "About Alder Quay",
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
