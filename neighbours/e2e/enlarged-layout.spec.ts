import { expect, type Locator, type Page, test } from "./clock-fixture";
import { openSaves } from "./session-helpers";

/** Emulate text-only resize for every rendered element, including px rules.
 * Root-font changes alone miss fixed-size labels. Geometry stays in CSS pixels.
 */
async function doubleText(page: Page) {
	return page.evaluate(() => {
		const elements = [...document.querySelectorAll<HTMLElement>("body *")];
		for (const element of elements) {
			element.dataset.beforeTextResize ??= element.style.fontSize;
			element.style.fontSize = element.dataset.beforeTextResize;
		}
		const sizes = elements.map((element) => ({
			element,
			size: Number.parseFloat(getComputedStyle(element).fontSize),
		}));
		for (const { element, size } of sizes) {
			element.style.fontSize = `${size * 2}px`;
		}
		const target = document.querySelector(".town-verbs button");
		if (!target) throw Error("Town controls are missing");
		return Number.parseFloat(getComputedStyle(target).fontSize);
	});
}

async function reachable(target: Locator) {
	// Center the control; nearest-edge scrolling can leave a fractional pixel clipped.
	await target.evaluate((element) =>
		element.scrollIntoView({ block: "center", inline: "nearest" }),
	);
	await expect(target).toBeInViewport({ ratio: 1 });
	await expect(target).toBeVisible();
	expect(
		await target.evaluate((element) => {
			const r = element.getBoundingClientRect();
			const hit = document.elementFromPoint(
				r.x + r.width / 2,
				r.y + r.height / 2,
			);
			return {
				text: element.textContent,
				hit: !!hit && element.contains(hit),
				clipped:
					element.scrollHeight > element.clientHeight + 1 ||
					element.scrollWidth > element.clientWidth + 1,
			};
		}),
	).toMatchObject({ hit: true, clipped: false });
}

test("doubled computed text keeps town controls and scrolled Journal reachable", async ({
	page,
}) => {
	await page.setViewportSize({ width: 360, height: 690 });
	await page.emulateMedia({ colorScheme: "light" });
	await page.goto("/?lab=1");
	await page
		.getByRole("button", { name: "Enter Alder Quay", exact: true })
		.click();
	await expect(page.locator(".town-ready")).toBeVisible();
	const base = await page
		.locator(".town-verbs button")
		.first()
		.evaluate((e) => Number.parseFloat(getComputedStyle(e).fontSize));
	expect(await doubleText(page)).toBeCloseTo(base * 2);
	await reachable(page.getByRole("button", { name: "Game menu", exact: true }));
	for (const button of await page.locator(".town-verbs button").all())
		await reachable(button);
	await expect(page.locator(".game-scene")).toBeInViewport({ ratio: 1 });
	expect(
		await page.locator(".game-scene").evaluate((e) => e.clientHeight),
	).toBeGreaterThanOrEqual(120);
	await openSaves(page);
	await page.getByRole("button", { name: /^Read the journal/ }).click();
	await doubleText(page);
	const sheet = page.locator(".game-sheet");
	await sheet.evaluate((e) => {
		e.scrollTop = e.scrollHeight;
	});
	expect(await sheet.evaluate((e) => e.scrollTop)).toBeGreaterThan(0);
	await reachable(
		sheet.getByRole("button", { name: "Close Journal", exact: true }),
	);
	await expect(
		sheet.getByRole("heading", { name: "Journal", exact: true }),
	).toBeInViewport({ ratio: 1 });
	await page.setViewportSize({ width: 320, height: 540 });
	await page.emulateMedia({ colorScheme: "dark" });
	await sheet
		.getByRole("button", { name: "Close Journal", exact: true })
		.scrollIntoViewIfNeeded();
	await reachable(
		sheet.getByRole("button", { name: "Close Journal", exact: true }),
	);
	await sheet
		.getByRole("button", { name: "Close Journal", exact: true })
		.click();
	for (const button of await page.locator(".town-verbs button").all()) {
		await button.scrollIntoViewIfNeeded();
		await reachable(button);
	}
	await page.setViewportSize({ width: 1280, height: 800 });
	expect(await doubleText(page)).toBeCloseTo(40);
	await reachable(page.getByRole("button", { name: "Game menu", exact: true }));
	for (const button of await page.locator(".town-verbs button").all())
		await reachable(button);
	await openSaves(page);
	await page.getByRole("button", { name: /^Read the journal/ }).click();
	await doubleText(page);
	await sheet.evaluate((e) => {
		e.scrollTop = e.scrollHeight;
	});
	expect(await sheet.evaluate((e) => e.scrollTop)).toBeGreaterThan(0);
	await reachable(
		sheet.getByRole("button", { name: "Close Journal", exact: true }),
	);
	await expect(
		sheet.getByRole("heading", { name: "Journal", exact: true }),
	).toBeInViewport({ ratio: 1 });
});
