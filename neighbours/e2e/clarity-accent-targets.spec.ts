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
			if (!other.checkVisibility()) return false;
			if (
				other === element ||
				element.contains(other) ||
				other.contains(element)
			)
				return false;
			const box = other.getBoundingClientRect();
			let left = Math.max(0, box.left),
				right = Math.min(innerWidth, box.right),
				top = Math.max(0, box.top),
				bottom = Math.min(innerHeight, box.bottom);
			for (
				let parent = other.parentElement;
				parent;
				parent = parent.parentElement
			) {
				const style = getComputedStyle(parent);
				const clip = parent.getBoundingClientRect();
				if (/hidden|clip|scroll|auto/.test(style.overflowX)) {
					left = Math.max(left, clip.left);
					right = Math.min(right, clip.right);
				}
				if (/hidden|clip|scroll|auto/.test(style.overflowY)) {
					top = Math.max(top, clip.top);
					bottom = Math.min(bottom, clip.bottom);
				}
			}
			return (
				right > left &&
				bottom > top &&
				Math.min(rect.right, right) - Math.max(rect.left, left) > 0.5 &&
				Math.min(rect.bottom, bottom) - Math.max(rect.top, top) > 0.5
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
	test(`resident selection is labelled and responses have clear targets at ${viewport.width}px`, async ({
		page,
	}) => {
		await page.setViewportSize(viewport);
		await page.goto("/");
		await page
			.getByRole("button", { name: /^(Enter|Return to) Alder Quay/ })
			.click();
		await expect(page.locator(".town-ready")).toBeVisible();
		await expectStandaloneTarget(
			page.getByRole("button", { name: "Information", exact: true }),
		);
		await expectStandaloneTarget(page.locator(".next-step"));
		if (process.env.CLARITY_ARTIFACT_PREFIX)
			await page.screenshot({
				path: `${process.env.CLARITY_ARTIFACT_PREFIX}-town-${viewport.width}.png`,
			});
		expect(
			await page.evaluate(() => document.documentElement.scrollWidth),
		).toBe(viewport.width);
		await page
			.getByRole("button", { name: /^Game menu(?: · day \d+)?$/ })
			.click();
		await expectStandaloneTarget(
			page.getByRole("button", { name: "Paper or lamplight", exact: true }),
		);
		if (process.env.CLARITY_ARTIFACT_PREFIX)
			await page.screenshot({
				path: `${process.env.CLARITY_ARTIFACT_PREFIX}-menu-${viewport.width}.png`,
			});
		await page.keyboard.press("Escape");
		await page.locator(".neighbour-strip [data-person-id]").first().click();
		await expect(page.locator(".neighbour.active")).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		await expectStandaloneTarget(page.locator(".game-actions .primary"));
		if (process.env.CLARITY_ARTIFACT_PREFIX)
			await page.screenshot({
				path: `${process.env.CLARITY_ARTIFACT_PREFIX}-${viewport.width}.png`,
			});
	});
}
