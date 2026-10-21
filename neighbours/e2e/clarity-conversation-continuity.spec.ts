import { expect, step, test } from "./clock-fixture";

test.use({
	viewport: { width: 360, height: 690 },
	hasTouch: true,
	isMobile: true,
});
test("an explicit conversation holds time and closing it resumes the automatic town", async ({
	page,
}) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Enter town", exact: true }).click();
	await expect(page.locator(".clock-rate")).toBeVisible({ timeout: 60000 });
	await page.locator('.neighbour-strip [data-person-id="ravi"]').click();
	await page.getByRole("button", { name: /Walk to Workshop to talk/ }).click();
	for (let i = 0; i < 4; i++) await step(page);
	const talk = page.locator(".resident-talk > summary");
	await talk.click();
	await expect(page.locator(".clock-rate")).toHaveText(
		"Time held · conversation",
	);
	const held = await page.evaluate(
		() => (window as unknown as { townNow: number }).townNow,
	);
	await page.clock.fastForward(30000);
	expect(
		await page.evaluate(
			() => (window as unknown as { townNow: number }).townNow,
		),
	).toBe(held);
	await expect(page.locator(".person-panel h2")).toHaveText("Ravi");
	await talk.click();
	await step(page);
	expect(
		await page.evaluate(
			() => (window as unknown as { townNow: number }).townNow,
		),
	).toBe(held + 15);
});
