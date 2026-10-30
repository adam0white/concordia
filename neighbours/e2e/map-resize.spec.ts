import { enterLocalTown, expect, type Page, test } from "./local-fixture";
import { closeSaves, openSaves } from "./session-helpers";

/** Compare published measurements with the actual SVG consumer, not class names. */
async function measuredMap(page: Page) {
	await expect
		.poll(() =>
			page.locator(".map-frame").evaluate((frame) => {
				const root = frame.closest<HTMLElement>(".game-frame");
				const svg = frame.querySelector<SVGSVGElement>(".town-map");
				if (!root || !svg) return false;
				const rect = frame.getBoundingClientRect();
				const bounds = svg.getBoundingClientRect();
				const view = svg.viewBox.baseVal;
				return (
					(["x", "y", "width", "height"] as const).every(
						(key) =>
							Math.abs(
								Number.parseFloat(
									root.style.getPropertyValue(`--lk-scene-${key}`),
								) - rect[key],
							) < 0.5,
					) &&
					rect.width > 0 &&
					rect.height > 0 &&
					Math.abs(bounds.width - rect.width) < 0.5 &&
					Math.abs(bounds.height - rect.height) < 0.5 &&
					[view.x, view.y, view.width, view.height].every(Number.isFinite) &&
					view.width > 0 &&
					view.height > 0 &&
					root.querySelector(".lk-scene") === frame
				);
			}),
		)
		.toBe(true);
}

test("phone-to-desktop resize keeps map marker targets at their screen size", async ({
	page,
}) => {
	await page.setViewportSize({ width: 360, height: 690 });
	await page.goto("/");
	await enterLocalTown(page);
	await expect(page.locator(".town-ready")).toBeVisible();
	const widths = () =>
		page
			.locator(".map-person,.map-cluster")
			.evaluateAll((nodes) =>
				nodes.map((node) => node.getBoundingClientRect().width),
			);
	await measuredMap(page);
	await expect.poll(async () => Math.max(...(await widths()))).toBeLessThan(55);
	await page.setViewportSize({ width: 1280, height: 800 });
	await measuredMap(page);
	await expect
		.poll(async () => Math.max(...(await widths())), {
			timeout: 200,
			intervals: [20],
		})
		.toBeLessThan(55);
	await page.setViewportSize({ width: 768, height: 1024 });
	await measuredMap(page);
	await expect
		.poll(async () => Math.min(...(await widths())), {
			timeout: 200,
			intervals: [20],
		})
		.toBeGreaterThanOrEqual(43.5);
});

test("shared measurements follow current map lifetime without owning focus or history", async ({
	page,
}) => {
	await page.setViewportSize({ width: 360, height: 690 });
	await page.goto("/");
	await enterLocalTown(page);
	await expect(page.locator(".town-ready")).toBeVisible();
	await measuredMap(page);
	const history = await page.evaluate(() => ({
		length: window.history.length,
		state: window.history.state,
	}));
	const opener = page.locator(".neighbour-strip [data-person-id]").first();
	await opener.click();
	await expect(
		page.getByRole("button", { name: "Close person details", exact: true }),
	).toBeVisible();
	await measuredMap(page);
	await page
		.getByRole("button", { name: "Close person details", exact: true })
		.click();
	await expect(opener).toBeFocused();
	await measuredMap(page);
	await opener.click();
	await page
		.getByRole("button", { name: "Close person details", exact: true })
		.evaluate((button) => {
			(button as HTMLElement).click();
			document
				.querySelector<HTMLElement>(
					".game-topbar button[aria-label='Game menu']",
				)
				?.focus();
		});
	await expect(
		page.getByRole("button", { name: "Game menu", exact: true }),
	).toBeFocused();
	await openSaves(page);
	await page.getByRole("dialog", { name: /^Game menu/ }).press("Escape");
	await expect(
		page.getByRole("dialog", { name: /^Game menu/ }),
	).not.toBeVisible();
	// Closing the person sheet changes the measured map; markers animate to
	// their new positions and can cross before their final hit targets separate.
	await expect
		.poll(() =>
			page
				.locator(".map-person,.map-cluster")
				.first()
				.evaluate((element) => {
					const rect = element.getBoundingClientRect();
					return element.contains(
						document.elementFromPoint(
							rect.x + rect.width / 2,
							rect.y + rect.height / 2,
						),
					);
				}),
		)
		.toBe(true);
	await openSaves(page);
	await page.locator(".session-menu .menu-debug > summary").click();
	await page
		.getByRole("button", {
			name: "Restore, import or start from a seed",
			exact: true,
		})
		.click();
	await expect(page.locator(".map-frame")).toHaveCount(0);
	const retired = await page.locator(".game-frame").getAttribute("style");
	await page.setViewportSize({ width: 1280, height: 800 });
	// A disconnected controller must not keep writing the surviving title root.
	await page.evaluate(
		() =>
			new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
			),
	);
	expect(await page.locator(".game-frame").getAttribute("style")).toBe(retired);
	await enterLocalTown(page);
	await closeSaves(page);
	await expect(page.locator(".map-frame")).toHaveCount(1);
	await expect(page.locator(".game-topbar")).toHaveCount(1);
	await expect(page.locator(".lk-scene")).toHaveCount(1);
	await measuredMap(page);
	await page.setViewportSize({ width: 360, height: 690 });
	await measuredMap(page);
	expect(
		await page.evaluate(() => ({
			length: window.history.length,
			state: window.history.state,
		})),
	).toEqual(history);
});
