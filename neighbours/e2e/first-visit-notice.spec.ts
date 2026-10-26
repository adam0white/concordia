import { expect, test } from "./local-fixture";

for (const width of [360, 1280]) {
	test(`compact footer notice stays readable without hiding entry at ${width}`, async ({
		page,
	}) => {
		await page.setViewportSize({ width, height: width === 360 ? 690 : 800 });
		await page.addInitScript(() =>
			localStorage.setItem("hf-lab-recording-off", "1"),
		);
		await page.goto("/?lab=1");
		const notice = page.locator(".lk-telemetry-notice");
		await expect(notice).toHaveText(
			"We record and link play across games on this device.",
		);
		await expect(notice).toBeInViewport({ ratio: 1 });
		expect(
			await notice.evaluate((e) => e.getBoundingClientRect().height),
		).toBeLessThan(100);
		await expect(notice.getByRole("button")).toHaveCount(0);
		const enter = page.getByRole("button", {
			name: "Enter Mill Bridge",
			exact: true,
		});
		await expect(enter).toBeInViewport({ ratio: 1 });
		expect(
			await enter.evaluate((element) => {
				const box = element.getBoundingClientRect();
				return element.contains(
					document.elementFromPoint(
						box.x + box.width / 2,
						box.y + box.height / 2,
					),
				);
			}),
		).toBe(true);
		expect(
			await page.evaluate(
				() =>
					(document.scrollingElement?.scrollHeight ?? Infinity) <= innerHeight,
			),
		).toBe(true);
		if (process.env.NEIGHBOURS_EVIDENCE)
			await page.screenshot({
				path: `${process.env.NEIGHBOURS_EVIDENCE}/${width}-title-first-visit.png`,
			});
		await enter.click();
		await expect(page.locator(".town-ready")).toBeVisible({ timeout: 120000 });
		await page.getByRole("button", { name: "Game menu", exact: true }).click();
		await page
			.getByRole("button", { name: "To the title page", exact: true })
			.click();
		await expect(
			page.getByRole("button", { name: /^(Enter|Return to) Mill Bridge/ }),
		).toBeVisible();
		await page.evaluate(
			() =>
				new Promise<void>((resolve) =>
					requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
				),
		);
		await expect(notice).toHaveCount(1);
		await page.reload();
		await expect(
			page.getByRole("button", { name: /^(Enter|Return to) Mill Bridge/ }),
		).toBeVisible();
		await expect(notice).toHaveCount(0);
	});
}
