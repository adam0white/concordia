import { expect, test } from "./clock-fixture";
import { openDownload } from "./session-helpers";

test("feedback preview names the current town and closing sends no note", async ({
	page,
}) => {
	let notes = 0;
	await page.route("https://human.adamwhite.work/**", async (route) => {
		if (/\/(run|feedback)$/.test(route.request().url())) notes++;
		await route.fulfill({ status: 200, body: "{}" });
	});
	await page.goto("/");
	await page
		.getByRole("button", { name: /^(Enter|Return to) Alder Quay/ })
		.click();
	await expect(page.locator(".town-ready")).toBeVisible({ timeout: 120000 });
	await openDownload(page);
	await page.getByText("What is sent", { exact: true }).click();
	await expect(page.locator(".feedback-preview")).toContainText(
		"day 1 · seed 42",
	);
	await page
		.getByRole("button", { name: "Close Send word", exact: true })
		.click();
	expect(notes).toBe(0);
});
