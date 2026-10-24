import { expect, type Locator, test } from "./clock-fixture";

/** A visible box can still be behind the pinned action. Check the real hit target. */
async function expectUncovered(target: Locator) {
	await target.scrollIntoViewIfNeeded();
	await target.evaluate((element) =>
		element.scrollIntoView({ block: "center", inline: "nearest" }),
	);
	await expect
		.poll(
			() =>
				target.evaluate((element) => {
					const box = element.getBoundingClientRect();
					const drawer = element.closest(".game-sheet");
					const clip = drawer?.getBoundingClientRect();
					const top = Math.max(box.top, clip?.top ?? 0, 0);
					const bottom = Math.min(
						box.bottom,
						clip?.bottom ?? innerHeight,
						innerHeight,
					);
					const hit = document.elementFromPoint(
						box.left + box.width / 2,
						(top + bottom) / 2,
					);
					return bottom > top && !!hit && element.contains(hit);
				}),
			{ timeout: 5000 },
		)
		.toBe(true);
}

for (const width of [360, 1280])
	test(`resident body scrolls above its pinned response at ${width}`, async ({
		page,
	}) => {
		await page.setViewportSize({ width, height: width === 360 ? 690 : 800 });
		await page.goto("/");
		await page
			.getByRole("button", { name: /^(Enter|Return to) Alder Quay/ })
			.click();
		await expect(page.locator(".town-ready")).toBeVisible({ timeout: 120000 });
		await page.locator('.neighbour-strip [data-person-id="ada"]').click();
		const panel = page.locator(".person-panel");
		await expect(
			panel.getByRole("heading", { name: "Nora", exact: true }),
		).toBeVisible();
		const response = page.getByRole("button", {
			name: /Walk to Workshop to talk/,
		});
		await expectUncovered(response);
		await page.locator(".game-sheet").evaluate((e) => {
			e.scrollTop = e.scrollHeight;
		});
		await expectUncovered(response);
		await panel.locator(".person-evidence > summary").click();
		await expect(panel.locator(".person-evidence")).toHaveAttribute("open", "");
		await expect(panel.locator(".person-evidence")).toContainText("Controller");
		await expectUncovered(response);
	});

test("known open hall need is readable on map and list without colour", async ({
	page,
}) => {
	await page.setViewportSize({ width: 360, height: 690 });
	await page.goto(process.env.NEIGHBOURS_TEST_BASE ?? "/");
	await page
		.getByRole("button", { name: /^(Enter|Return to) Alder Quay/ })
		.click();
	await expect(page.locator(".town-ready")).toBeVisible({ timeout: 60000 });
	const mapCue = page.locator(".known-need-map");
	await expect(mapCue).toContainText("Needs help");
	await expect(mapCue).toBeInViewport({ ratio: 1 });
	const hallChip = page.locator(".known-place-need");
	await expect(hallChip).toHaveAttribute("aria-label", /Needs help/);
	await expect(hallChip).toBeInViewport({ ratio: 1 });
	await expect(
		page.locator(".neighbour[data-person-id] .known-need-cue"),
	).toHaveCount(0);
});
