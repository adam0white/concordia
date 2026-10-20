import { expect, test } from "@playwright/test";

test("resident sheet keeps the player's verb, location and walking action visible while scrolling", async ({
	page,
}) => {
	await page.setViewportSize({ width: 360, height: 690 });
	await page.goto(process.env.NEIGHBOURS_TEST_BASE ?? "/");
	await page.getByRole("button", { name: /^(Enter town|Continue)/ }).click();
	await expect(
		page.getByRole("button", { name: "Play town", exact: true }),
	).toBeVisible({ timeout: 60000 });
	await page.locator(".neighbour-strip [data-person-id]").first().click();
	const action = page.locator(".person-panel > .player-action");
	await expect(action).toBeInViewport();
	await expect(action).toContainText("Choose a place to walk");
	await expect(action).toContainText("You are at Riverside homes");
	const drawer = page.locator(".drawer-person");
	await drawer.evaluate((element) => {
		element.scrollTop = element.scrollHeight;
	});
	await expect(action).toBeInViewport();
	const actionBox = await action.boundingBox();
	const drawerBox = await drawer.boundingBox();
	const dockBox = await page.locator(".dock").boundingBox();
	expect(actionBox?.width ?? 0).toBeGreaterThanOrEqual(
		(drawerBox?.width ?? 0) - 40,
	);
	expect((actionBox?.y ?? 0) + (actionBox?.height ?? 0)).toBeLessThanOrEqual(
		dockBox?.y ?? 0,
	);
	const walk = action.getByText("Walk somewhere", { exact: true });
	await expect(walk).toBeInViewport();
	await walk.click();
	const destination = action.getByRole("button", { name: /Market kitchen/ });
	await expect(destination).toBeInViewport();
	await destination.click();
	await expect(action).toContainText("Walking to Market kitchen");
});
