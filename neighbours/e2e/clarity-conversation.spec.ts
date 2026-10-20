import { expect, type Locator, type Page, test } from "@playwright/test";

test.use({ hasTouch: true });
async function openConversation(page: Page, waitPrediction = true) {
	await page.goto(process.env.NEIGHBOURS_TEST_BASE ?? "/");
	await page.getByRole("button", { name: /^(Enter town|Continue)/ }).click();
	await expect(
		page.getByRole("button", { name: "Play town", exact: true }),
	).toBeVisible({ timeout: 60000 });
	await page.locator('.neighbour-strip [data-person-id="ravi"]').click();
	await page.getByRole("button", { name: /Walk to Workshop to talk/ }).click();
	for (let i = 0; i < 4; i++)
		await page
			.getByRole("button", { name: "Step: Advance one round", exact: true })
			.click();
	await page.locator(".resident-talk > summary").click();
	if (waitPrediction)
		await expect(page.getByLabel("Ask them to")).toBeEnabled();
}
async function visibleTarget(control: Locator) {
	await expect(control).toBeInViewport({ ratio: 1 });
	expect(
		await control.evaluate((element) => {
			const box = element.getBoundingClientRect();
			const hit = document.elementFromPoint(
				box.x + box.width / 2,
				box.y + box.height / 2,
			);
			return (
				box.height >= 44 && box.width >= 44 && !!hit && element.contains(hit)
			);
		}),
	).toBe(true);
}
for (const width of [360, 1280])
	test(`offer is complete without scrolling at ${width}`, async ({
		page,
	}, info) => {
		await page.setViewportSize({ width, height: width === 360 ? 690 : 800 });
		await openConversation(page);
		const form = page.locator(".promise-choice");
		for (const label of ["Ask them to", "Your hour", "Done by"]) {
			const control = form.getByLabel(label);
			await visibleTarget(control);
			await expect(control).toHaveValue(label === "Done by" ? "1080" : "");
		}
		await visibleTarget(
			form.getByRole("button", { name: "Promise an hour", exact: true }),
		);
		await expect(form.locator(".promise-meaning")).toBeInViewport({ ratio: 1 });
		await expect(form.getByRole("button")).toBeDisabled();
		await form.getByLabel("Ask them to").selectOption({ index: 1 });
		await form.getByLabel("Your hour").selectOption("help-repair");
		await form.getByLabel("Done by").selectOption({ index: 1 });
		await expect(form.getByRole("button")).toBeEnabled();
		await page.screenshot({ path: info.outputPath(`offer-${width}.png`) });
	});

test("conversation stays open and mounted when the listener leaves", async ({
	page,
}) => {
	await page.setViewportSize({ width: 360, height: 690 });
	await openConversation(page);
	const details = page.locator(".resident-talk");
	const original = await details.elementHandle();
	if (!original) throw new Error("No conversation");
	await page.getByLabel("Your hour").selectOption("help-repair");
	let departed = false;
	for (let round = 0; round < 24; round++) {
		await page
			.getByRole("button", { name: "Step: Advance one round", exact: true })
			.click();
		if (
			await page
				.locator(".speak-panel")
				.getByText(/is not with you/)
				.isVisible()
		) {
			departed = true;
			break;
		}
	}
	expect(departed).toBe(true);
	expect(
		await original.evaluate(
			(element) => element.isConnected && (element as HTMLDetailsElement).open,
		),
	).toBe(true);
	await expect(details.locator("summary").first()).toHaveText("Talk to Ravi");
	await expect(page.getByLabel("Your hour")).toHaveCount(0);
});

test("loading choices leaves offer controls in place", async ({ page }) => {
	await page.setViewportSize({ width: 360, height: 690 });
	await page.addInitScript(() => {
		const post = Worker.prototype.postMessage;
		Worker.prototype.postMessage = function (message: unknown) {
			if ((message as { type?: string }).type === "predict-speech") {
				setTimeout(() => post.call(this, message), 2000);
			} else post.call(this, message);
		};
	});
	await openConversation(page, false);
	const button = page.getByRole("button", {
		name: "Promise an hour",
		exact: true,
	});
	const pending = await button.boundingBox();
	await expect(page.getByLabel("Ask them to")).toBeDisabled();
	await visibleTarget(button);
	await expect(page.getByLabel("Ask them to")).toBeEnabled();
	const ready = await button.boundingBox();
	expect(ready).toEqual(pending);
});
