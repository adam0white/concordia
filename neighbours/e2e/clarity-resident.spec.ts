import { expect, type Locator, test } from "@playwright/test";

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
					const drawer = element.closest(".drawer");
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

test("resident sheet keeps the selected resident response visible while scrolling", async ({
	page,
}) => {
	await page.setViewportSize({ width: 360, height: 690 });
	await page.goto(process.env.NEIGHBOURS_TEST_BASE ?? "/");
	await page.getByRole("button", { name: /^(Enter town|Continue)/ }).click();
	await expect(
		page.getByRole("button", { name: "Play town", exact: true }),
	).toBeVisible({ timeout: 60000 });
	await page.locator(".neighbour-strip [data-person-id]").first().click();
	const action = page.locator(".person-panel > .player-action");
	await expect(action).toBeInViewport();
	await expect(action).toContainText("Walk to Workshop to talk");
	await expect(page.locator(".resident-location")).toContainText(
		"You are at Riverside homes",
	);
	const drawer = page.locator(".drawer-person");
	await drawer.evaluate((element) => {
		element.scrollTop = element.scrollHeight;
	});
	await expect(action).toBeInViewport();
	const actionBox = await action.boundingBox();
	const drawerBox = await drawer.boundingBox();
	const dockBox = await page.locator(".dock").boundingBox();
	expect(actionBox?.width ?? 0).toBeGreaterThanOrEqual(
		(drawerBox?.width ?? 0) - 40,
	);
	expect((actionBox?.y ?? 0) + (actionBox?.height ?? 0)).toBeLessThanOrEqual(
		dockBox?.y ?? 0,
	);
	const walk = page
		.locator(".resident-location")
		.getByText("Walk somewhere", { exact: true });
	await expectUncovered(walk);
	await walk.click();
	const destination = page
		.locator(".resident-location")
		.getByRole("button", { name: /Market kitchen/ });
	await expectUncovered(destination);
	await destination.click();
	await expect(page.locator(".resident-location")).toContainText(
		"Walking to Market kitchen",
	);
});

for (const { width, colorScheme } of [
	{ width: 320, colorScheme: "light" },
	{ width: 360, colorScheme: "dark" },
] as const) {
	test(`resident details and walking destinations remain uncovered at 200% text (${width}, ${colorScheme})`, async ({
		page,
	}, testInfo) => {
		await page.setViewportSize({ width, height: 690 });
		await page.emulateMedia({ colorScheme });
		await page.goto(process.env.NEIGHBOURS_TEST_BASE ?? "/");
		await page.getByRole("button", { name: /^(Enter town|Continue)/ }).click();
		await expect(
			page.getByRole("button", { name: "Play town", exact: true }),
		).toBeVisible({ timeout: 60000 });
		await page.locator(".neighbour-strip [data-person-id]").first().click();
		await page.evaluate(() => {
			document.documentElement.style.fontSize = "34px";
		});
		const panel = page.locator(".person-panel");
		await expectUncovered(panel.locator("h2"));
		await expectUncovered(panel.locator(".description"));
		const walk = panel.getByText("Walk somewhere", { exact: true });
		await expectUncovered(walk);
		await walk.click();
		const destinations = panel.locator(".walk-list button");
		expect(await destinations.count()).toBeGreaterThan(0);
		for (let index = 0; index < (await destinations.count()); index++) {
			await expectUncovered(destinations.nth(index));
		}
		await expectUncovered(panel.locator("h2"));
		await page.screenshot({ path: testInfo.outputPath("text200-name.png") });
		await expectUncovered(panel.locator(".description"));
		await page.screenshot({
			path: testInfo.outputPath("text200-description.png"),
		});
		const close = panel.getByRole("button", { name: "Close person details" });
		await expectUncovered(close);
		await close.click();
		await expect(panel).toHaveCount(0);
	});
}

test("Ada and Ravi lead with a direct response; arriving reaches the Ask alternative", async ({
	page,
}) => {
	await page.setViewportSize({ width: 360, height: 690 });
	await page.goto(process.env.NEIGHBOURS_TEST_BASE ?? "/");
	await page.getByRole("button", { name: /^(Enter town|Continue)/ }).click();
	await expect(
		page.getByRole("button", { name: "Play town", exact: true }),
	).toBeVisible({ timeout: 60000 });
	for (const id of ["ada", "ravi"]) {
		await page.locator(`.neighbour-strip [data-person-id="${id}"]`).click();
		const panel = page.locator(".person-panel");
		const response = panel.getByRole("button", {
			name: /Walk to Workshop to talk/,
		});
		await expect(response).toBeInViewport({ ratio: 1 });
		const ordering = await panel.evaluate((el) => {
			const name = el.querySelector("h2")?.getBoundingClientRect();
			const response = el
				.querySelector(".resident-response")
				?.getBoundingClientRect();
			const location = el
				.querySelector(".player-place")
				?.getBoundingClientRect();
			return (
				!!name &&
				!!response &&
				!!location &&
				name.bottom <= response.top &&
				response.bottom <= location.top
			);
		});
		expect(ordering).toBe(true);
		await expectUncovered(response);
		if (id === "ravi") await response.click();
		else
			await panel.getByRole("button", { name: "Close person details" }).click();
	}
	for (let i = 0; i < 4; i++)
		await page
			.getByRole("button", { name: "Step: Advance one round", exact: true })
			.click();
	const talk = page.locator(".resident-talk > summary");
	await expect(talk).toHaveText("Talk to Ravi");
	await talk.click();
	if (
		await page
			.locator(
				".resident-talk[open] .conversation-request:not([open]) > summary",
			)
			.count()
	)
		await page.locator(".conversation-request > summary").click();
	await page.getByLabel("Ask them to").selectOption({ index: 1 });
	await page.getByText("Ask or urge instead", { exact: true }).click();
	const ask = page
		.locator(".resident-talk")
		.getByRole("button", { name: "Ask", exact: true });
	await ask.scrollIntoViewIfNeeded();
	await expect(ask).toBeInViewport({ ratio: 1 });
	await expect(ask).toBeEnabled();
	await expectUncovered(ask);
	await ask.click();
	await expect(page.locator(".latest-answer")).toBeVisible();
});

test("known open hall need is readable on map and list without colour", async ({
	page,
}) => {
	await page.setViewportSize({ width: 360, height: 690 });
	await page.goto(process.env.NEIGHBOURS_TEST_BASE ?? "/");
	await page.getByRole("button", { name: /^(Enter town|Continue)/ }).click();
	await expect(
		page.getByRole("button", { name: "Play town", exact: true }),
	).toBeVisible({ timeout: 60000 });
	for (const selector of [
		".known-need-map",
		".known-place-need .known-need-cue",
	]) {
		const cue = page.locator(selector);
		await expect(cue).toContainText("Needs help");
		await expect(cue).toBeInViewport({ ratio: 1 });
	}
	await expect(
		page.locator(".neighbour[data-person-id] .known-need-cue"),
	).toHaveCount(0);
});
