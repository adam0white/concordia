import { expect, type Page } from "@playwright/test";

export async function openSaves(page: Page) {
	const dialog = page.getByRole("dialog", { name: "Save and town options" });
	if (!(await dialog.isVisible()))
		await page
			.getByRole("button", { name: "Save and town options", exact: true })
			.click();
	await expect(dialog).toBeVisible();
}
export async function closeSaves(page: Page) {
	const dialog = page.getByRole("dialog", { name: "Save and town options" });
	if (await dialog.isVisible()) {
		await page.keyboard.press("Escape");
		await expect(dialog).not.toBeVisible();
	}
}
export async function showTab(
	page: Page,
	name: "Town" | "Help" | "Stories" | "Compare",
) {
	await closeSaves(page);
	await page.getByRole("tab", { name, exact: true }).click();
}
export async function showResources(page: Page) {
	await showTab(page, "Compare");
	const resources = page.locator(".inspector-resources");
	if ((await resources.getAttribute("open")) === null)
		await resources.locator(":scope > summary").click();
}
