import { expect, test } from "@playwright/test";

test("mobile keeps the map and opens one drawer at a time, with help one tap inside More", async ({
	page,
}) => {
	await page.setViewportSize({ width: 320, height: 740 });
	await page.goto(process.env.NEIGHBOURS_TEST_BASE ?? "/");
	await page.getByRole("button", { name: "Enter town", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Play town", exact: true }),
	).toBeVisible({ timeout: 60000 });
	const views = page.getByRole("tablist", { name: "Town views" });
	const more = views.getByRole("tab", { name: "More", exact: true });
	await expect(more).toBeInViewport({ timeout: 5000 });
	await expect(
		page.getByRole("progressbar", { name: "Hall repairs" }),
	).toBeInViewport();
	const drawers = page.locator(".drawer");
	await expect(drawers).toHaveCount(0);
	await more.click();
	await page
		.getByRole("tablist", { name: "More" })
		.getByRole("tab", { name: "Help", exact: true })
		.click();
	await expect(
		page.getByRole("heading", { name: "Help the town", exact: true }),
	).toBeVisible();
	await expect(
		page.getByRole("button", { name: /Restore public bus/ }),
	).toBeVisible();
	await expect(page.locator(".map-section")).toBeVisible();
	await expect(drawers).toHaveCount(1);
	await views.getByRole("tab", { name: "Journal", exact: true }).click();
	await expect(drawers).toHaveCount(1);
	await expect(page.locator(".map-section")).toBeVisible();
	await expect(page.locator(".person-panel")).not.toBeVisible();
	await expect(
		page.getByRole("heading", { name: "Help the town", exact: true }),
	).toHaveCount(0);
	await more.click();
	await page
		.getByRole("tablist", { name: "More" })
		.getByRole("tab", { name: "Compare", exact: true })
		.click();
	await expect(drawers).toHaveCount(1);
	await expect(page.locator(".person-panel")).not.toBeVisible();
	await views.getByRole("tab", { name: "Town", exact: true }).click();
	await expect(drawers).toHaveCount(0);
	await page.locator(".neighbour-strip [data-person-id]").first().click();
	await expect(drawers).toHaveCount(1);
	await expect(page.locator(".person-panel")).toBeVisible();
	await page.getByRole("button", { name: "Close person details" }).click();
	await expect(drawers).toHaveCount(0);
	await page.getByRole("button", { name: "Game menu", exact: true }).click();
	await expect(page.getByRole("dialog", { name: "Game menu" })).toBeVisible();
	await expect(page.getByLabel("New town seed")).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(page.getByRole("dialog")).not.toBeVisible();
	await expect(
		page.getByRole("button", { name: "Game menu", exact: true }),
	).toBeFocused();
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= innerWidth,
		),
	).toBe(true);
});
