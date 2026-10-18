import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import { closeSaves, openSaves, showTab } from "./session-helpers";

/** Fresh public entry and actual WASM rounds; no imported or manufactured world. */
test("fresh mobile evening advance stops at a displayed action that can actually be used", async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	const errors: string[] = [];
	page.on("pageerror", (e) => errors.push(e.message));
	await page.goto("/");
	await page.getByRole("button", { name: "Enter town", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Play town", exact: true }),
	).toBeEnabled({ timeout: 60000 });
	const next = page.getByRole("button", { name: "Next story", exact: true });
	for (let i = 0; i < 3; i++) {
		const before = await page.locator(".town-time").innerText();
		await next.click();
		await expect
			.poll(() => page.locator(".town-time").innerText(), { timeout: 60000 })
			.not.toBe(before);
		await expect(next).toBeEnabled();
		await expect(page.locator(".advance-notice")).toContainText("A new story");
	}
	await showTab(page, "Help");
	const advance = page.getByRole("button", {
		name: "Next evening choice →",
		exact: true,
	});
	await expect(advance).toBeVisible();
	await advance.click();
	await expect(page.locator(".advance-notice")).toContainText(
		"choices are available",
		{ timeout: 60000 },
	);
	const choices = page.locator(".hall-choices");
	await expect(choices).toBeVisible();
	if ((await choices.getAttribute("open")) === null)
		await choices.locator(":scope > summary").click();
	await expect(choices).not.toContainText(
		"No evening support actions available now.",
	);
	const action = choices
		.getByRole("button", { name: /^Advertise .+ invitation ·/ })
		.first();
	await expect(action).toBeVisible();
	await expect(action).toBeEnabled();
	await action.click();
	await openSaves(page);
	await page.getByRole("button", { name: "Export", exact: true }).click();
	const link = page.getByRole("link", { name: /Download save/ });
	await expect(link).toBeVisible();
	const pending = page.waitForEvent("download");
	await link.click();
	const file = await (await pending).path();
	if (!file) throw Error("Missing actual save export");
	const packet = JSON.parse(gunzipSync(await readFile(file)).toString("utf8"));
	expect(packet.runtime.seed).toBe(42);
	expect(packet.runtime.people).toHaveLength(208);
	const events = packet.runtime.socialEvenings?.events ?? [];
	expect(
		events.some(
			(e: { advertisement?: { kind: string; source?: string } }) =>
				e.advertisement?.kind === "intervention" &&
				e.advertisement.source === "town-bulletin",
		),
	).toBe(true);
	await closeSaves(page);
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= innerWidth,
		),
	).toBe(true);
	expect(errors).toEqual([]);
});
