import { test as base, type Page } from "@playwright/test";

export * from "@playwright/test";

const prepared = new WeakSet<Page>();
export async function prepareClock(page: Page) {
	if (prepared.has(page)) return;
	await page.clock.install();
	await page.clock.pauseAt(new Date());
	prepared.add(page);
}
/** Test-side clock control. All steps still enter the application's real timer and FIFO. */
export const test = base.extend({
	page: async ({ page }, use) => {
		await prepareClock(page);
		await page.context().addInitScript(() => {
			Object.assign(window, { townStates: 0, townNow: 0, townStepPosts: 0 });
			const NativeWorker = window.Worker;
			window.Worker = class extends NativeWorker {
				postMessage(
					message: unknown,
					options?: StructuredSerializeOptions | Transferable[],
				) {
					if ((message as { type?: string }).type === "step")
						(window as unknown as { townStepPosts: number }).townStepPosts++;
					if (Array.isArray(options)) super.postMessage(message, options);
					else super.postMessage(message, options);
				}
				set onmessage(handler:
					| ((this: Worker, event: MessageEvent) => unknown)
					| null) {
					super.onmessage = handler
						? (event) => {
								if (
									event.data.type === "state" ||
									event.data.type === "ready"
								) {
									const state = window as unknown as {
										townStates: number;
										townNow: number;
									};
									state.townStates++;
									state.townNow = event.data.view.now;
								}
								handler.call(this, event);
							}
						: null;
				}
				get onmessage() {
					return super.onmessage;
				}
			};
		});
		await use(page);
	},
});
export async function postStep(page: Page) {
	await prepareClock(page);
	const before = await page.evaluate(() => ({
		posts: (window as unknown as { townStepPosts: number }).townStepPosts,
		now: (window as unknown as { townNow: number }).townNow,
	}));
	for (let i = 0; i < 80; i++) {
		await page.clock.fastForward(100);
		if (
			(await page.evaluate(
				() => (window as unknown as { townStepPosts: number }).townStepPosts,
			)) > before.posts
		)
			break;
	}
	await base.expect
		.poll(() =>
			page.evaluate(
				() => (window as unknown as { townStepPosts: number }).townStepPosts,
			),
		)
		.toBe(before.posts + 1);
	return before;
}
export async function step(page: Page) {
	const before = await postStep(page);
	await base.expect
		.poll(() =>
			page.evaluate(() => (window as unknown as { townNow: number }).townNow),
		)
		.toBe(before.now + 15);
	const minute = (before.now + 15) % 1440;
	await base
		.expect(page.locator(".town-time strong"))
		.toHaveText(
			`${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`,
		);
}
