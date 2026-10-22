import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { expect, step, test } from "./clock-fixture";
import { closeSaves, openDownload, openSaves } from "./session-helpers";

test.use({
	viewport: { width: 360, height: 690 },
	hasTouch: true,
	isMobile: true,
});

test("a player can offer and complete a real hour and see Ada remember it", async ({
	page,
}, info) => {
	const started = Date.now();
	await page.goto("/");
	await page
		.getByRole("button", { name: /^(Enter|Return to) Alder Quay/ })
		.click();
	await expect(page.locator(".town-ready")).toBeVisible({ timeout: 60000 });
	await page.locator('[data-map-place="hall"]').tap();
	await page.getByRole("button", { name: /Walk to Flooded hall ·/ }).click();
	for (let i = 0; i < 7; i++) await step(page);
	await page.getByRole("button", { name: "Close place details" }).click();
	await page.locator('.neighbour-strip [data-person-id="ada"]').click();
	await page.getByRole("button", { name: /^Talk to / }).click();
	await page.locator('[data-affordance-id="open-section"]').click();
	await page.locator('[data-work-id="carry-meals"]').click();
	await page.locator('[data-deadline="1080"]').click();
	await page.getByRole("button", { name: /^Put it to /, exact: true }).click();
	await expect(page.locator(".latest-answer")).toBeInViewport();
	await expect(page.locator(".latest-answer")).toContainText(
		"Alright, I'll do it.",
	);
	await expect(page.locator(".state-words")).toHaveText(
		"Time holds while you talk",
	);
	await page
		.getByRole("button", { name: "Start the hour", exact: true })
		.click();
	for (let i = 0; i < 12; i++) {
		await step(page);
		if (await page.locator(".pledge-receipt").count()) break;
	}
	await expect(page.locator(".pledge-receipt")).toContainText("Ada remembers");
	await expect(page.locator(".pledge-receipt")).toContainText(
		"You kept your word about that hour.",
	);
	await expect(page.locator(".pledge-receipt")).toBeInViewport({ ratio: 1 });
	expect(Date.now() - started).toBeLessThan(120000);
	await page.screenshot({
		path: info.outputPath("help-acknowledged-phone.png"),
	});
	// Real browser export verifies the selected deadline survives the worker and persistence.
	await openSaves(page);
	await openDownload(page);
	await page
		.getByRole("button", { name: "Keep a copy of this run", exact: true })
		.click();
	const link = page.getByRole("link", { name: /Download save/ });
	await expect(link).toBeVisible();
	const pending = page.waitForEvent("download");
	await link.click();
	const path = await (await pending).path();
	if (!path) throw Error("Missing exported run");
	const packet = JSON.parse(gunzipSync(await readFile(path)).toString("utf8"));
	expect(packet.runtime.player.pledges[0]).toMatchObject({
		dueBy: 1080,
		status: "kept",
		hfReported: true,
	});
	await closeSaves(page);
});
