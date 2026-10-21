import { expect, type Locator, test } from "./clock-fixture";

async function expectStandaloneTarget(target: Locator) {
	await expect(target).toBeInViewport();
	await target.evaluate(async (element) => {
		for (let node: Element | null = element; node; node = node.parentElement) {
			await Promise.all(
				node
					.getAnimations()
					.filter(
						(animation) =>
							animation.effect?.getTiming().iterations !== Infinity,
					)
					.map((animation) => animation.finished),
			);
		}
	});
	const result = await target.evaluate((element) => {
		const rect = element.getBoundingClientRect();
		const hit = document.elementFromPoint(
			rect.x + rect.width / 2,
			rect.y + rect.height / 2,
		);
		const overlaps = Array.from(
			(element.closest("dialog") ?? document).querySelectorAll(
				"a, button, summary, input, select",
			),
		).filter((other) => {
			if (
				other === element ||
				element.contains(other) ||
				other.contains(element)
			)
				return false;
			const box = other.getBoundingClientRect();
			return (
				box.width > 0 &&
				box.height > 0 &&
				Math.min(rect.right, box.right) - Math.max(rect.left, box.left) > 0.5 &&
				Math.min(rect.bottom, box.bottom) - Math.max(rect.top, box.top) > 0.5
			);
		});
		return {
			width: rect.width,
			height: rect.height,
			centreHitsTarget:
				hit === element || (hit !== null && element.contains(hit)),
			overlaps: overlaps.map((other) => other.textContent?.trim()),
		};
	});
	expect.soft(result.width).toBeGreaterThanOrEqual(44);
	expect.soft(result.height).toBeGreaterThanOrEqual(44);
	expect.soft(result.centreHitsTarget).toBe(true);
	expect.soft(result.overlaps).toEqual([]);
}

for (const viewport of [
	{ width: 360, height: 690 },
	{ width: 320, height: 690 },
	{ width: 1280, height: 800 },
]) {
	test(`resident selection uses ink and standalone responses have clear targets at ${viewport.width}px`, async ({
		page,
	}) => {
		await page.setViewportSize(viewport);
		await page.goto("/");
		await page.getByRole("button", { name: "Enter town", exact: true }).click();
		await expect(
			page.getByRole("button", { name: "Game menu", exact: true }),
		).toBeVisible();
		await expectStandaloneTarget(page.locator(".hub-mark"));
		await expectStandaloneTarget(page.locator(".margin-note .step-title"));
		if (process.env.CLARITY_ARTIFACT_PREFIX)
			await page.screenshot({
				path: `${process.env.CLARITY_ARTIFACT_PREFIX}-town-${viewport.width}.png`,
			});
		expect(
			await page.evaluate(() => document.documentElement.scrollWidth),
		).toBe(viewport.width);
		await page.getByRole("button", { name: "Game menu", exact: true }).click();
		await expectStandaloneTarget(
			page
				.getByRole("dialog", { name: "Game menu", exact: true })
				.locator("summary")
				.filter({ hasText: "Playtest privacy" }),
		);
		if (process.env.CLARITY_ARTIFACT_PREFIX)
			await page.screenshot({
				path: `${process.env.CLARITY_ARTIFACT_PREFIX}-menu-${viewport.width}.png`,
			});
		await page.keyboard.press("Escape");
		await page.locator(".neighbour-strip [data-person-id]").first().click();
		const colours = await page
			.locator(".neighbour.active")
			.evaluate((element) => {
				const probe = document.createElement("span");
				probe.style.color = "var(--ink)";
				element.append(probe);
				const ink = getComputedStyle(probe).color;
				probe.remove();
				return {
					border: getComputedStyle(element).borderTopColor,
					ink,
					weight: getComputedStyle(element.querySelector("strong") ?? element)
						.fontWeight,
				};
			});
		expect.soft(colours.border).toBe(colours.ink);
		expect.soft(Number(colours.weight)).toBeGreaterThanOrEqual(600);
		if (viewport.width >= 600)
			await expect
				.soft(page.locator(".selection-ring"))
				.toHaveCSS("stroke", colours.ink);
		if (process.env.CLARITY_ARTIFACT_PREFIX)
			await page.screenshot({
				path: `${process.env.CLARITY_ARTIFACT_PREFIX}-${viewport.width}.png`,
			});
	});
}
