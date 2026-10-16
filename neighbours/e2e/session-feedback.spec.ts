import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { expect, type Page, type TestInfo, test } from "@playwright/test";
import { closeSaves, openSaves, showTab } from "./session-helpers";

type Packet = { runtime: { seed: number; now: number } };
type SaveGate = {
	hold: boolean;
	held: (() => void)[];
	holdState: boolean;
	heldState: (() => void)[];
	restores: number;
};
async function pause(page: Page) {
	await closeSaves(page);
	const button = page.getByRole("button", { name: "Pause town", exact: true });
	if (await button.isVisible()) await button.click();
	await closeSaves(page);
	await expect(
		page.getByRole("button", { name: "Play town", exact: true }),
	).toBeVisible();
}
async function packet(
	page: Page,
	info: TestInfo,
	name: string,
): Promise<Packet> {
	await openSaves(page);
	const link = page.getByRole("link", { name: /Download save/ });
	const old = (await link.count()) ? await link.getAttribute("href") : null;
	await openSaves(page);
	await page.getByRole("button", { name: "Export", exact: true }).click();
	await expect
		.poll(() => link.getAttribute("href", { timeout: 500 }).catch(() => null))
		.not.toBe(old);
	await expect(link).toBeVisible();
	const pending = page.waitForEvent("download");
	await link.click();
	const path = info.outputPath(`${name}.json.gz`);
	await (await pending).saveAs(path);
	return JSON.parse(gunzipSync(await readFile(path)).toString("utf8"));
}
async function importPacket(page: Page, value: unknown) {
	await openSaves(page);
	await page.getByLabel("Import town save").setInputFiles({
		name: "town.json",
		mimeType: "application/json",
		buffer: Buffer.from(JSON.stringify(value)),
	});
}

async function installGate(page: Page) {
	await page.addInitScript(() => {
		const gate: SaveGate = {
			hold: false,
			held: [],
			holdState: false,
			heldState: [],
			restores: 0,
		};
		Object.assign(window, { sessionSaveGate: gate });
		const NativeWorker = window.Worker;
		window.Worker = class extends NativeWorker {
			constructor(url: string | URL, options?: WorkerOptions) {
				super(url, options);
				this.addEventListener("message", (event: MessageEvent) => {
					const held =
						event.data.type === "save" && gate.hold
							? gate.held
							: event.data.type === "state" && gate.holdState
								? gate.heldState
								: null;
					if (!held) return;
					event.stopImmediatePropagation();
					held.push(() => this.onmessage?.call(this, event));
				});
			}
			postMessage(message: { type: string }) {
				if (message.type === "restore") gate.restores++;
				super.postMessage(message);
			}
		};
	});
}

test("world replacement clears feedback and rejects delayed exports and superseded new-town backups", async ({
	page,
}, info) => {
	await installGate(page);
	await page.goto("/");
	await page.getByRole("button", { name: "Enter town", exact: true }).click();
	await closeSaves(page);
	await expect(
		page.getByRole("button", { name: "Play town", exact: true }),
	).toBeVisible();
	await pause(page);
	const original = await packet(page, info, "original");
	await showTab(page, "Help");
	await page.getByRole("button", { name: /^Restore public bus/ }).click();
	await expect(page.locator(".intervention-result")).toContainText(
		"Bus restored",
	);
	await showTab(page, "Inspector");
	await page
		.getByText("Compare futures · hypothetical branches", { exact: true })
		.click();
	await page
		.getByRole("button", { name: "Compare from here", exact: true })
		.click();
	await expect(
		page.getByText("Checkpoint & limits", { exact: true }),
	).toBeVisible();
	const changed = await packet(page, info, "changed");
	const oldLink = await page
		.getByRole("link", { name: /Download save/ })
		.getAttribute("href");
	await importPacket(page, { schema: "invalid" });
	await expect(page.getByRole("alert")).toBeVisible();
	await showTab(page, "Help");
	await expect(page.locator(".intervention-result")).toContainText(
		"Bus restored",
	);
	await showTab(page, "Inspector");
	await expect(
		page.getByText("Checkpoint & limits", { exact: true }),
	).toBeVisible();
	await openSaves(page);
	await expect(
		page.getByRole("link", { name: /Download save/ }),
	).toHaveAttribute("href", oldLink ?? "missing-download-link");
	expect(await packet(page, info, "failed-import-preserved")).toEqual(changed);
	await importPacket(page, original);
	await showTab(page, "Help");
	await expect(page.locator(".intervention-result")).toHaveCount(0);
	await showTab(page, "Inspector");
	await expect(
		page.getByText("Checkpoint & limits", { exact: true }),
	).toHaveCount(0);
	await openSaves(page);
	await expect(page.getByRole("link", { name: /Download save/ })).toHaveCount(
		0,
	);
	expect(await packet(page, info, "successful-import")).toEqual(original);
	await openSaves(page);
	await page.getByLabel("New town seed").fill("73");
	await page.getByRole("button", { name: "Start town", exact: true }).click();
	await closeSaves(page);
	await expect(
		page.getByRole("button", { name: "Play town", exact: true }),
	).toBeVisible();
	await pause(page);
	await expect(page.getByRole("link", { name: /Download save/ })).toHaveCount(
		0,
	);
	expect((await packet(page, info, "new-seed")).runtime.seed).toBe(73);
	await page.evaluate(() => {
		(window as unknown as { sessionSaveGate: SaveGate }).sessionSaveGate.hold =
			true;
	});
	await openSaves(page);
	await page.getByRole("button", { name: "Export", exact: true }).click();
	await openSaves(page);
	await page.getByLabel("New town seed").fill("99");
	await page.getByRole("button", { name: "Start town", exact: true }).click();
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					(window as unknown as { sessionSaveGate: SaveGate }).sessionSaveGate
						.held.length,
			),
		)
		.toBeGreaterThanOrEqual(2);
	await importPacket(page, original);
	await expect(page.getByText("73", { exact: true })).toHaveCount(0);
	await page.evaluate(() => {
		const gate = (window as unknown as { sessionSaveGate: SaveGate })
			.sessionSaveGate;
		gate.hold = false;
		for (const deliver of gate.held.splice(0)) deliver();
	});
	await expect(page.getByRole("link", { name: /Download save/ })).toHaveCount(
		0,
	);
	expect(await packet(page, info, "after-delayed-replies")).toEqual(original);
	await closeSaves(page);
	await expect(
		page.getByRole("button", { name: "Play town", exact: true }),
	).toBeVisible();
});

