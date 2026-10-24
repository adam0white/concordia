import { test as base } from "@playwright/test";

export * from "@playwright/test";
/** Local regression fixture: explicitly select the labelled lab-only local controller.
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
		const prepareLocal = async () => {
			if (
				new URL(page.url()).searchParams.get("lab") !== "1" ||
				!(await page.locator(".welcome-screen").isVisible())
			)
				return;
			await page
				.getByRole("button", { name: "Game menu", exact: true })
				.click();
			await page.locator(".cast-menu > summary").click();
			await page
				.getByLabel("Keep people in this browser", { exact: true })
				.uncheck();
			await page.locator(".cast-menu > summary").click();
			await page.keyboard.press("Escape");
		};
		const goto = page.goto.bind(page);
		page.goto = async (...args) => {
			const result = await goto(...args);
			await prepareLocal();
			return result;
		};
		const reload = page.reload.bind(page);
		page.reload = async (...args) => {
			const result = await reload(...args);
			await prepareLocal();
			return result;
		};
		await use(page);
	},
});
