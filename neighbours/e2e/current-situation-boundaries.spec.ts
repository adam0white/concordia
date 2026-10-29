/** Current4 public entry guard. Historical scripted old-roster hall/bench/week
 * trajectories remain archived; this creates no conditional hall or forced learner.
 * Actual native/physical current continuation is checked by the leased control.
 */
import { expect, test } from "./clock-fixture";
import { enterLocalTown } from "./local-fixture";

test("a fresh public town keeps the damaged hall closed and exposes ordinary controls", async ({
	page,
}) => {
	await page.goto("/");
	await enterLocalTown(page);
	await expect(page.locator(".town-ready")).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Game menu", exact: true }),
	).toBeVisible();
	await expect(
		page.getByRole("img", { name: "No hall choice available", exact: true }),
	).toBeVisible();
	await expect(page.getByText("Request received", { exact: true })).toHaveCount(
		0,
	);
	await expect(page.getByText("Bench reserved", { exact: true })).toHaveCount(
		0,
	);
});
