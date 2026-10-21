import { expect, step, test } from "./clock-fixture";

test.use({ hasTouch: true });
for (const width of [360, 1280])
	test(`hall responses and direct help stay readable at ${width}`, async ({
		page,
	}, info) => {
		await page.setViewportSize({ width, height: width === 360 ? 690 : 800 });
		await page.goto(process.env.NEIGHBOURS_TEST_BASE ?? "/");
		await page.getByRole("button", { name: "Enter town", exact: true }).click();
		await expect(
			page.getByRole("button", { name: "Game menu", exact: true }),
		).toBeEnabled({ timeout: 60000 });
		await page.locator('[data-map-place="hall"] .place-hit-area').tap();
		await page.getByRole("button", { name: /Walk to Flooded hall ·/ }).click();
		await expect(page.locator(".playback")).toContainText(
			"You set off automatically",
		);
		const time = page.locator(".town-time");
		for (let i = 0; i < 6; i++) {
			const before = await time.innerText();
			await step(page);
			// A click queues a worker command; wait for its rendered outcome.
			await expect(time).not.toHaveText(before);
		}
		await expect(time).toContainText("09:30");
		const company = page.locator(".place-company");
		await expect(company.getByRole("button")).toHaveText([
			/^Talk to Ada ·/,
			/^Talk to Noor ·/,
		]);
		await expect(company).toBeInViewport({ ratio: 1 });
		for (const button of await company.getByRole("button").all()) {
			await expect(button).toBeInViewport({ ratio: 1 });
			expect(
				await button.evaluate((e) => {
					const b = e.getBoundingClientRect();
					return (
						b.height >= 44 &&
						e.contains(
							document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2),
						)
					);
				}),
			).toBe(true);
		}
		expect(await company.evaluate((e) => e.closest(".drawer")?.scrollTop)).toBe(
			0,
		);
		await page.screenshot({
			path: info.outputPath(`round4-hall-${width}.png`),
		});
		await page.getByRole("button", { name: /^Talk to Ada/ }).click();
		const help = page.getByRole("button", {
			name: "Cover an hour for Ada",
			exact: true,
		});
		await expect(help).toBeInViewport({ ratio: 1 });
		await expect(page.locator(".inspector-context")).toContainText(
			"Ada left a question on the hall noticeboard",
		);
		await page.screenshot({ path: info.outputPath(`round4-ada-${width}.png`) });
		await help.click();
		await expect(page.locator(".playback")).toContainText(
			"Your hour starts automatically",
		);
		// Leave default speed/story-watch on. Resuming a story is a visible player input.
		const started = Date.now();
		while (
			Date.now() - started < 45000 &&
			!(await page.locator(".pledge-receipt").count())
		) {
			await step(page);
		}
		await expect(page.locator(".pledge-receipt")).toContainText(
			"You covered that hour for me. I received the two coins.",
		);
		await expect(page.locator(".pledge-receipt")).toContainText(
			"Ada received the 2-coin wage",
		);
		await expect(page.locator(".pledge-receipt")).toBeInViewport({ ratio: 1 });
		await page.screenshot({
			path: info.outputPath(`round4-help-${width}.png`),
		});
	});
