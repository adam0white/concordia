import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import { closeSaves, openSaves } from "./session-helpers";

test.use({
	viewport: { width: 360, height: 690 },
	hasTouch: true,
	isMobile: true,
});

test("loading conversation retains its person and restores the chosen playback rate after closing", async ({
	page,
}) => {
	await page.addInitScript(() => {
		const held: (() => void)[] = [];
		Object.assign(window, { heldSpeech: held });
		const NativeWorker = window.Worker;
		window.Worker = class extends NativeWorker {
			constructor(url: string | URL, options?: WorkerOptions) {
				super(url, options);
				this.addEventListener("message", (event: MessageEvent) => {
					if (event.data.type !== "speech-predictions") return;
					event.stopImmediatePropagation();
					held.push(() => this.onmessage?.call(this, event));
				});
			}
		};
	});
	await page.goto("/");
	await page.getByRole("button", { name: "Enter town", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Play town", exact: true }),
	).toBeEnabled({ timeout: 60000 });
	await openSaves(page);
	await page.getByRole("checkbox", { name: "Pause on new stories" }).uncheck();
	await closeSaves(page);
	await page.locator('.neighbour-strip [data-person-id="ravi"]').click();
	await page.getByRole("button", { name: /Walk to Workshop to talk/ }).click();
	for (let i = 0; i < 4; i++)
		await page
			.getByRole("button", { name: "Step: Advance one round", exact: true })
			.click();
	const talk = page.locator(".resident-talk > summary");
	await expect(talk).toHaveText("Talk to Ravi");
	await talk.click();
	if (
		await page
			.locator(
				".resident-talk[open] .conversation-request:not([open]) > summary",
			)
			.count()
	)
		await page.locator(".conversation-request > summary").click();
	await expect(page.getByLabel("Ask them to")).toBeDisabled();
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					(window as unknown as { heldSpeech: unknown[] }).heldSpeech.length,
			),
		)
		.toBeGreaterThan(0);
	await page
		.getByRole("combobox", { name: "Playback speed" })
		.selectOption("120");
	await page.getByRole("button", { name: "Play town", exact: true }).click();
	const rate = page.locator(".clock-rate");
	await expect(rate).toHaveText("Slow · 1 min/s · conversation");
	// Manual rounds remain explicit simulation steps: force departure while a
	// genuine worker prediction is held rather than waiting for a wall-clock race.
	await page.getByRole("button", { name: "Pause town", exact: true }).click();
	for (let i = 0; i < 12; i++)
		await page
			.getByRole("button", { name: "Step: Advance one round", exact: true })
			.click();
	await expect(talk).toHaveText("Talk to Ravi");
	await expect(page.locator(".resident-talk")).toHaveAttribute("open", "");
	await expect(page.locator(".person-panel h2")).toHaveText("Ravi");
	await page.evaluate(() => {
		for (const release of (
			window as unknown as { heldSpeech: (() => void)[] }
		).heldSpeech.splice(0))
			release();
	});
	await expect(page.locator(".person-panel h2")).toHaveText("Ravi");
	await talk.click();
	if (
		await page
			.locator(
				".resident-talk[open] .conversation-request:not([open]) > summary",
			)
			.count()
	)
		await page.locator(".conversation-request > summary").click();
	await page.getByRole("button", { name: "Play town", exact: true }).click();
	await expect(rate).toHaveText("10× · 125 min/s");
	await expect(
		page.getByRole("combobox", { name: "Playback speed" }),
	).toHaveValue("120");
});

test("continuous playback slows while a conversation waits and resumes its chosen rate", async ({
	page,
}) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Enter town", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Play town", exact: true }),
	).toBeEnabled({ timeout: 60000 });
	await openSaves(page);
	await page.getByRole("checkbox", { name: "Pause on new stories" }).uncheck();
	await closeSaves(page);
	await page.locator('.neighbour-strip [data-person-id="ravi"]').click();
	await page.getByRole("button", { name: /Walk to Workshop to talk/ }).click();
	for (let i = 0; i < 4; i++)
		await page
			.getByRole("button", { name: "Step: Advance one round", exact: true })
			.click();
	await page.locator(".resident-talk > summary").click();
	if (
		await page
			.locator(
				".resident-talk[open] .conversation-request:not([open]) > summary",
			)
			.count()
	)
		await page.locator(".conversation-request > summary").click();
	await page.getByLabel("Ask them to").selectOption("repair");
	await page
		.getByRole("combobox", { name: "Playback speed" })
		.selectOption("120");
	await page.getByRole("button", { name: "Play town", exact: true }).click();
	await expect(page.locator(".clock-rate")).toHaveText(
		"Slow · 1 min/s · conversation",
	);
	await expect(page.locator(".town-time strong")).toHaveText("09:00");
	await page.waitForTimeout(2100);
	await expect(page.locator(".town-time strong")).toHaveText("09:00");
	await expect(page.locator(".town-time strong")).toHaveText("09:15", {
		timeout: 20000,
	});
	await page.locator(".resident-talk > summary").click();
	if (
		await page
			.locator(
				".resident-talk[open] .conversation-request:not([open]) > summary",
			)
			.count()
	)
		await page.locator(".conversation-request > summary").click();
	await expect(page.locator(".clock-rate")).toHaveText("10× · 125 min/s");
	await expect(page.locator(".town-time strong")).not.toHaveText("09:15");
});

test("successful import resets the prior town's open conversation and choices", async ({
	page,
}) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Enter town", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Play town", exact: true }),
	).toBeEnabled({ timeout: 60000 });
	await page.locator('.neighbour-strip [data-person-id="ravi"]').click();
	await page.getByRole("button", { name: /Walk to Workshop to talk/ }).click();
	for (let i = 0; i < 4; i++)
		await page
			.getByRole("button", { name: "Step: Advance one round", exact: true })
			.click();
	await page.locator(".resident-talk > summary").click();
	if (
		await page
			.locator(
				".resident-talk[open] .conversation-request:not([open]) > summary",
			)
			.count()
	)
		await page.locator(".conversation-request > summary").click();
	await page.getByLabel("Your hour").selectOption("help-repair");
	await openSaves(page);
	await page
		.getByRole("button", { name: "Download this run", exact: true })
		.click();
	const link = page.getByRole("link", { name: /Download save/ });
	await expect(link).toBeVisible();
	const pending = page.waitForEvent("download");
	await link.click();
	const path = await (await pending).path();
	if (!path) throw Error("Missing exported save");
	const packet = gunzipSync(await readFile(path));
	await page.getByLabel("Import town save").setInputFiles({
		name: "same-town.json",
		mimeType: "application/json",
		buffer: packet,
	});
	await expect(link).toHaveCount(0);
	await closeSaves(page);
	await expect(page.locator(".resident-talk")).not.toHaveAttribute("open", "");
	await page.locator(".resident-talk > summary").click();
	if (
		await page
			.locator(
				".resident-talk[open] .conversation-request:not([open]) > summary",
			)
			.count()
	)
		await page.locator(".conversation-request > summary").click();
	await expect(page.getByLabel("Your hour")).toHaveValue("");
	await expect(page.locator(".clock-rate")).toHaveText(
		"Slow · 1 min/s · conversation",
	);
});
