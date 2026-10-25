import { expect, test } from "./local-fixture";

test("phone-to-desktop resize keeps map marker targets at their screen size", async ({
	page,
}) => {
	await page.setViewportSize({ width: 360, height: 690 });
	await page.goto("/?lab=1");
	await page
		.getByRole("button", { name: /^(Enter|Return to) Alder Quay/ })
		.click();
	await expect(page.locator(".town-ready")).toBeVisible();
	const widths = () =>
		page
			.locator(".map-person,.map-cluster")
			.evaluateAll((nodes) =>
				nodes.map((node) => node.getBoundingClientRect().width),
			);
	await expect.poll(async () => Math.max(...(await widths()))).toBeLessThan(55);
	await page.setViewportSize({ width: 1280, height: 800 });
	await expect
		.poll(async () => Math.max(...(await widths())), {
			timeout: 200,
			intervals: [20],
		})
		.toBeLessThan(55);
	await page.setViewportSize({ width: 768, height: 1024 });
	await expect
		.poll(async () => Math.min(...(await widths())), {
			timeout: 200,
			intervals: [20],
		})
		.toBeGreaterThanOrEqual(43.5);
});
