import { expect, type Page, test } from "@playwright/test";
import { showTab } from "./session-helpers";

async function enter(page: Page) {
	await page.goto("/");
	await page.getByRole("button", { name: "Enter town", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Play town", exact: true }),
	).toBeVisible({ timeout: 60_000 });
}

test("clicking a neighbour chip never closes that neighbour's panel", async ({
	page,
}) => {
	// Desktop width: below 900px the strip is hidden while a drawer is open.
	await enter(page);
	const chip = page.locator(".neighbour-strip [data-person-id]").first();
	await chip.click();
	await expect(page.locator(".person-panel")).toBeVisible();
	await expect(chip).toHaveAttribute("aria-current", "true");
	await chip.click();
	await expect(page.locator(".person-panel")).toBeVisible();
	await page.locator(".neighbour-strip [data-person-id]").nth(1).click();
	await expect(page.locator(".person-panel")).toBeVisible();
});

test("the you marker stays whole at the left-edge quay on phone widths", async ({
	page,
}) => {
	test.setTimeout(180_000);
	await enter(page);
	await showTab(page, "Journal");
	const you = page.locator(".journal .speak-panel");
	await you
		.locator("details.walk .walk-list button", { hasText: "Quay" })
		.click();
	const step = page.getByRole("button", { name: "Step: Advance one round" });
	for (
		let i = 0;
		i < 40 &&
		!/You are at Quay/.test(
			(await you.locator(".player-place").textContent()) ?? "",
		);
		i++
	) {
		await expect(step).toBeEnabled();
		await step.click();
	}
	await expect(you.locator(".player-place")).toContainText("You are at Quay");
	await showTab(page, "Town");
	for (const width of [320, 360, 390]) {
		await page.setViewportSize({ width, height: 780 });
		const marker = page.locator(".map-you");
		await expect(marker).toHaveCount(1);
		await expect
			.poll(async () => {
				const map = await page.locator(".town-map").boundingBox();
				const box = await marker.boundingBox();
				return Boolean(
					map &&
						box &&
						box.x >= map.x - 0.5 &&
						box.x + box.width <= map.x + map.width + 0.5,
				);
			})
			.toBe(true);
	}
	// × is the death marker only: neither the workshop nor the player draws one.
	await expect(page.locator(".map-you .you-mark")).toHaveCount(1);
	await expect(
		page.locator('[data-map-place="workshop"] .tool-mark'),
	).toHaveCount(1);
});
