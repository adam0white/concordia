import { expect, test } from "./clock-fixture";
import { openSaves } from "./session-helpers";

test("notebook preview contains the actual town and cancel sends no run", async ({
	page,
}) => {
	let runs = 0;
	await page.route("https://human.adamwhite.work/**", async (route) => {
		if (route.request().url().endsWith("/run")) runs++;
		await route.fulfill({ status: 200, body: "{}" });
	});
	await page.goto("/");
	await page.getByText("Playtest privacy", { exact: true }).click();
	await page.getByLabel("Record play for the lab", { exact: true }).uncheck();
	await page.getByRole("button", { name: "Enter town", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Game menu", exact: true }),
	).toBeVisible();
	await openSaves(page);
	await page
		.getByRole("button", { name: "Send this run to the notebook", exact: true })
		.click();
	const dialog = page.getByRole("dialog", {
		name: "Send this run to the notebook",
		exact: true,
	});
	await expect(dialog).toBeVisible();
	await dialog.getByText(/Run and note payload/).click();
	const preview = dialog.getByLabel("Full payload JSON, formatted for reading");
	const text = await preview.inputValue();
	const packet = JSON.parse(text);
	expect(packet.game).toBe("neighbours");
	expect(packet.run).toBeDefined();
	expect(packet.run.runtime.people).toHaveLength(208);
	await dialog.getByRole("button", { name: "Not now", exact: true }).click();
	await expect(dialog).toHaveCount(0);
	expect(runs).toBe(0);
	await openSaves(page);
	await page.getByText("Playtest privacy", { exact: true }).click();
	await expect(
		page.getByLabel("Record play for the lab", { exact: true }),
	).not.toBeChecked();
});
