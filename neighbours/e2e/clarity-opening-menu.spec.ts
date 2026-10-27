import { expect, test } from "./clock-fixture";
import { enterLocalTown } from "./local-fixture";
import { openSaves } from "./session-helpers";

test("entry stays visible and one menu holds the town", async ({ page }) => {
	await page.setViewportSize({ width: 360, height: 690 });
	await page.goto("/");
	const enter = page.getByRole("button", {
		name: "Enter Mill Bridge",
		exact: true,
	});
	await expect(enter).toBeInViewport({ ratio: 1 });
	await expect(
		page.getByRole("button", { name: "Information", exact: true }),
	).toHaveCount(1);
	await expect(
		page.getByRole("button", { name: "Game menu", exact: true }),
	).toHaveCount(1);
	await enterLocalTown(page);
	await expect(page.locator(".town-ready")).toBeVisible({ timeout: 120000 });
	await openSaves(page);
	const menu = page.getByRole("dialog", { name: /^Game menu/ });
	for (const name of [
		"Read the journal",
		"Switch light or dark colours",
		"Compare possible outcomes",
		"Recorded studies",
		"Feedback",
	])
		await expect(
			menu.getByRole("button", { name: new RegExp(`^${name}`) }),
		).toBeVisible();
	await expect(
		menu.getByRole("button", { name: /Restore|Import|New town/ }),
	).not.toBeVisible();
	await expect(menu.locator(".menu-debug")).not.toHaveAttribute("open", "");
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
