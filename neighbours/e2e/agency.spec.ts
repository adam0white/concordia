import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { expect, type Page, test } from "@playwright/test";
import { captureWeekly } from "../scripts/capture-weekly.ts";
import { restoreRuntime } from "../src/core/index.ts";
import type { Save } from "../src/core/state.ts";

let genuine: ReturnType<typeof captureWeekly>["candidate"];
test.beforeAll(() => {
	const captured = captureWeekly().candidate;
	const host = restoreRuntime(captured.runtime);
	for (let i = 0; i < 3; i++) host.intervene({ kind: "lend-tools" });
	genuine = { ...captured, runtime: host.export() as Save };
});
async function exported(page: Page) {
	await page.getByRole("button", { name: "Export", exact: true }).click();
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
	await page.getByRole("button", { name: "Pause town", exact: true }).click();
	await page.getByLabel("Import town save").setInputFiles({
		name: "genuine-week.json",
		mimeType: "application/json",
		buffer: Buffer.from(JSON.stringify(genuine)),
	});
	const choices = page.locator(".hall-choices");
	await expect(choices).toBeVisible();
	await choices.locator(":scope > summary").click();
	const before = await exported(page);
	expect(before.runtime.controls).toBe(0);
	await page.getByRole("button", { name: /Compare a week with Lea/ }).click();
	const comparison = page.locator(".day-comparison");
	await expect(comparison).toHaveAttribute("open", "");
	await expect(comparison).toContainText("Extra slot for Lea");
	await expect(comparison).toContainText("7 simulated days");
	await expect(
		comparison.getByLabel("Change in the second run"),
	).not.toBeVisible();
	await expect(comparison.getByRole("status")).toContainText(/of 672 rounds/);
	await comparison
		.getByRole("button", { name: "Cancel comparison", exact: true })
		.click();
	await expect(comparison.getByRole("alert")).toContainText(
		"Comparison cancelled",
	);
	expect(await exported(page)).toEqual(before);
	await page.getByRole("button", { name: /Fund another slot for Lea/ }).click();
	await expect(
		page.getByRole("status").filter({ hasText: "Extra hall slot funded" }),
	).toBeVisible();
	const after = await exported(page);
	expect(after.runtime.controls).toBe(before.runtime.controls);
	expect(
		after.runtime.socialEvenings.recurrence.cycles[0].supportSpent.kind,
	).toBe("open-evening-slot");
	expect(after.runtime.people).toEqual(before.runtime.people);
	expect(
		after.runtime.socialEvenings.recurrence.cycles[0].openedSlot.to -
			after.runtime.socialEvenings.recurrence.cycles[0].openedSlot.from,
	).toBe(1440);
	await page.reload();
	await expect(
		page.getByRole("button", { name: "Play town", exact: true }),
	).toBeVisible();
	expect(await exported(page)).toEqual(after);
});
