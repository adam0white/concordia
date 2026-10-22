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

const genuine = captureWeekly().candidate;
async function exported(page: Page) {
	await openSaves(page);
	const link = page.getByRole("link", { name: /Download save/ });
	const previous = (await link.count())
		? await link.getAttribute("href")
		: null;
	await openSaves(page);
	await openDownload(page);
	await page
		.getByRole("button", { name: "Keep a copy of this run", exact: true })
		.click();
	await expect
		.poll(async () => {
			const next = await link.getAttribute("href").catch(() => null);
			return !!next && next !== previous;
		})
		.toBe(true);
	const pending = page.waitForEvent("download");
	await link.click();
	const path = await (await pending).path();
	if (!path) throw Error("No save download");
	return JSON.parse(gunzipSync(await readFile(path)).toString());
}
test("a real WASM annex request comparison preserves the live town and the request survives paused reload", async ({
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
		name: "genuine-town.json",
		mimeType: "application/json",
		buffer: Buffer.from(JSON.stringify(genuine)),
	});
	await showTab(page, "Help");
	const card = page.locator(".inspection-situation");
	const configure = async () => {
		if ((await card.getAttribute("open")) === null)
			await card.locator(":scope > summary").click();
		const source = card.getByText("Why · the record ▸", { exact: true });
		if ((await source.locator("..").getAttribute("open")) === null)
			await source.click();
		await card
			.getByLabel("Situation", { exact: true })
			.selectOption("dry-sound");
		await card
			.getByLabel("Ask a neighbour", { exact: true })
			.selectOption("ada");
	};
	await configure();
	const before = await exported(page);
	await showTab(page, "Help");
	await configure();
	await card
		.getByRole("button", {
			name: "Compare a day with this request",
			exact: false,
		})
		.click();
	const comparison = page.locator(".day-comparison");
	await expect(comparison).toContainText("Annex inspection requested from Ada");
	await expect(
		comparison.getByText("Resources and neighbour state at the end", {
			exact: true,
		}),
	).toBeVisible({
		timeout: 60000,
	});
	await comparison
		.getByText("Resources and neighbour state at the end", { exact: true })
		.click();
	await expect(comparison.getByRole("table")).toBeVisible();
	await expect(
		comparison.getByRole("row", { name: /Annex requests sent/ }),
	).toContainText("+1");
	expect(await exported(page)).toEqual(before);
	await showTab(page, "Help");
	await configure();
	await card
		.getByRole("button", { name: "Ask Ada to inspect", exact: true })
		.click();
	await expect(
		page.getByRole("status").filter({ hasText: "Inspection request received" }),
	).toBeVisible();
	const after = await exported(page);
	expect(after.runtime.controls).toBe(before.runtime.controls);
	expect(after.runtime.assistance.received).toBe(true);
	await page.reload();
	await page
		.getByRole("button", { name: /^(Enter|Return to) Alder Quay/ })
		.click();
	await expect(page.locator(".town-ready")).toBeVisible();
	expect(await exported(page)).toEqual(after);
});
