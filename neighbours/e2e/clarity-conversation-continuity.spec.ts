import {
	expect,
	nextRoundAt,
	reachSelectedConversation,
	step,
	test,
} from "./clock-fixture";
import { enterLocalTown } from "./local-fixture";

test.use({
	viewport: { width: 360, height: 690 },
	hasTouch: true,
	isMobile: true,
});
test("an explicit conversation holds time and closing it resumes the automatic town", async ({
	page,
}) => {
	// Full initialization and walking correctness; not a latency acceptance.
	test.setTimeout(600000);
	await page.goto("/");
	await enterLocalTown(page, 60000);
	await expect(page.locator(".state-words")).toBeVisible({ timeout: 60000 });
	await page.locator('.neighbour-strip [data-person-id="ravi"]').click();
	await reachSelectedConversation(page, "Rafi");
	await expect(page.locator(".state-words")).toHaveText(
		"Time pauses while you talk",
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
	).toBe(nextRoundAt(held));
});
