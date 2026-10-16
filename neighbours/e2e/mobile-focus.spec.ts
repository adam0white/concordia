import { expect, test } from "@playwright/test";

test("mobile navigation exposes help immediately and replaces the town with focused views", async ({
	page,
}) => {
	await page.setViewportSize({ width: 320, height: 740 });
	await page.goto(process.env.NEIGHBOURS_TEST_BASE ?? "/");
	await page.getByRole("button", { name: "Enter town", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Play town", exact: true }),
	).toBeVisible({ timeout: 60000 });
	const help = page.getByRole("tab", { name: "Help", exact: true });
	await expect(help).toBeInViewport({ timeout: 5000 });
	await expect(
		page.getByRole("progressbar", { name: "Hall repairs" }),
	).toBeInViewport();
	await help.click();
	await expect(
		page.getByRole("heading", { name: "Help the town", exact: true }),
	).toBeVisible();
	await expect(
		page.getByRole("button", { name: /Restore public bus/ }),
	).toBeVisible();
	await expect(page.locator(".map-section")).not.toBeVisible();
	await page.getByRole("tab", { name: "Stories", exact: true }).click();
	await expect(page.locator(".map-section")).not.toBeVisible();
	await expect(page.locator(".person-panel")).not.toBeVisible();
	await page.getByRole("tab", { name: "Inspector", exact: true }).click();
	await expect(page.locator(".map-section")).not.toBeVisible();
	await expect(page.locator(".person-panel")).not.toBeVisible();
	await page
		.getByRole("button", { name: "Save and town options", exact: true })
		.click();
	await expect(
		page.getByRole("dialog", { name: "Save and town options" }),
	).toBeVisible();
	await expect(page.getByLabel("New town seed")).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(page.getByRole("dialog")).not.toBeVisible();
	await expect(
		page.getByRole("button", { name: "Save and town options", exact: true }),
	).toBeFocused();
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= innerWidth,
		),
	).toBe(true);
});