test("exports survive rejected imports and exports from a replacement survive its delayed state", async ({
	page,
}, info) => {
	await installGate(page);
	await page.goto("/");
	await page.getByRole("button", { name: "Enter town", exact: true }).click();
	await closeSaves(page);
	await expect(
		page.getByRole("button", { name: "Play town", exact: true }),
	).toBeVisible();
	await pause(page);
	const original = await packet(page, info, "edge-original");
	await page.evaluate(() => {
		(window as unknown as { sessionSaveGate: SaveGate }).sessionSaveGate.hold =
			true;
	});
	await openSaves(page);
	await page.getByRole("button", { name: "Export", exact: true }).click();
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					(window as unknown as { sessionSaveGate: SaveGate }).sessionSaveGate
						.held.length,
			),
		)
		.toBeGreaterThan(0);
	await importPacket(page, { schema: "invalid" });
	await expect(page.getByRole("alert")).toBeVisible();
	await page.evaluate(() => {
		const gate = (window as unknown as { sessionSaveGate: SaveGate })
			.sessionSaveGate;
		gate.hold = false;
		for (const deliver of gate.held.splice(0)) deliver();
	});
	await expect(page.getByRole("link", { name: /Download save/ })).toBeVisible();
	// Keep a successful replacement acknowledgement behind an Export from its new world.
	await page.evaluate(() => {
		(
			window as unknown as { sessionSaveGate: SaveGate }
		).sessionSaveGate.holdState = true;
	});
	await importPacket(page, original);
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					(window as unknown as { sessionSaveGate: SaveGate }).sessionSaveGate
						.heldState.length,
			),
		)
		.toBe(1);
	expect(await packet(page, info, "before-restore-acknowledgement")).toEqual(
		original,
	);
	const newLink = await page
		.getByRole("link", { name: /Download save/ })
		.getAttribute("href");
	await page.evaluate(() => {
		const gate = (window as unknown as { sessionSaveGate: SaveGate })
			.sessionSaveGate;
		gate.holdState = false;
		for (const deliver of gate.heldState.splice(0)) deliver();
	});
	await expect(
		page.getByRole("link", { name: /Download save/ }),
	).toHaveAttribute("href", newLink ?? "missing-link");
	// A local file error is newer than the held Step; that older state must not dismiss it.
	await page.evaluate(() => {
		(
			window as unknown as { sessionSaveGate: SaveGate }
		).sessionSaveGate.holdState = true;
	});
	await closeSaves(page);
	await page.getByRole("button", { name: "Step: Advance one round" }).click();
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					(window as unknown as { sessionSaveGate: SaveGate }).sessionSaveGate
						.heldState.length,
			),
		)
		.toBe(1);
	await openSaves(page);
	await page.getByLabel("Import town save").setInputFiles({
		name: "broken.json",
		mimeType: "application/json",
		buffer: Buffer.from("{"),
	});
	await expect(page.getByRole("alert")).toContainText("not valid JSON");
	await page.evaluate(() => {
		const gate = (window as unknown as { sessionSaveGate: SaveGate })
			.sessionSaveGate;
		gate.holdState = false;
		for (const deliver of gate.heldState.splice(0)) deliver();
	});
	expect((await packet(page, info, "after-delayed-step")).runtime.now).toBe(
		original.runtime.now + 15,
	);
	await expect(page.getByRole("alert")).toContainText("not valid JSON");
});
