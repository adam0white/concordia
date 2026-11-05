import { expect, type Locator, step, test } from "./clock-fixture";

async function exposed(node: Locator) {
	await expect(node).toBeVisible();
	await expect(node).toBeInViewport({ ratio: 1 });
	await expect
		.poll(() =>
			node.evaluate((el) => {
				const r = el.getBoundingClientRect();
				const x = Math.min(12, r.width / 4);
				const y = Math.min(12, r.height / 4);
				const points: [number, number][] = [
					[r.left + x, r.top + y],
					[r.right - x, r.top + y],
					[r.left + x, r.bottom - y],
					[r.right - x, r.bottom - y],
					[r.left + r.width / 2, r.top + r.height / 2],
				];
				return points.every(([a, b]) =>
					el.contains(document.elementFromPoint(a, b)),
				);
			}),
		)
		.toBe(true);
}

for (const width of [360, 1280]) {
	test(`first steps are reachable and replayable at ${width}`, async ({
		page,
	}, info) => {
		await page.setViewportSize({ width, height: width === 360 ? 690 : 800 });
		await page.goto("/");
		const enter = page.getByRole("button", { name: /^Enter Mill Bridge/ });
		await exposed(enter);
		await enter.click();
		await expect(page.locator(".town-ready")).toBeVisible({ timeout: 90000 });
		const guide = page.locator("[data-first-steps]");
		const person = page.locator(".neighbour-strip [data-person-id]").first();
		await exposed(guide);
		await exposed(guide.getByRole("button", { name: "Skip guide" }));
		for (const choice of await page.locator(".neighbour-strip button").all()) {
			await exposed(choice);
			expect(
				await choice.evaluate(
					(element) => element.getBoundingClientRect().height,
				),
			).toBeGreaterThanOrEqual(44);
		}
		await exposed(person);
		await page.screenshot({ path: info.outputPath(`opening-${width}.png`) });
		const hall = page
			.locator(".neighbour-strip")
			.getByRole("button", { name: /^Inspect Flooded hall/ });
		await exposed(hall);
		await hall.click();
		await expect(guide).toHaveCount(1);
		await exposed(guide);
		const closePlace = page.getByRole("button", {
			name: "Close place details",
		});
		await exposed(closePlace);
		await closePlace.click();
		await exposed(person);
		await person.click();
		await exposed(guide);
		await exposed(guide.getByRole("button", { name: "Skip guide" }));
		await guide.getByRole("button", { name: "Skip guide" }).click();
		await expect(guide).toHaveCount(0);
		const menu = page.getByRole("button", { name: "Game menu" });
		await exposed(menu);
		await menu.click();
		const replay = page.getByRole("button", { name: "Replay first steps" });
		await exposed(replay);
		await replay.click();
		await exposed(guide);
	});
}

// The controlled clock still posts ordinary native town rounds; no resident decision is seeded.

for (const width of [360, 1280]) {
	test(`a real request receives a recorded reply at ${width}`, async ({
		page,
	}, info) => {
		test.setTimeout(180_000);
		await page.setViewportSize({ width, height: width === 360 ? 690 : 800 });
		await page.goto("/");
		const enter = page.getByRole("button", { name: /^Enter Mill Bridge/ });
		await exposed(enter);
		await enter.click();
		await expect(page.locator(".town-ready")).toBeVisible({ timeout: 90000 });
		const person = page.locator('.neighbour-strip [data-person-id="ada"]');
		await exposed(person);
		await person.click();
		const guide = page.locator("[data-first-steps]");
		const talk = page.getByRole("button", {
			name: "Talk to Nora",
			exact: true,
		});
		for (let i = 0; i < 16; i++) {
			if (await talk.isVisible()) break;
			const walk = page.getByRole("button", { name: /^Walk to .* to talk/ });
			if ((await walk.isVisible()) && (await walk.isEnabled())) {
				await exposed(walk);
				await walk.click();
				await expect(
					page.getByText(/^You (start|keep) walking automatically$/),
				).toBeVisible();
				await exposed(guide);
				await expect(guide).toContainText("You are walking");
			}
			await step(page);
		}
		await exposed(talk);
		await talk.click();
		await exposed(guide);
		await page.screenshot({ path: info.outputPath(`request-${width}.png`) });
		const ask = page
			.locator(".conversation-request")
			.getByRole("button", { name: "Ask", exact: true });
		await exposed(ask);
		await ask.click();
		const offer = page
			.locator(".conversation-request [data-affordance-id]")
			.first();
		await exposed(offer);
		await offer.click();
		const submit = page
			.locator(".game-actions")
			.getByRole("button", { name: /^Ask Nora$/ });
		await exposed(submit);
		await expect(submit).toBeEnabled();
		await submit.click();
		const answer = page.locator(".latest-answer .request-record");
		await expect(answer).toHaveAttribute("data-request-id", /.+/);
		await expect(answer.locator(".voice").first()).not.toBeEmpty();
		await exposed(guide);
		await exposed(guide.getByRole("button", { name: "Skip guide" }));
		await page.screenshot({ path: info.outputPath(`answer-${width}.png`) });
		const requestId = await answer.getAttribute("data-request-id");
		await page.reload();
		const resume = page.getByRole("button", { name: /^Return to Mill Bridge/ });
		await exposed(resume);
		await resume.click();
		await expect(page.locator(".town-ready")).toBeVisible({ timeout: 90000 });
		if (await person.isVisible()) {
			await exposed(person);
			await person.click();
		}
		await exposed(talk);
		await talk.click();
		await expect(answer).toHaveAttribute(
			"data-request-id",
			requestId as string,
		);
		await exposed(guide);
		await expect(guide).not.toContainText("Choose how to ask");
		const menu = page.getByRole("button", { name: "Game menu" });
		await exposed(menu);
		await menu.click();
		const replay = page.getByRole("button", { name: "Replay first steps" });
		await exposed(replay);
		await replay.click();
		await exposed(guide);
		await expect(guide).toContainText("Choose how to ask");
	});
}
