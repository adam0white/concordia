import { expect, test } from "@playwright/test";
import { showTab } from "./session-helpers";

test("a cancelled second comparison keeps the first report selectable and byte-identical", async ({
	page,
}) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Enter town", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Play town", exact: true }),
	).toBeVisible({ timeout: 60000 });
	await showTab(page, "Compare");
	const panel = page.locator(".day-comparison");
	await panel
		.getByRole("button", { name: "Compare from here", exact: true })
		.click();
	const original = panel.getByRole("link", {
		name: "Download full comparison",
		exact: true,
	});
	await expect(
		panel.getByText("Checkpoint & limits", { exact: true }),
	).toBeVisible({ timeout: 60000 });
	await panel.getByText("Checkpoint & limits", { exact: true }).click();
	await expect(original).toBeVisible();
	const href = await original.getAttribute("href");
	const retry = panel.getByText("Try another comparison", { exact: true });
	if ((await retry.locator("..").getAttribute("open")) === null)
		await retry.click();
	await panel
		.getByLabel("Change in the second run")
		.selectOption("restore-bus");
	await panel.getByLabel("Simulated time").selectOption("672");
	await panel
		.getByRole("button", { name: "Compare from here", exact: true })
		.click();
	await panel
		.getByRole("button", { name: "Cancel comparison", exact: true })
		.click();
	await expect(panel.getByRole("alert")).toContainText("cancelled");
	const history = page.getByRole("combobox", { name: /^Recent comparisons/ });
	await expect(history).toBeVisible({ timeout: 3000 });
	await expect(history).toHaveValue("");
	const value = await history
		.locator('option:not([value=""])')
		.first()
		.getAttribute("value");
	if (!value) throw Error("Previous comparison missing");
	await history.selectOption(value);
	const limits = panel.getByText("Checkpoint & limits", { exact: true });
	if ((await limits.locator("..").getAttribute("open")) === null)
		await limits.click();
	await expect(original).toBeVisible();
	await expect(original).toHaveAttribute("href", href ?? "");
	await expect(panel.getByRole("alert")).toHaveCount(0);
});
