import { expect, test } from "@playwright/test";
import { createRuntime } from "../src/core/scenario";

const packet = {
	schema: "neighbours/concordia@1",
	rounds: 0,
	runtime: createRuntime(73, 206).export(),
};
for (const [width, height] of [
	[360, 690],
	[820, 1180],
	[1180, 820],
	[1280, 800],
] as const) {
	test(`ordinary controls, readable feedback and protected failed admission at ${width}`, async ({
		page,
	}) => {
		await page.setViewportSize({ width, height });
		await page.route("https://human.adamwhite.work/**", async (route) => {
			if (route.request().method() === "POST")
				await route.fulfill({ status: 204 });
			else await route.continue();
		});
		await page.addInitScript(async (value) => {
			localStorage.setItem("hf-lab-recording-off", "1");
			await new Promise<void>((resolve, reject) => {
				const open = indexedDB.open("alder-quay", 1);
				open.onupgradeneeded = () => open.result.createObjectStore("saves");
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const db = open.result;
					const tx = db.transaction("saves", "readwrite");
					tx.objectStore("saves").put(value, "latest");
					tx.oncomplete = () => {
						db.close();
						resolve();
					};
					tx.onerror = () => reject(tx.error);
				};
			});
		}, packet);
		await page.goto("/");
		await expect(
			page.getByRole("button", { name: /Other ways in/ }),
		).toHaveCount(0);
		await page
			.getByRole("button", { name: /^(Enter|Return to) Mill Bridge/ })
			.click();
		await expect(page.locator(".town-ready")).toBeVisible();
		await page.evaluate(() => document.fonts.ready);
		await page.getByRole("button", { name: "Game menu", exact: true }).click();
		const menu = page.locator(".session-menu");
		await expect(menu.getByRole("link")).toHaveText(["All games"]);
		await expect(
			menu.getByRole("button", {
				name: /Compare possible outcomes|Recorded studies|To the title page|Switch light or dark colours/,
			}),
		).toHaveCount(0);
		await expect(
			menu.getByLabel("Recording", { exact: true }),
		).not.toBeChecked();
		await menu.getByRole("button", { name: /^Feedback/ }).click();
		await page.locator("#feedback-note").fill("A note without a recorded run.");
		await page.locator(".feedback-name > summary").click();
		await page
			.getByLabel("Your name (optional)", { exact: true })
			.fill("Layout QA");
		const submit = page.getByRole("button", { name: "Submit", exact: true });
		await expect(submit).toBeInViewport({ ratio: 1 });
		const font = await page
			.locator(".feedback-note")
			.evaluate((e) => Number.parseFloat(getComputedStyle(e).fontSize));
		expect(font).toBeGreaterThanOrEqual(width >= 768 ? 18 : 16);
		await expect(
			page.getByRole("button", {
				name: "Keep a copy of this run",
				exact: true,
			}),
		).toHaveCount(0);
		await expect(
			page.getByRole("checkbox", {
				name: "Share this run and my play with the lab",
			}),
		).not.toBeChecked();
		await page
			.getByRole("button", { name: "Close Feedback", exact: true })
			.click();
		await page.getByRole("button", { name: "Game menu", exact: true }).click();
		const now = await page.locator(".town-time strong").textContent();
		await menu.getByRole("button", { name: "New game", exact: true }).click();
		await expect(
			menu.getByText("Your current town will be kept as the previous town."),
		).toBeVisible();
		await menu
			.getByRole("button", { name: "Start new game", exact: true })
			.click();
		await expect(page.locator('.game-sheet [role="alert"]')).toContainText(
			"The town could not complete that action.",
		);
		await expect(page.locator(".town-time strong")).toHaveText(now ?? "");
		await expect(
			page.getByText("Shelf unavailable. Use a local file.", { exact: false }),
		).toHaveCount(0);
		const save = await page.evaluate(
			async () =>
				new Promise<{ runtime: { seed: number } }>((resolve, reject) => {
					const r = indexedDB.open("alder-quay", 1);
					r.onerror = () => reject(r.error);
					r.onsuccess = () => {
						const db = r.result;
						const q = db
							.transaction("saves")
							.objectStore("saves")
							.get("latest");
						q.onsuccess = () => {
							db.close();
							resolve(q.result);
						};
						q.onerror = () => reject(q.error);
					};
				}),
		);
		expect(save.runtime.seed).toBe(73);
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= innerWidth,
			),
		).toBe(true);
	});
}
