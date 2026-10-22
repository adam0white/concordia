import { expect, postStep, step, test } from "./clock-fixture";
import { closeSaves, openSaves } from "./session-helpers";

test("automatic pacing hides clock controls and the menu holds", async ({
	page,
}) => {
	await page.goto("/");
	await page
		.getByRole("button", { name: /^(Enter|Return to) Alder Quay/ })
		.click();
	await expect(page.locator(".state-words")).toBeVisible({ timeout: 60000 });
	await expect(
		page.getByRole("button", { name: /^(Play|Pause|Step)/ }),
	).toHaveCount(0);
	await expect(page.getByRole("button", { name: /^Next/ })).toHaveCount(0);
	await expect(
		page.getByRole("combobox", { name: "Playback speed" }),
	).toHaveCount(0);
	const before = await page.evaluate(
		() => (window as unknown as { townNow: number }).townNow,
	);
	await step(page);
	expect(
		await page.evaluate(
			() => (window as unknown as { townNow: number }).townNow,
		),
	).toBe(before + 15);
	await openSaves(page);
	const held = await page.evaluate(
		() => (window as unknown as { townNow: number }).townNow,
	);
	await page.clock.fastForward(30000);
	expect(
		await page.evaluate(
			() => (window as unknown as { townNow: number }).townNow,
		),
	).toBe(held);
	await closeSaves(page);
	await step(page);
	expect(
		await page.evaluate(
			() => (window as unknown as { townNow: number }).townNow,
		),
	).toBe(held + 15);
});

test("the menu drains an in-flight story round and preserves its remaining reading time", async ({
	page,
}) => {
	await page.addInitScript(() => {
		const gate = { hold: false, held: [] as (() => void)[] };
		Object.assign(window, { readingGate: gate });
		const NativeWorker = window.Worker;
		window.Worker = class extends NativeWorker {
			constructor(url: string | URL, options?: WorkerOptions) {
				super(url, options);
				this.addEventListener("message", (event: MessageEvent) => {
					if (!gate.hold || event.data.type !== "state") return;
					event.stopImmediatePropagation();
					gate.held.push(() => this.onmessage?.call(this, event));
				});
			}
		};
	});
	await page.goto("/");
	await page
		.getByRole("button", { name: /^(Enter|Return to) Alder Quay/ })
		.click();
	await expect(page.locator(".state-words")).toBeVisible({ timeout: 60000 });
	for (let i = 0; i < 5; i++) await step(page);
	await page.evaluate(() => {
		(window as unknown as { readingGate: { hold: boolean } }).readingGate.hold =
			true;
	});
	const before = await postStep(page);
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					(window as unknown as { readingGate: { held: unknown[] } })
						.readingGate.held.length,
			),
		)
		.toBe(1);
	const menu = page.getByRole("button", { name: /^Game menu(?: · day \d+)?$/ });
	await menu.click();
	await expect(menu).toBeDisabled();
	await expect(
		page.getByRole("dialog", { name: /^Game menu(?: · day \d+)?$/ }),
	).not.toBeVisible();
	await page.clock.fastForward(30000);
	expect(
		await page.evaluate(
			() => (window as unknown as { townStepPosts: number }).townStepPosts,
		),
	).toBe(before.posts + 1);
	await page.evaluate(() => {
		const gate = (
			window as unknown as {
				readingGate: { hold: boolean; held: (() => void)[] };
			}
		).readingGate;
		gate.hold = false;
		for (const release of gate.held.splice(0)) release();
	});
	await expect(
		page.getByRole("dialog", { name: /^Game menu(?: · day \d+)?$/ }),
	).toBeVisible();
	const held = await page.locator(".town-time strong").innerText();
	await page.clock.fastForward(30000);
	expect(await page.locator(".town-time strong").innerText()).toBe(held);
	await closeSaves(page);
	await page.clock.runFor(5000);
	expect(await page.locator(".town-time strong").innerText()).toBe(held);
	await step(page);
	expect(await page.locator(".town-time strong").innerText()).not.toBe(held);
});
