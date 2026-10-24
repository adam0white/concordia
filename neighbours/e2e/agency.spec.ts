import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { captureWeekly } from "../scripts/capture-weekly.ts";
import { expect, type Page, test } from "./clock-fixture";
import {
	openDownload,
	openOtherWays,
	openSaves,
	showTab,
} from "./session-helpers";

let genuine: ReturnType<typeof captureWeekly>["candidate"];
test.beforeAll(() => {
	genuine = captureWeekly(true).candidate;
});
async function exported(page: Page) {
	await openSaves(page);
	const link = page.getByRole("link", { name: /Download save/ });
	const previous = (await link.count())
		? await link.getAttribute("href")
		: null;
	await openDownload(page);
	await page
		.getByRole("button", { name: "Keep a copy of this run", exact: true })
		.click();
	await expect
		.poll(() => link.getAttribute("href").catch(() => null))
		.not.toBe(previous);
	const download = page.waitForEvent("download");
	await page.getByRole("link", { name: /Download save/ }).click();
	const path = await (await download).path();
	if (!path) throw Error("No downloaded save");
	return JSON.parse(gunzipSync(await readFile(path)).toString());
}
test("a contextual week shows its actual request, cancels safely and retains a real funded slot", async ({
	page,
}) => {
	await page.goto("/");
	await page
		.getByRole("button", { name: /^(Enter|Return to) Alder Quay/ })
		.click();
	await expect(page.locator(".town-ready")).toBeVisible();
	await openSaves(page);
	await openOtherWays(page);
	await page.getByLabel("Import town save").setInputFiles({
		name: "genuine-week.json",
		mimeType: "application/json",
		buffer: Buffer.from(JSON.stringify(genuine)),
	});
	await showTab(page, "Help");
	const choices = page.locator(".hall-choices");
	await expect(choices).toBeVisible();
	if ((await choices.getAttribute("open")) === null)
		await choices.locator(":scope > summary").click();
	const before = await exported(page);
	expect(before.runtime.controls).toBe(0);
	await showTab(page, "Help");
	await page.getByRole("button", { name: /Compare a week with Nora/ }).click();
	const comparison = page.locator(".day-comparison");
	await expect(comparison).toHaveAttribute("open", "");
	await expect(comparison).toContainText("Extra slot for Nora");
	await expect(comparison.getByRole("status")).toContainText(/of 672 rounds/);
	await expect(
		comparison.getByLabel("Change in the second run"),
	).not.toBeVisible();
	await comparison
		.getByRole("button", { name: "Cancel comparison", exact: true })
		.click();
	await expect(comparison.getByRole("alert")).toContainText(
		"Comparison cancelled",
	);
	expect(await exported(page)).toEqual(before);
	await showTab(page, "Help");
	await expect(choices).toHaveAttribute("open", "");
	await page
		.getByRole("button", { name: /Fund another slot for Nora/ })
		.click();
	await expect(
		page.getByRole("status").filter({ hasText: "Extra hall slot funded" }),
	).toBeVisible();
	const after = await exported(page);
	expect(after.runtime.controls).toBe(before.runtime.controls);
	const funded = after.runtime.socialEvenings.recurrence.cycles.filter(
		(c: { supportSpent?: { kind: string } }) =>
			c.supportSpent?.kind === "open-evening-slot",
	);
	expect(funded).toHaveLength(1);
	expect(after.runtime.people).toEqual(before.runtime.people);
	expect(funded[0].openedSlot.to - funded[0].openedSlot.from).toBe(1440);

	await page.reload();
	await page
		.getByRole("button", { name: /^(Enter|Return to) Alder Quay/ })
		.click();
	await expect(page.locator(".town-ready")).toBeVisible();
	expect(await exported(page)).toEqual(after);
});
