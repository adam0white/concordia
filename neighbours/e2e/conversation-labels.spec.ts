import { expect, reachSelectedConversation, test } from "./clock-fixture";

for (const width of [360, 1280]) {
	test(`complete conversation choices fit the sheet at ${width}`, async ({
		page,
	}, info) => {
		await page.setViewportSize({ width, height: width === 360 ? 690 : 800 });
		await page.route("**/*", (route) =>
			/^(POST|PUT|PATCH|DELETE)$/.test(route.request().method())
				? route.abort()
				: route.continue(),
		);
		await page.goto("/");
		await page.getByRole("button", { name: /^Enter Alder Quay/ }).click();
		await expect(page.locator(".town-ready")).toBeVisible({ timeout: 120000 });
		await page.locator('.neighbour-strip [data-person-id="ada"]').click();
		await reachSelectedConversation(page, "Nora");
		const choices = page.locator(".conversation-chips");
		await expect(page.locator("[data-affordance-id]").first()).toBeVisible();
		await expect(page.locator('[data-work-id="cover-shift"]')).toHaveText(
			"Cover one hour of their shift",
		);
		// Every option must fit without horizontal scrolling, even after selection.
		for (const selected of [false, true]) {
			if (selected) {
				await page.locator("[data-affordance-id]").first().click();
				await page.locator('[data-work-id="help-repair"]').click();
			}
			for (const row of await choices.all()) {
				expect(
					await row.evaluate(
						(element) => element.scrollWidth <= element.clientWidth + 1,
					),
				).toBe(true);
				for (const button of await row.locator("button").all()) {
					await button.scrollIntoViewIfNeeded();
					await expect(button).toBeInViewport({ ratio: 1 });
					expect(
						await button.evaluate((element) => {
							const bounds = element.getBoundingClientRect();
							const row = element.parentElement?.getBoundingClientRect();
							return (
								!!row &&
								bounds.left >= row.left - 1 &&
								bounds.right <= row.right + 1 &&
								element.scrollWidth <= element.clientWidth + 1 &&
								bounds.height >= 44
							);
						}),
					).toBe(true);
				}
			}
		}
		for (const [label, control] of [
			[
				"visit",
				page.getByRole("button", {
					name: "Visit neighbours at the hall",
					exact: true,
				}),
			],
			["work", page.locator('[data-work-id="cover-shift"]')],
		] as const) {
			await control.scrollIntoViewIfNeeded();
			await page.screenshot({ path: info.outputPath(`${label}-${width}.png`) });
		}
		const submit = page.getByRole("button", {
			name: "Put it to Nora",
			exact: true,
		});
		await expect(submit).toBeEnabled();
		await submit.click();
		await expect(page.locator(".latest-answer")).toBeVisible();
		await page.screenshot({ path: info.outputPath(`answer-${width}.png`) });
	});
}
