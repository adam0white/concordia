import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { expect, test } from "./local-fixture";

for (const width of [360, 1280]) {
	test(`a failed local copy is visible in Feedback and retry preserves the town at ${width}`, async ({
		page,
	}, info) => {
		await page.setViewportSize({ width, height: width === 360 ? 690 : 800 });
		await page.addInitScript(() => {
			localStorage.setItem("hf-lab-recording-off", "1");
			Object.assign(window, { failCopy: false });
			const NativeCompression = window.CompressionStream;
			window.CompressionStream = new Proxy(NativeCompression, {
				construct(target, args) {
					if ((window as unknown as { failCopy: boolean }).failCopy)
						throw new Error("Test compression failure");
					return Reflect.construct(target, args);
				},
			});
		});
		await page.goto("/?lab=1");
		await page.getByRole("button", { name: /^Other ways in/ }).click();
		await page.getByLabel("Start from a seed").fill("42");
		await page.getByRole("button", { name: "Start", exact: true }).click();
		await expect(page.locator(".town-ready")).toBeVisible({ timeout: 120000 });
		await page.getByRole("button", { name: "Game menu", exact: true }).click();
		await page.getByRole("button", { name: /^Feedback/ }).click();
		const copy = page.getByRole("button", {
			name: "Keep a copy of this run",
			exact: true,
		});
		const checkpoint = async (name: string) => {
			const ready = page.waitForEvent("download");
			await copy.click();
			const download = await ready;
			const file = info.outputPath(`${name}.json.gz`);
			await download.saveAs(file);
			return JSON.parse(gunzipSync(await readFile(file)).toString("utf8"));
		};
		const original = await checkpoint("original");
		const time = await page.locator(".town-time strong").textContent();
		await page.evaluate(() => Object.assign(window, { failCopy: true }));
		await copy.click();
		const alert = page.locator('.send-word [role="alert"]');
		await expect(alert).toContainText(
			"This save could not be compressed. The current town is unchanged.",
			{ timeout: 3000 },
		);
		await expect(alert.locator("p").first()).toBeInViewport({ ratio: 1 });
		await expect(page.locator(".town-time strong")).toHaveText(time ?? "");
		await expect(page.locator(".send-word .download-save")).toHaveCount(0);
		if (process.env.NEIGHBOURS_EVIDENCE)
			await page.screenshot({
				path: `${process.env.NEIGHBOURS_EVIDENCE}/${width}-feedback-copy-error.png`,
			});
		await page.evaluate(() => Object.assign(window, { failCopy: false }));
		expect(await checkpoint("retry")).toEqual(original);
		await expect(alert).toHaveCount(0);
		expect(
			await page.evaluate(
				() =>
					(document.scrollingElement?.scrollHeight ?? Infinity) <= innerHeight,
			),
		).toBe(true);
	});
}
