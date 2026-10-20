import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import { closeSaves, openSaves } from "./session-helpers";

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
	await page.getByRole("button", { name: "Enter town", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Play town", exact: true }),
	).toBeEnabled({ timeout: 60000 });
	await page.locator('[data-map-place="hall"]').tap();
	await page.getByRole("button", { name: /Walk to Flooded hall ·/ }).click();
	for (let i = 0; i < 7; i++)
		await page
			.getByRole("button", { name: "Step: Advance one round", exact: true })
			.click();
	await page.getByRole("button", { name: "Close place details" }).click();
	await page.locator('.neighbour-strip [data-person-id="ada"]').click();
	await page.locator(".resident-talk > summary").click();
	await page.getByLabel("Ask them to").selectOption("open-section");
	await page.getByLabel("Your hour").selectOption("carry-meals");
	await page.getByLabel("Done by").selectOption("1080");
	await page
		.getByRole("button", { name: "Promise an hour", exact: true })
		.click();
	await expect(page.locator(".latest-answer")).toBeInViewport();
	await expect(page.locator(".latest-answer")).toContainText(
		"Alright, I'll do it.",
	);
	await expect(page.locator(".clock-rate")).toHaveText("1× · 12.5 min/s");
	// Editing another choice in the same resolved conversation rearms reading time.
	await page.getByLabel("Your hour").focus();
	await expect(page.locator(".clock-rate")).toHaveText(
		"Slow · 1 min/s · conversation",
	);
	await page
		.getByRole("button", { name: "Step: Advance one round", exact: true })
		.click();
	await page
		.getByRole("button", { name: "Start the hour", exact: true })
		.click();
	for (let i = 0; i < 12; i++) {
		await page
			.getByRole("button", { name: "Step: Advance one round", exact: true })
			.click();
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
	await page
		.getByRole("button", { name: "Download this run", exact: true })
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
