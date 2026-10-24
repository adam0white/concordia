import { expect, reachSelectedConversation, step, test } from "./clock-fixture";

test.use({
	viewport: { width: 360, height: 690 },
	hasTouch: true,
	isMobile: true,
});
test("an explicit conversation holds time and closing it resumes the automatic town", async ({
	page,
}) => {
	await page.goto("/");
	await page
		.getByRole("button", { name: /^(Enter|Return to) Alder Quay/ })
		.click();
	await expect(page.locator(".state-words")).toBeVisible({ timeout: 60000 });
	await page.locator('.neighbour-strip [data-person-id="ravi"]').click();
	await reachSelectedConversation(page, "Rafi");
	await expect(page.locator(".state-words")).toHaveText(
		"Time holds while you talk",
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
	await expect(page.locator(".game-sheet h2")).toHaveText("Rafi");
	await page.getByRole("button", { name: "Done", exact: true }).click();
	await step(page);
	expect(
		await page.evaluate(
			() => (window as unknown as { townNow: number }).townNow,
		),
	).toBe(held + 15);
});
