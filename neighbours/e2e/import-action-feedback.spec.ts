import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { expect, type Page, step, type TestInfo, test } from "./clock-fixture";
import { enterLocalTown } from "./local-fixture";

import {
	closeSaves,
	openDownload,
	openOtherWays,
	openSaves,
	showTab,
} from "./session-helpers";

async function exportPacket(page: Page, info: TestInfo, name: string) {
	await openSaves(page);
	const link = page.getByRole("link", { name: /Download save/ });
	const old = (await link.count()) ? await link.getAttribute("href") : null;
	await openDownload(page);
	await page
		.getByRole("button", { name: "Keep a copy of this run", exact: true })
		.click();
	await expect
		.poll(() => link.getAttribute("href").catch(() => null))
		.not.toBe(old);
	const download = page.waitForEvent("download");
	await link.click();
	const path = info.outputPath(`${name}.json.gz`);
	await (await download).saveAs(path);
	return JSON.parse(gunzipSync(await readFile(path)).toString("utf8"));
}
async function importPacket(page: Page, value: unknown) {
	const before = await page.evaluate(
		() => (window as unknown as { townStates: number }).townStates,
	);
	await openSaves(page);
	await openOtherWays(page);
	await page.getByLabel("Import town save").setInputFiles({
		name: "town.json",
		mimeType: "application/json",
		buffer: Buffer.from(JSON.stringify(value)),
	});
	if (
		value &&
		typeof value === "object" &&
		"schema" in value &&
		value.schema === "neighbours/concordia@1"
	)
		await expect
			.poll(() =>
				page.evaluate(
					() => (window as unknown as { townStates: number }).townStates,
				),
			)
			.toBeGreaterThan(before);
}

test("worker rejects JSON arrays and invalid objects with truthful recovery and exact continuation", async ({
	page,
}, info) => {
	await page.goto("/");
	await enterLocalTown(page);
	await expect(page.locator(".town-ready")).toBeVisible();
	const original = await exportPacket(page, info, "original");
	const link = page.getByRole("link", { name: /Download save/ });
	for (const [index, invalid] of [[], { schema: "invalid" }].entries()) {
		const href = await link.getAttribute("href");
		await importPacket(page, invalid);
		await expect(page.getByRole("alert")).toContainText(
			"This save could not be loaded. Your current town is unchanged.",
		);
		await expect(page.getByRole("alert")).not.toContainText("You can reload");
		await openDownload(page);
		await expect(link).toHaveAttribute("href", href ?? "missing");
		expect(await exportPacket(page, info, `rejected-${index}`)).toEqual(
			original,
		);
	}
	const close = page.getByRole("dialog", { name: /^Game menu/ });
	if (await close.isVisible()) await page.keyboard.press("Escape");
	await closeSaves(page);
	await step(page);
	const continuation = await exportPacket(
		page,
		info,
		"continued-after-rejection",
	);
	await importPacket(page, original);
	await expect(link).toHaveCount(0);
	if (await close.isVisible()) await page.keyboard.press("Escape");
	await closeSaves(page);
	await step(page);
	expect(await exportPacket(page, info, "restored-control")).toEqual({
		...continuation,
		castLocal: { ...continuation.castLocal, file: true },
	});
});

type InterventionGate = {
	hold: boolean;
	held: (() => void)[];
	commands: number;
	rejectNext: boolean;
};

test("one pending intervention spends one credit and a later deliberate repeat remains available", async ({
	page,
}, info) => {
	await page.addInitScript(() => {
		const gate: InterventionGate = {
			hold: false,
			held: [],
			commands: 0,
			rejectNext: false,
		};
		Object.assign(window, { interventionGate: gate });
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
			postMessage(message: { type: string }) {
				if (message.type === "intervene") {
					gate.commands++;
					if (gate.rejectNext) {
						gate.rejectNext = false;
						queueMicrotask(() =>
							this.onmessage?.call(
								this,
								new MessageEvent("message", {
									data: {
										type: "error",
										message: "Intervention rejected by test gate.",
									},
								}),
							),
						);
						return;
					}
				}
				super.postMessage(message);
			}
		};
	});
	await page.goto("/");
	await enterLocalTown(page);
	await expect(page.locator(".town-ready")).toBeVisible();
	const original = await exportPacket(page, info, "before-tools");
	const close = page.getByRole("dialog", { name: /^Game menu/ });
	if (await close.isVisible()) await page.keyboard.press("Escape");
	await closeSaves(page);
	await showTab(page, "Help");
	await page.evaluate(() => {
		(
			window as unknown as { interventionGate: InterventionGate }
		).interventionGate.hold = true;
	});
	const lend = page.getByRole("button", { name: /^Lend tools/ });
	await lend.click();
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					(window as unknown as { interventionGate: InterventionGate })
						.interventionGate.held.length,
			),
		)
		.toBe(1);
	// Dispatching another click while the first reply is delayed must not spend a second credit.
	await lend.dispatchEvent("click", { detail: 1 });
	expect(
		await page.evaluate(
			() =>
				(window as unknown as { interventionGate: InterventionGate })
					.interventionGate.commands,
		),
	).toBe(1);
	// The menu becomes available only after the pending intervention is acknowledged.
	await page
		.getByRole("button", { name: /^Game menu(?: · day \d+)?$/ })
		.click();
	await expect(
		page.getByRole("dialog", { name: /^Game menu(?: · day \d+)?$/ }),
	).not.toBeVisible();
	await page.evaluate(() => {
		const gate = (window as unknown as { interventionGate: InterventionGate })
			.interventionGate;
		gate.hold = false;
		for (const deliver of gate.held.splice(0)) deliver();
	});
	await expect(close).toBeVisible();
	const pending = await exportPacket(page, info, "acknowledged-tools");
	expect(pending.runtime.controls).toBe(original.runtime.controls - 1);
	if (await close.isVisible()) await page.keyboard.press("Escape");
	await showTab(page, "Help");
	await expect(page.locator(".intervention-result")).toContainText(
		"The tools were added",
	);
	await expect(lend).toBeEnabled();
	// A rejected command clears its pending status and never invents a success receipt.
	await page.evaluate(() => {
		(
			window as unknown as { interventionGate: InterventionGate }
		).interventionGate.rejectNext = true;
	});
	await lend.click();
	await expect(page.getByRole("alert")).toContainText(
		"The town could not complete that action.",
	);
	await expect(page.locator(".intervention-result")).toHaveCount(0);
	await expect(lend).toBeEnabled();
	await lend.click();
	await expect(page.locator(".intervention-result")).toContainText(
		"The tools were added",
	);
	const repeated = await exportPacket(page, info, "deliberate-repeat");
	expect(repeated.runtime.controls).toBe(original.runtime.controls - 2);
});
