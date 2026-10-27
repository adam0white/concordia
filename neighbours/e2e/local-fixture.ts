import { test as base, type Page } from "@playwright/test";

export * from "@playwright/test";
/** Local regression fixture: explicitly select the public local controller.
 * This exercises the real Python/HF town; it does not establish shared cast admission.
 * The ordinary admission-failure regression uses the unmodified base fixture instead.
 */
export const test = base.extend({
	page: async ({ page }, use) => {
		if (process.env.NEIGHBOURS_NO_SCREENSHOTS === "1") {
			// Task evidence has reached its screenshot cap. Functional DOM assertions still run.
			page.screenshot = async () => Buffer.alloc(0);
		}
		await page.route("https://human.adamwhite.work/**", async (route) => {
			if (route.request().method() === "POST")
				await route.fulfill({ status: 204 });
			else await route.continue();
		});
		await use(page);
	},
});

/** Local seeded controls are separate from automatic cast admission. Resume keeps
 * the saved chapter; a fresh run uses the same public local-start action as a visitor.
 */
export async function enterLocalTown(page: Page) {
	const other = page.locator(".other-ways-in");
	if (!(await other.isVisible())) {
		const resume = page.getByRole("button", { name: /^Return to Mill Bridge/ });
		if (await resume.isVisible()) {
			await resume.click();
			return;
		}
		await page.getByRole("button", { name: /^Other ways in/ }).click();
	}
	await page
		.getByRole("button", { name: "Start a fresh local town", exact: true })
		.click();
}
