import { expect, step, test } from "./clock-fixture";
import { closeSaves, openOtherWays, openSaves } from "./session-helpers";

test.use({
	viewport: { width: 360, height: 690 },
	hasTouch: true,
	isMobile: true,
});

test("walking acknowledges without duplicate inputs and clears after replacement", async ({
	page,
}) => {
	await page.addInitScript(() => {
		Object.assign(window, { walkCommands: 0 });
		const NativeWorker = window.Worker;
		window.Worker = class extends NativeWorker {
			postMessage(message: unknown) {
				const command = message as {
					type?: string;
					intervention?: { kind?: string };
				};
				if (
					command.type === "intervene" &&
					command.intervention?.kind === "player-move"
				) {
					const counter = window as unknown as Window & {
						walkCommands: number;
					};
					counter.walkCommands++;
				}
				super.postMessage(message);
			}
		};
	});
	await page.goto("/");
	await page
		.getByRole("button", { name: /^(Enter|Return to) Alder Quay/ })
		.click();
	const play = page.getByRole("button", { name: /^Game menu(?: · day \d+)?$/ });
	await expect(page.locator(".town-ready")).toBeVisible({ timeout: 120000 });
	const before = await page.locator(".town-time").innerText();
	await page.locator('[data-map-place="hall"]').tap();
	const walk = page.getByRole("button", { name: /Walk to Flooded hall ·/ });
	// Same-render events expose duplicate submissions before disabled state arrives.
	await walk.evaluate((button: HTMLButtonElement) => {
		button.click();
		button.click();
	});
	await expect(page.locator(".game-state")).toContainText(
		"You set off automatically",
	);
	await expect(page.locator(".state-words")).toContainText(
		"You set off automatically",
	);
	await expect(walk).toBeDisabled();
	expect(await page.locator(".town-time").innerText()).toBe(before);
	expect(
		await page.evaluate(
			() =>
				(window as unknown as Window & { walkCommands: number }).walkCommands,
		),
	).toBe(1);
	await expect(play).toBeVisible();
	await step(page);
	await expect(page.locator(".game-state")).toContainText(
		"You keep walking automatically",
	);
	await openSaves(page);
	await openOtherWays(page);
	await page.getByLabel("Start from a seed").fill("73");
	await page.getByRole("button", { name: "Start", exact: true }).click();
	await closeSaves(page);
	await expect(page.locator(".game-state")).not.toContainText("Press Play to");
});

test("a held worker reply shows pending immediately without moving the menu", async ({
	page,
}) => {
	await page.addInitScript(() => {
		const gate = { hold: false, held: [] as (() => void)[] };
		Object.assign(window, { pendingActionGate: gate });
		const NativeWorker = window.Worker;
		window.Worker = class extends NativeWorker {
			constructor(url: string | URL, options?: WorkerOptions) {
				super(url, options);
				this.addEventListener("message", (event: MessageEvent) => {
					if (event.data.type !== "state" || !gate.hold) return;
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
	const play = page.getByRole("button", { name: /^Game menu(?: · day \d+)?$/ });
	await expect(page.locator(".town-ready")).toBeVisible({ timeout: 120000 });
	await page.locator('[data-map-place="hall"]').tap();
	const before = await play.boundingBox();
	await page.evaluate(() => {
		(
			window as unknown as { pendingActionGate: { hold: boolean } }
		).pendingActionGate.hold = true;
	});
	const walk = page.getByRole("button", { name: /Walk to Flooded hall ·/ });
	await walk.tap();
	await expect(page.locator(".state-words")).toContainText(
		"Requesting your action…",
	);
	await expect(page.locator(".state-words")).toContainText(
		"Requesting your action…",
	);
	await expect(page.locator(".state-words")).not.toContainText("Press Play");
	await expect(walk).toBeDisabled();
	const pending = await play.boundingBox();
	expect(pending?.x).toBe(before?.x);
	expect(pending?.y).toBe(before?.y);
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					(window as unknown as { pendingActionGate: { held: unknown[] } })
						.pendingActionGate.held.length,
			),
		)
		.toBeGreaterThan(0);
	await page.evaluate(() => {
		const gate = (
			window as unknown as {
				pendingActionGate: { hold: boolean; held: (() => void)[] };
			}
		).pendingActionGate;
		gate.hold = false;
		for (const deliver of gate.held.splice(0)) deliver();
	});
	await expect(page.locator(".state-words")).toContainText(
		"You set off automatically",
	);
	await expect(page.locator(".state-words")).not.toContainText(
		"Requesting your action…",
	);
	const accepted = await play.boundingBox();
	expect(accepted?.x).toBe(before?.x);
	expect(accepted?.y).toBe(before?.y);
});
