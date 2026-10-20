import { expect, test } from "@playwright/test";

test.use({ hasTouch: true });

for (const viewport of [
	{ width: 360, height: 690 },
	{ width: 1280, height: 800 },
]) {
	test(`places open one sheet and walk only on request (${viewport.width})`, async ({
		page,
	}, testInfo) => {
		await page.setViewportSize(viewport);
		await page.goto(process.env.NEIGHBOURS_TEST_BASE ?? "/");
		await page.getByRole("button", { name: /^(Enter town|Continue)/ }).click();
		await expect(
			page.getByRole("button", { name: "Play town", exact: true }),
		).toBeVisible({ timeout: 60000 });
		const clock = await page.locator(".town-time").textContent();
		const hall = page.locator('[data-map-place="hall"]');
		// Tap the illustrated building's centre, the location that looked inert in the cold visit.
		await hall.locator(".place-hit-area").tap();
		const panel = page.locator(".place-panel");
		await expect(
			panel.getByRole("heading", { name: "Flooded hall", exact: true }),
		).toBeVisible();
		await expect(page.locator(".drawer")).toHaveCount(1);
		await expect(hall).toHaveAttribute("aria-pressed", "true");
		await expect(hall.locator(".place-selection-outline")).toBeAttached();
		await expect(panel).toContainText("The hall needs repairs.");
		await expect(
			panel.getByRole("button", { name: /Walk to Flooded hall · ~45 min/ }),
		).toBeInViewport({ ratio: 1 });
		await expect(
			panel.getByRole("heading", { name: "Who is around" }),
		).toBeInViewport({ ratio: 1 });
		await expect(
			panel.getByText("No familiar neighbours here now."),
		).toBeInViewport({ ratio: 1 });
		await expect(page.locator(".town-time")).toHaveText(clock ?? "");
		await panel.evaluate(async (element) => {
			await Promise.all(
				element
					.closest(".drawer")
					?.getAnimations()
					.map((animation) => animation.finished) ?? [],
			);
		});
		const outline = hall.locator(".place-selection-outline");
		await expect
			.poll(() =>
				outline.evaluate((element) => {
					const box = element.getBoundingClientRect();
					const x = box.left + 2;
					const y = box.top + 18;
					const hit = document.elementFromPoint(x, y);
					return !!hit && !!hit.closest(`[data-map-place="hall"]`);
				}),
			)
			.toBe(true);
		await page.screenshot({
			path: testInfo.outputPath(`place-${viewport.width}.png`),
		});
		await panel.getByRole("button", { name: "Close place details" }).click();
		await page
			.getByRole("button", {
				name: "Inspect Flooded hall · Needs help",
				exact: true,
			})
			.click();
		await expect(panel).toBeVisible();
		await expect(page.locator(".drawer")).toHaveCount(1);
		await panel.getByRole("button", { name: /Walk to Flooded hall ·/ }).click();
		await expect(panel).toContainText("Walking to Flooded hall");
		await expect(
			panel.getByRole("button", { name: /Walk to Flooded hall ·/ }),
		).toBeDisabled();
		await panel.getByRole("button", { name: "Close place details" }).click();
		await page.locator('.neighbour[data-person-id="ada"]').click();
		await expect(page.locator(".person-panel")).toBeVisible();
		await expect(panel).toHaveCount(0);
		await expect(page.locator(".drawer")).toHaveCount(1);
	});
}

test("place company distinguishes meeting from an immediate conversation", async ({
	page,
}) => {
	await page.setViewportSize({ width: 360, height: 690 });
	await page.goto(process.env.NEIGHBOURS_TEST_BASE ?? "/");
	await page.getByRole("button", { name: /^(Enter town|Continue)/ }).click();
	await expect(
		page.getByRole("button", { name: "Play town", exact: true }),
	).toBeVisible({ timeout: 60000 });
	await page.locator('[data-map-place="workshop"] .place-hit-area').tap();
	const panel = page.locator(".place-panel");
	await expect(panel.getByRole("button", { name: /^Meet Ravi/ })).toBeVisible();
	await panel.getByRole("button", { name: /Walk to Workshop ·/ }).click();
	for (let i = 0; i < 4; i++)
		await page
			.getByRole("button", { name: "Step: Advance one round", exact: true })
			.click();
	const talk = panel.getByRole("button", { name: /^Talk to Ravi/ });
	await expect(talk).toBeVisible();
	await talk.click();
	await expect(page.locator(".resident-talk")).toHaveAttribute("open", "");
	await expect(
		page
			.locator(".resident-talk")
			.getByRole("button", { name: "Promise an hour", exact: true }),
	).toBeInViewport({ ratio: 1 });
});
