import { expect, type Locator, type Page, step, test } from "./clock-fixture";

async function openConversation(page: Page) {
	await page.goto(process.env.NEIGHBOURS_TEST_BASE ?? "/");
	await page
		.getByRole("button", { name: /^(Enter|Return to) Alder Quay/ })
		.click();
	await expect(page.locator(".town-ready")).toBeVisible({ timeout: 120000 });
	await page.locator('.neighbour-strip [data-person-id="ravi"]').click();
	await page.getByRole("button", { name: /Walk to Workshop to talk/ }).click();
	for (let i = 0; i < 4; i++) await step(page);
	await page.getByRole("button", { name: "Talk to Ravi", exact: true }).click();
	await expect(page.locator("[data-affordance-id]").first()).toBeVisible();
}
async function visibleTarget(control: Locator) {
	await expect(control).toBeInViewport({ ratio: 1 });
	expect(
		await control.evaluate((element) => {
			const b = element.getBoundingClientRect();
			const hit = document.elementFromPoint(
				b.x + b.width / 2,
				b.y + b.height / 2,
			);
			return b.height >= 44 && b.width >= 44 && !!hit && element.contains(hit);
		}),
	).toBe(true);
}
for (const width of [360, 1280])
	test(`conversation chips and pinned submit stay usable at ${width}`, async ({
		page,
	}, info) => {
		await page.setViewportSize({ width, height: width === 360 ? 690 : 800 });
		await openConversation(page);
		const form = page.locator("#town-conversation");
		await expect(form.locator("select")).toHaveCount(0);
		await expect(
			page.getByRole("button", { name: "Offer an hour", exact: true }),
		).toHaveAttribute("aria-pressed", "true");
		const submit = page.getByRole("button", {
			name: "Put it to Ravi",
			exact: true,
		});
		await expect(submit).toBeDisabled();
		await visibleTarget(submit);
		await form.locator("[data-affordance-id]").first().click();
		await form.locator('[data-work-id="help-repair"]').click();
		await expect(submit).toBeEnabled();
		await page.getByRole("button", { name: "Urge", exact: true }).click();
		await expect(form).toContainText("wears on their trust");
		await expect(submit).toBeEnabled();
		await page.getByRole("button", { name: "Ask", exact: true }).click();
		await expect(
			page.getByRole("button", { name: "Ask", exact: true }),
		).toHaveAttribute("aria-pressed", "true");
		await expect(form.locator("[data-work-id]")).toHaveCount(0);
		await expect(submit).toBeEnabled();
		const before = await page.evaluate(
			() => (window as unknown as { townNow: number }).townNow,
		);
		await page.clock.fastForward(5000);
		expect(
			await page.evaluate(
				() => (window as unknown as { townNow: number }).townNow,
			),
		).toBe(before);
		expect(
			await page.evaluate(
				() =>
					(document.scrollingElement?.scrollHeight ?? Infinity) <= innerHeight,
			),
		).toBe(true);
		await page.screenshot({
			path: info.outputPath(`conversation-${width}.png`),
		});
	});
for (const mode of ["promise", "ask", "urge"] as const)
	test(`chip selections submit the original ${mode} command`, async ({
		page,
	}) => {
		await page.addInitScript(() => {
			const post = Worker.prototype.postMessage;
			Object.assign(window, { speechCommands: [] });
			Worker.prototype.postMessage = function (message: unknown) {
				const value = message as {
					type?: string;
					intervention?: { kind?: string };
				};
				if (
					value.type === "intervene" &&
					value.intervention?.kind === "player-speak"
				)
					(
						window as unknown as { speechCommands: unknown[] }
					).speechCommands.push(structuredClone(value.intervention));
				return post.call(this, message);
			};
		});
		await openConversation(page);
		const offer = page.locator("[data-affordance-id]").first();
		const affordanceId = await offer.getAttribute("data-affordance-id");
		await offer.click();
		await page
			.getByRole("button", {
				name:
					mode === "promise"
						? "Offer an hour"
						: mode === "ask"
							? "Ask"
							: "Urge",
				exact: true,
			})
			.click();
		if (mode === "promise")
			await page.locator('[data-work-id="carry-meals"]').click();
		await page
			.getByRole("button", { name: "Put it to Ravi", exact: true })
			.click();
		await expect(page.locator(".latest-answer")).toBeVisible();
		const commands = await page.evaluate(
			() => (window as unknown as { speechCommands: unknown[] }).speechCommands,
		);
		expect(commands).toHaveLength(1);
		expect(commands[0]).toMatchObject({
			kind: "player-speak",
			actorId: "ravi",
			affordanceId,
			mode,
		});
		if (mode === "promise")
			expect(commands[0]).toMatchObject({
				pledge: { work: "carry-meals", by: 1080 },
			});
		else expect(commands[0]).not.toHaveProperty("pledge");
	});
