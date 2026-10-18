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
/**
 * Open one drawer. The town has three drawer tabs (Town, Journal, More); Help
 * and Compare are tabs inside More, and "Stories" is the Journal.
 */
export async function showTab(
	page: Page,
	name: "Town" | "Journal" | "Stories" | "Help" | "Compare",
) {
	await closeSaves(page);
	const views = page.getByRole("tablist", { name: "Town views" });
	if (name === "Town" || name === "Journal" || name === "Stories") {
		await views
			.getByRole("tab", {
				name: name === "Town" ? "Town" : "Journal",
				exact: true,
			})
			.click();
		return;
	}
	const more = views.getByRole("tab", { name: "More", exact: true });
	if ((await more.getAttribute("aria-selected")) !== "true") await more.click();
	await page
		.getByRole("tablist", { name: "More" })
		.getByRole("tab", { name, exact: true })
		.click();
}
export async function showResources(page: Page) {
	await showTab(page, "Compare");
	const resources = page.locator(".inspector-resources");
	if ((await resources.getAttribute("open")) === null)
		await resources.locator(":scope > summary").click();
}
