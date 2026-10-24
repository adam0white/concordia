import { expect, test } from "./clock-fixture";
import { showTab } from "./session-helpers";

test("real recorded bench, route and upstream GM studies render on mobile without loading the large bench trace", async ({
	page,
}) => {
	await page.setViewportSize({ width: 320, height: 740 });
	const requests: string[] = [];
	page.on("request", (request) => requests.push(request.url()));
	await page.goto("/?lab=1");
	await page
		.getByRole("button", { name: /^(Enter|Return to) Alder Quay/ })
		.click();
	await expect(page.locator(".town-ready")).toBeVisible({ timeout: 60000 });
	await showTab(page, "Recorded studies");
	const studies = page.getByRole("region", {
		name: "Recorded studies",
		exact: true,
	});
	const choice = studies.getByRole("combobox", { name: "Study", exact: true });
	await choice.selectOption("bench");
	const bench = studies.getByRole("region", {
		name: "Town bench study",
		exact: true,
	});
	await expect(bench).toBeVisible();
	await expect(
		studies.getByLabel("Frozen town case").locator("option"),
	).toHaveCount(9);
	await expect(
		bench.getByRole("row", {
			name: "Returned to Bilal Returned Returned",
			exact: true,
		}),
	).toBeVisible();
	await studies.getByLabel("Frozen town case").selectOption("6");
	await expect(
		bench.getByRole("row", {
			name: "Returned to Bilal No return in this interval Returned",
			exact: true,
		}),
	).toBeVisible();
	await expect(
		studies.getByText(/^Seed 101: no natural case in 40 days\./),
	).toHaveCount(0);
	expect(
		requests.some((url) => url.endsWith("/bench-choices-summary.json")),
	).toBe(true);
	expect(requests.some((url) => url.endsWith("/bench-choices.json"))).toBe(
		false,
	);
	await choice.selectOption("routes");
	const routes = studies.getByRole("region", {
		name: "Received future access study",
		exact: true,
	});
	await expect(routes).toBeVisible();
	await expect(routes.locator("tbody tr")).toHaveCount(9);
	await expect(
		routes.getByRole("row", { name: /Request refused.*No goal progress/ }),
	).toBeVisible();
	await studies.getByLabel("Control setting").selectOption("1");
	await expect(routes.locator("tbody tr")).toHaveCount(9);
	await choice.selectOption("bench-gm");
	await expect(
		studies.getByText("Seed 101 historical exclusion", { exact: true }),
	).toBeVisible();
	await expect(
		studies.getByText("Not applied; no resident receipt or consent claimed", {
			exact: true,
		}),
	).toBeVisible();
	await expect(studies.locator(".study-results > div")).toHaveCount(7);
	await expect(
		studies
			.locator(".study-results > div")
			.filter({ hasText: "Actual model calls" }),
	).toHaveText("Actual model calls2");
	await expect(
		studies
			.locator(".study-results > div")
			.filter({ hasText: "Replay model calls" }),
	).toHaveText("Replay model calls0");
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= innerWidth,
		),
	).toBe(true);
});
