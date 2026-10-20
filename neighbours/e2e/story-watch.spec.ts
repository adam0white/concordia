import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import { closeSaves, openSaves, showTab } from "./session-helpers";

test.use({ hasTouch: true });

test("actual town offers optional story stops and keyboard/mobile access to retained older stories", async ({
	page,
}, info) => {
	// Repeated stories collapse into one, so the seventh distinct story takes longer to arrive.
	test.setTimeout(360_000);
	await page.goto("/");
	await page.getByRole("button", { name: "Enter town", exact: true }).click();
	const play = page.getByRole("button", { name: "Play town", exact: true });
	const pause = page.getByRole("button", { name: "Pause town", exact: true });
	await expect(play).toBeVisible();
	const speed = page.getByRole("combobox", { name: "Playback speed" });
	await speed.selectOption("120");
	const headline = page.locator(".story-headline");
	const watch = page.getByRole("checkbox", { name: "Pause on new stories" });
	const stopped = page
		.getByRole("status")
		.filter({ hasText: "Paused for a new story" });
	if (!(await headline.count())) {
		await expect(watch).not.toBeVisible();
		await play.click();
		await expect(headline).toBeVisible();
		await expect(stopped).toBeVisible();
	}
	await openSaves(page);
	await expect(watch).toBeChecked();
	await closeSaves(page);
	await page.getByRole("button", { name: "Step: Advance one round" }).click();
	await expect(stopped).toHaveCount(0);
	await play.click();
	await expect(stopped).toBeVisible({ timeout: 60_000 });
	await expect(play).toBeVisible();
	await expect(speed).toHaveValue("120");
	await page.screenshot({ path: info.outputPath("story-stop-desktop.png") });
	const held = await headline.innerText();
	await page.waitForTimeout(400);
	expect(await headline.innerText()).toBe(held);
	await expect(play).toBeVisible();
	// Exact same-world import must clear the old stop reason and stay ordinary paused.
	await openSaves(page);
	await page
		.getByRole("button", { name: "Download this run", exact: true })
		.click();
	const download = page.waitForEvent("download");
	await page.getByRole("link", { name: /Download save/ }).click();
	const path = info.outputPath("story-stop.json.gz");
	await (await download).saveAs(path);
	const saved = gunzipSync(await readFile(path));
	await openSaves(page);
	await page.getByLabel("Import town save").setInputFiles({
		name: "same-town.json",
		mimeType: "application/json",
		buffer: saved,
	});
	await closeSaves(page);
	await expect(stopped).toHaveCount(0);
	await expect(play).toBeVisible();
	await openSaves(page);
	await watch.uncheck();
	await showTab(page, "Stories");
	const firstStory = page.locator("article.event").first();
	const heldStory = await firstStory.innerText();
	await play.click();
	// Continuous mode remains running while new stories arrive and the archive grows.
	await expect
		.poll(() => firstStory.innerText(), {
			timeout: 60_000,
		})
		.not.toBe(heldStory);
	await expect(pause).toBeVisible();
	await expect(stopped).toHaveCount(0);
	const archive = page.locator(".story-archive");
	await expect(archive).toBeVisible({ timeout: 240_000 });
	await pause.click();
	await expect(archive).not.toHaveAttribute("open");
	const summary = archive.locator(":scope > summary");
	await summary.focus();
	await page.keyboard.press("Enter");
	await expect(archive).toHaveAttribute("open", "");
	await expect(archive.locator("article .eyebrow").last()).toContainText(
		"Day ",
	);
	const firstFollow = archive.getByRole("button", { name: /Follow / }).first();
	await firstFollow.focus();
	await page.keyboard.press("Enter");
	await expect(page.locator(".person-panel")).toBeVisible();
	await expect(page.locator(".person-panel h2")).toBeFocused();
	const closeDetails = page
		.getByRole("button", { name: /Close person details|Back to town/ })
		.filter({ visible: true })
		.first();
	await expect(closeDetails).toBeInViewport();
	expect((await closeDetails.boundingBox())?.y).toBeGreaterThanOrEqual(0);
	await page.setViewportSize({ width: 390, height: 844 });
	await closeDetails.click();
	await showTab(page, "Stories");
	await summary.tap();
	await expect(archive).toHaveAttribute("open", "");
	await expect(archive.locator("article").last()).toBeVisible();
	await firstFollow.tap();
	await expect(page.locator(".person-panel h2")).toBeFocused();
	await expect(closeDetails).toBeInViewport();
	expect((await closeDetails.boundingBox())?.y).toBeGreaterThanOrEqual(0);
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= innerWidth,
		),
	).toBe(true);
	await page.screenshot({
		path: info.outputPath("older-stories-mobile.png"),
		fullPage: true,
	});
	await page.reload();
	await page.getByRole("button", { name: "Enter town", exact: true }).click();
	await expect(play).toBeVisible();
	await openSaves(page);
	await expect(watch).toBeChecked();
	await closeSaves(page);
	await expect(stopped).toHaveCount(0);
});
