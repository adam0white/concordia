import { test as base, expect, type Page } from "@playwright/test";

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
		// Welcome reads IndexedDB asynchronously. Read the same save before choosing
		// between resume and fresh; the first rendered label may still say Enter.
		const saved = await page.evaluate(async () => {
			const db = await new Promise<IDBDatabase>((resolve, reject) => {
				const request = indexedDB.open("alder-quay", 1);
				request.onupgradeneeded = () => {
					if (!request.result.objectStoreNames.contains("saves"))
						request.result.createObjectStore("saves");
				};
				request.onsuccess = () => resolve(request.result);
				request.onerror = () => reject(request.error);
			});
			try {
				return await new Promise<boolean>((resolve, reject) => {
					const request = db
						.transaction("saves")
						.objectStore("saves")
						.get("latest");
					request.onsuccess = () => resolve(request.result !== undefined);
					request.onerror = () => reject(request.error);
				});
			} finally {
				db.close();
			}
		});
		const resume = page.getByRole("button", {
			name: /^(Enter|Return to) Mill Bridge/,
		});
		if (saved) {
			await resume.click();
			await expect(page.locator(".town-ready")).toBeVisible();
			return;
		}
		await page.getByRole("button", { name: /^Other ways in/ }).click();
	}
	await page
		.getByRole("button", { name: "Start a fresh local town", exact: true })
		.click();
	await expect(page.locator(".town-ready")).toBeVisible();
}
