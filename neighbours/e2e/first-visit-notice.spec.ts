import { expect, test } from "@playwright/test";

for (const width of [360, 1280]) {
	test(`first-visit notice stays above the title drawing without hiding entry at ${width}`, async ({
		page,
	}) => {
		await page.setViewportSize({ width, height: width === 360 ? 690 : 800 });
		await page.addInitScript(() =>
			localStorage.setItem("hf-lab-recording-off", "1"),
		);
		await page.goto("/");
		const notice = page.locator(".lk-telemetry-notice");
		await expect(notice).toContainText("The lab records your play");
		const dismiss = notice.getByRole("button", {
			name: "Dismiss",
			exact: true,
		});
		await expect(dismiss).toBeInViewport({ ratio: 1 });
		const exposed = await dismiss.evaluate((element) => {
			const box = element.getBoundingClientRect();
			return {
				width: box.width,
				height: box.height,
				unobscured: element.contains(
					document.elementFromPoint(
						box.x + box.width / 2,
						box.y + box.height / 2,
					),
				),
			};
		});
		expect(exposed.width).toBeGreaterThanOrEqual(44);
		expect(exposed.height).toBeGreaterThanOrEqual(44);
		expect(exposed.unobscured).toBe(true);
		const enter = page.getByRole("button", {
			name: "Enter Alder Quay",
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
		await dismiss.click();
		await expect(notice).toHaveCount(0);
		await page.reload();
		await expect(enter).toBeVisible();
		await expect(notice).toHaveCount(0);
	});
}
