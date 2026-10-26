import { expect, test } from "./clock-fixture";
import { closeSelection, openSaves, showTab } from "./session-helpers";

for (const width of [360, 1280])
	test(`one sheet and pinned actions at ${width}`, async ({ page }) => {
		await page.setViewportSize({ width, height: width === 360 ? 690 : 800 });
		await page.goto("/?lab=1");
		await page
			.getByRole("button", { name: /^(Enter|Return to) Mill Bridge/ })
			.click();
		await expect(page.locator(".town-ready")).toBeVisible({ timeout: 120000 });
		await expect(page.locator(".game-sheet")).toHaveCount(1);
		await expect(page.locator(".neighbour-strip")).toBeInViewport({ ratio: 1 });
		expect(
			await page
				.locator(".neighbour-strip")
				.evaluate((e) => e.scrollWidth <= e.clientWidth),
		).toBe(true);
		for (const name of ["Help", "Journal", "Compare"] as const) {
			await showTab(page, name);
			await expect(page.locator(".person-panel")).toHaveCount(0);
			expect(
				await page.evaluate(
					() =>
						(document.scrollingElement?.scrollHeight ?? Infinity) <=
						innerHeight,
				),
			).toBe(true);
		}
		await closeSelection(page);
		await page.locator(".neighbour-strip [data-person-id]").first().click();
		await expect(page.locator(".person-panel")).toBeVisible();
		await expect(page.locator(".game-actions .primary")).toBeInViewport({
			ratio: 1,
		});
		await closeSelection(page);
		await openSaves(page);
		const menu = page.getByRole("dialog", { name: /^Game menu/ });
		await expect(
			menu.getByRole("button", { name: /^Read the journal/ }),
		).toBeVisible();
		await expect(menu.getByLabel("Start from a seed number")).toHaveCount(0);
		await expect(menu.getByLabel("Import town save")).toHaveCount(0);
		await page.keyboard.press("Escape");
		await expect(menu).not.toBeVisible();
	});
