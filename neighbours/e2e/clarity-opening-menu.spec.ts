import { expect, test } from "./clock-fixture";
import { openSaves } from "./session-helpers";

test("entry stays visible and one menu holds the town", async ({ page }) => {
	await page.setViewportSize({ width: 360, height: 690 });
	await page.goto("/?lab=1");
	const enter = page.getByRole("button", {
		name: "Enter Alder Quay",
		exact: true,
	});
	await expect(enter).toBeInViewport({ ratio: 1 });
	await expect(
		page.getByRole("button", { name: "Information", exact: true }),
	).toHaveCount(1);
	await expect(
		page.getByRole("button", { name: "Game menu", exact: true }),
	).toHaveCount(1);
	await enter.click();
	await expect(page.locator(".town-ready")).toBeVisible({ timeout: 120000 });
	await openSaves(page);
	const menu = page.getByRole("dialog", { name: /^Game menu/ });
	for (const name of [
		"Read the journal",
		"Switch light or dark colours",
		"Compare possible outcomes",
		"Recorded studies",
		"Feedback",
		"To the title page",
	])
		await expect(
			menu.getByRole("button", { name: new RegExp(`^${name}`) }),
		).toBeVisible();
	await expect(
		menu.getByRole("button", { name: /Restore|Import|New town/ }),
	).toHaveCount(0);
	const before = await page.evaluate(
		() => (window as unknown as { townNow: number }).townNow,
	);
	await page.clock.fastForward(30000);
	expect(
		await page.evaluate(
			() => (window as unknown as { townNow: number }).townNow,
		),
	).toBe(before);
	await page.keyboard.press("Escape");
	await expect(menu).not.toBeVisible();
});
