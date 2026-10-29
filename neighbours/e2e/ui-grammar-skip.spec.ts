import { mkdir } from "node:fs/promises";
import { enterLocalTown, expect, test } from "./local-fixture";

for (const width of [360, 1280]) {
	test(`Skip stops, completes the walk and holds a real conversation at ${width}`, async ({
		page,
	}) => {
		test.setTimeout(120000);
		await page.setViewportSize({ width, height: width === 360 ? 690 : 800 });
		await page.addInitScript(() => {
			localStorage.setItem("hf-lab-recording-off", "1");
			const NativeWorker = window.Worker;
			window.Worker = class extends NativeWorker {
				set onmessage(handler:
					| ((this: Worker, event: MessageEvent) => unknown)
					| null) {
					super.onmessage = handler
						? (event) => {
								// Model a slow device reply without changing the worker's actual rounds.
								if (event.data.type === "state")
									setTimeout(() => handler.call(this, event), 150);
								else handler.call(this, event);
							}
						: null;
				}
				get onmessage() {
					return super.onmessage;
				}
			};
		});
		await page.goto("/");
		await enterLocalTown(page);
		await expect(page.locator(".town-ready")).toBeVisible({ timeout: 120000 });
		await page.locator('.neighbour-strip [data-person-id="ravi"]').click();
		await page
			.getByRole("button", { name: /Walk to Workshop to talk/ })
			.click();
		await page
			.getByRole("button", { name: "Close person details", exact: true })
			.click();
		await expect(
			page.getByRole("button", { name: "Skip to the next event", exact: true }),
		).toBeVisible();
		await page
			.getByRole("button", { name: "Skip to the next event", exact: true })
			.click();
		await expect(
			page.getByRole("button", { name: "Stop advancing", exact: true }),
		).toHaveText("Stop");
		await page
			.getByRole("button", { name: "Stop advancing", exact: true })
			.click();
		await expect(
			page.getByRole("button", { name: "Skip to the next event", exact: true }),
		).toBeVisible();
		for (let i = 0; i < 8; i++) {
			await page.locator('.neighbour-strip [data-person-id="ravi"]').click();
			const talk = page.getByRole("button", {
				name: "Talk to Rafi",
				exact: true,
			});
			// Travelling residents have an explanation instead of a Talk button.
			// Do not wait for an absent button while the test owns time advancement.
			if ((await talk.isVisible()) && (await talk.isEnabled())) break;
			await page
				.getByRole("button", { name: "Close person details", exact: true })
				.click();
			await page
				.getByRole("button", { name: "Skip to the next event", exact: true })
				.click();
			await expect(
				page.getByRole("button", {
					name: "Skip to the next event",
					exact: true,
				}),
			).toBeVisible();
		}
		await expect(page.locator(".town-time strong")).not.toHaveText("08:00");
		await page
			.getByRole("button", { name: "Talk to Rafi", exact: true })
			.click();
		await expect(
			page.locator("#town-conversation [data-affordance-id]").first(),
		).toBeVisible();
		const before = await page.locator(".town-time strong").textContent();
		await page.waitForTimeout(5000);
		await expect(page.locator(".town-time strong")).toHaveText(before ?? "");
		await expect(page.locator(".state-words")).toContainText(
			"Time pauses while you talk",
		);
		await expect(
			page.getByRole("button", { name: "Ask Rafi", exact: true }),
		).toBeInViewport();
		expect(
			await page.evaluate(
				() =>
					(document.scrollingElement?.scrollHeight ?? Infinity) <= innerHeight,
			),
		).toBe(true);
		if (process.env.NEIGHBOURS_EVIDENCE) {
			await mkdir(process.env.NEIGHBOURS_EVIDENCE, { recursive: true });
			await page.screenshot({
				path: `${process.env.NEIGHBOURS_EVIDENCE}/${width}-talk.png`,
			});
		}
	});
}
