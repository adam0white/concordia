import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { captureBench } from "../scripts/capture-bench.ts";
import { expect, type Page, test } from "./clock-fixture";
import {
	closeSaves,
	openDownload,
	openOtherWays,
	openSaves,
	showTab,
} from "./session-helpers";

async function packet(page: Page) {
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
	const pending = page.waitForEvent("download");
	await link.click();
	const path = await (await pending).path();
	if (!path) throw Error("No save downloaded");
	const result = JSON.parse(gunzipSync(await readFile(path)).toString());
	await closeSaves(page);
	return result;
}
async function cart(page: Page) {
	await showTab(page, "Help");
	const projects = page.locator("details.project-history");
	if ((await projects.getAttribute("open")) === null)
		await projects.getByText("Projects and notices", { exact: true }).click();
	return page.getByRole("region", { name: "Bilal's handcart", exact: true });
}

test("a real mobile bench proposal is received without granting access, and active HF knowledge saves exactly", async ({
	page,
}) => {
	const frozen = captureBench(73).checkpoint;
	await page.setViewportSize({ width: 320, height: 740 });
	await page.goto("/?lab=1");
	await page
		.getByRole("button", { name: /^(Enter|Return to) Alder Quay/ })
		.click();
	await expect(page.locator(".town-ready")).toBeVisible({ timeout: 60000 });
	await openSaves(page);
	await openOtherWays(page);
	await page.getByLabel("Import town save").setInputFiles({
		name: "natural-bench.json",
		mimeType: "application/json",
		buffer: Buffer.from(JSON.stringify(frozen)),
	});
	let panel = await cart(page);
	await expect(
		panel.getByRole("button", {
			name: "Tell Rafi · 1 credit",
			exact: true,
		}),
	).toBeEnabled();
	const before = await packet(page);
	panel = await cart(page);
	await panel
		.getByRole("button", { name: "Compare first", exact: true })
		.click();
	await expect(
		page
			.locator(".day-comparison")
			.getByText("Resources and neighbour state at the end", { exact: true }),
	).toBeVisible({ timeout: 60000 });
	expect(await packet(page)).toEqual(before);
	panel = await cart(page);
	await panel
		.getByRole("button", {
			name: "Tell Rafi · 1 credit",
			exact: true,
		})
		.click();
	await expect(panel).toContainText("Rafi heard the proposed window");
	await expect(panel).toContainText("No bench booking");
	await expect(
		panel.getByRole("button", {
			name: "Tell Rafi · 1 credit",
			exact: true,
		}),
	).toHaveCount(0);
	const proposed = await packet(page);
	expect(proposed.runtime.controls).toBe(before.runtime.controls - 1);
	expect(proposed.runtime.handcart.bench).toBeUndefined();
	const ravi = proposed.runtime.people.find(
		(p: { person: { id: string } }) => p.person.id === "ravi",
	);
	expect(ravi.person.prospection.entries).toHaveLength(1);
	expect(ravi.person.prospection.entries[0].triggeredAt).toBeUndefined();
	expect(proposed.rounds).toBe(before.rounds);
	await page.reload();
	await page
		.getByRole("button", { name: /^(Enter|Return to) Alder Quay/ })
		.click();
	await expect(page.locator(".town-ready")).toBeVisible();
	expect(await packet(page)).toEqual(proposed);
	panel = await cart(page);
	await expect(panel).toContainText("No bench booking");
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= innerWidth,
		),
	).toBe(true);
});
