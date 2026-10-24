import { expect, type Page } from "@playwright/test";

export async function openSaves(page: Page) {
	const feedback = page.getByRole("button", {
		name: "Close Feedback",
		exact: true,
	});
	if (await feedback.isVisible()) await feedback.click();
	const dialog = page.getByRole("dialog", { name: /^Game menu/ });
	if (!(await dialog.isVisible()))
		await page.getByRole("button", { name: "Game menu", exact: true }).click();
	await expect(dialog).toBeVisible();
}
export async function closeSaves(page: Page) {
	const feedback = page.getByRole("button", {
		name: "Close Feedback",
		exact: true,
	});
	if (await feedback.isVisible()) await feedback.click();
	const other = page.getByRole("button", {
		name: "Close Other ways in",
		exact: true,
	});
	if (await other.isVisible()) await other.click();
	const dialog = page.getByRole("dialog", { name: /^Game menu/ });
	if (await dialog.isVisible()) {
		await page.keyboard.press("Escape");
		await expect(dialog).not.toBeVisible();
	}
	const enter = page.getByRole("button", {
		name: /^(Enter|Return to) Alder Quay/,
	});
	if (await enter.isVisible()) {
		await enter.click();
		await expect(page.locator(".town-ready")).toBeVisible({ timeout: 120000 });
	}
}
export async function openDownload(page: Page) {
	if (
		await page
			.getByRole("button", { name: "Keep a copy of this run", exact: true })
			.isVisible()
	)
		return;
	await closeSaves(page);
	await openSaves(page);
	await page.getByRole("button", { name: /^Feedback/ }).click();
	await expect(
		page.getByRole("button", { name: "Keep a copy of this run", exact: true }),
	).toBeVisible();
}
export async function openOtherWays(page: Page) {
	if (await page.locator(".other-ways-in").isVisible()) return;
	const enter = page.getByRole("button", {
		name: /^(Enter|Return to) Alder Quay/,
	});
	if (!(await enter.isVisible())) {
		await closeSaves(page);
		await openSaves(page);
		await page
			.getByRole("button", { name: "To the title page", exact: true })
			.click();
	}
	await page.getByRole("button", { name: /^Other ways in/ }).click();
	await expect(page.locator(".other-ways-in")).toBeVisible();
}
export async function closeSelection(page: Page) {
	const back = page.getByRole("button", {
		name: "Back to person",
		exact: true,
	});
	if (await back.isVisible()) await back.click();
	for (const name of [
		"Close person details",
		"Close place details",
		"Close Compare futures",
		"Close Recorded studies",
		"Close Help the town",
		"Close Walk somewhere",
		"Close Journal",
	]) {
		const close = page.getByRole("button", { name, exact: true });
		if (await close.isVisible()) await close.click();
	}
}
export async function showTab(
	page: Page,
	name:
		| "Town"
		| "Journal"
		| "Stories"
		| "Help"
		| "Compare"
		| "Recorded studies",
) {
	await closeSaves(page);
	await closeSelection(page);
	if (name === "Town") return;
	if (name === "Compare" || name === "Recorded studies") {
		await openSaves(page);
		await page
			.getByRole("button", {
				name: name === "Compare" ? /^Compare futures/ : /^Recorded studies/,
			})
			.click();
	} else
		await page
			.getByRole("button", {
				name: name === "Help" ? "Help the town" : "Journal",
				exact: true,
			})
			.click();
}
export async function showResources(page: Page) {
	await showTab(page, "Compare");
	const resources = page.locator(".inspector-resources");
	if ((await resources.getAttribute("open")) === null)
		await resources.locator(":scope > summary").click();
}
