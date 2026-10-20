import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { expect, type Page, test } from "@playwright/test";
import { closeSaves, openSaves, showTab } from "./session-helpers";

async function enter(page: Page) {
	await page.goto("/");
	await page.getByRole("button", { name: "Enter town", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Play town", exact: true }),
	).toBeVisible({ timeout: 60000 });
}
async function exported(page: Page) {
	await openSaves(page);
	const link = page.getByRole("link", { name: /Download save/ });
	const previous = (await link.count())
		? await link.getAttribute("href")
		: null;
	await page
		.getByRole("button", { name: "Download this run", exact: true })
		.click();
	await expect
		.poll(() => link.getAttribute("href").catch(() => null))
		.not.toBe(previous);
	const pending = page.waitForEvent("download");
	await link.click();
	const path = await (await pending).path();
	if (!path) throw Error("Missing save download");
	const result = JSON.parse(gunzipSync(await readFile(path)).toString());
	await closeSaves(page);
	return result;
}
test("Next story runs actual rounds, stops paused and retains its exact completed checkpoint", async ({
	page,
}) => {
	await enter(page);
	const next = page.getByRole("button", { name: "Next story", exact: true });
	await expect(next).toBeVisible({ timeout: 3000 });
	const before = await exported(page);
	await next.click();
	await expect(page.locator(".advance-notice")).toContainText("A new story", {
		timeout: 60000,
	});
	await expect(
		page.getByRole("button", { name: "Play town", exact: true }),
	).toBeEnabled();
	const after = await exported(page);
	expect(after.rounds).toBeGreaterThan(before.rounds);
	expect(after.rounds - before.rounds).toBeLessThanOrEqual(672);
	expect(after.runtime.now - before.runtime.now).toBe(
		(after.rounds - before.rounds) * 15,
	);
	await showTab(page, "Stories");
	await expect(page.locator("article.event").first()).toBeVisible();
	await page
		.getByRole("button", { name: "Step: Advance one round", exact: true })
		.click();
	await expect(page.locator(".advance-notice")).toHaveCount(0);
	const afterStep = await exported(page);
	expect(afterStep.rounds).toBe(after.rounds + 1);
	await page.reload();
	await page.getByRole("button", { name: "Enter town", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Play town", exact: true }),
	).toBeEnabled();
	expect(await exported(page)).toEqual(afterStep);
});

test("advance can stop from Save, locks mutations and keeps completed actual time", async ({
	page,
}) => {
	await page.setViewportSize({ width: 320, height: 740 });
	await enter(page);
	await showTab(page, "Help");
	await page
		.getByRole("button", { name: "Next evening choice →", exact: true })
		.click();
	const stop = page.getByRole("button", {
		name: "Stop advancing",
		exact: true,
	});
	await expect(stop).toBeEnabled();
	await expect(
		page.getByRole("button", { name: "Step: Advance one round", exact: true }),
	).toBeDisabled();
	await expect(page.getByLabel("Playback speed")).toBeDisabled();
	await expect(page.getByRole("button", { name: /Lend tools/ })).toBeDisabled();
	await expect(page.locator(".advance-feedback")).toContainText(
		/of 672 rounds/,
		{ timeout: 30000 },
	);
	await showTab(page, "Compare");
	await expect(
		page.getByRole("button", { name: "Compare from here", exact: true }),
	).toBeDisabled();
	await openSaves(page);
	const dialog = page.getByRole("dialog", { name: "Game menu" });
	await expect(
		dialog.getByRole("button", { name: "Download this run", exact: true }),
	).toBeDisabled();
	await expect(
		dialog.getByRole("button", { name: "Import", exact: true }),
	).toBeDisabled();
	await expect(
		dialog.getByRole("button", { name: "Start town", exact: true }),
	).toBeDisabled();
	await dialog
		.getByRole("button", { name: "Stop advancing", exact: true })
		.click();
	await expect(
		dialog.getByRole("button", { name: "Download this run", exact: true }),
	).toBeEnabled();
	await closeSaves(page);
	await expect(page.locator(".advance-notice")).toContainText(
		"Completed time is kept",
	);
	await expect(
		page.getByRole("button", { name: "Play town", exact: true }),
	).toBeEnabled();
	const stopped = await exported(page);
	expect(stopped.rounds).toBeGreaterThan(0);
	expect(stopped.rounds).toBeLessThanOrEqual(672);
	expect(stopped.runtime.now).toBe(480 + stopped.rounds * 15);
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= innerWidth,
		),
	).toBe(true);
	await page.reload();
	await page.getByRole("button", { name: "Enter town", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Play town", exact: true }),
	).toBeEnabled();
	expect(await exported(page)).toEqual(stopped);
});
