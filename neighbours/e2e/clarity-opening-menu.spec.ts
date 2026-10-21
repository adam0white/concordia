import { expect, test } from "./clock-fixture";

test("entry precedes optional introduction and one Game menu owns run controls", async ({
	page,
}) => {
	await page.setViewportSize({ width: 360, height: 690 });
	await page.goto("/");
	const enter = page.getByRole("button", { name: "Enter town", exact: true });
	await expect(enter).toBeInViewport();
	const opening =
		(await page.locator(".welcome-screen").innerText())
			.split("Enter town")[0]
			?.trim()
			.split(/\s+/).length ?? 0;
	expect(opening).toBeLessThanOrEqual(40);
	await expect(page.locator(".welcome-steps")).not.toBeVisible();
	await page
		.getByRole("button", { name: "About Alder Quay", exact: true })
		.click();
	await expect(page.locator(".welcome-steps")).toBeVisible();
	await page.keyboard.press("Escape");
	await enter.click();
	await expect(
		page.getByRole("button", { name: "Game menu", exact: true }),
	).toBeVisible();
	const menu = page.getByRole("button", { name: "Game menu", exact: true });
	await expect(menu).toHaveCount(1);
	await expect(menu).toBeInViewport();
	const box = await menu.boundingBox();
	expect(box?.height).toBeGreaterThanOrEqual(44);
	await menu.click();
	const dialog = page.getByRole("dialog", { name: "Game menu", exact: true });
	await expect(dialog).toBeVisible();
	for (const name of [
		"Download this run",
		"Import",
		"Send this run to the notebook",
	]) {
		await expect(
			dialog.getByRole("button", { name, exact: true }),
		).toBeVisible();
	}
	await dialog.getByText("Playtest privacy", { exact: true }).click();
	await expect(
		dialog.getByLabel("Anonymous play events", { exact: true }),
	).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(dialog).not.toBeVisible();
	await expect(menu).toBeFocused();
	const selected = page.getByRole("tab", { name: "Town", exact: true });
	const colours = await selected.evaluate((element) => ({
		border: getComputedStyle(element).borderBottomColor,
		ink: getComputedStyle(element).color,
	}));
	expect(colours.border).toBe(colours.ink);
	await page.setViewportSize({ width: 1280, height: 800 });
	await expect(page.locator(".town-help")).toHaveCSS("color", colours.ink);
	await expect(page.locator(".town-help")).toHaveCSS(
		"text-decoration-color",
		colours.ink,
	);
});
