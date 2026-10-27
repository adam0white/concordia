import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import {
	expect,
	type Page,
	postStep,
	type TestInfo,
	test,
} from "./clock-fixture";
import { enterLocalTown } from "./local-fixture";
import {
	closeSaves,
	openDownload,
	openOtherWays,
	openSaves,
	showTab,
} from "./session-helpers";

type Packet = {
	runtime: { seed: number; now: number };
	castLocal?: Record<string, unknown>;
};
type SaveGate = {
	hold: boolean;
	held: (() => void)[];
	holdState: boolean;
	heldState: (() => void)[];
	restores: number;
};
async function pause(page: Page) {
	await closeSaves(page);
	await closeSaves(page);
	await expect(page.locator(".town-ready")).toBeVisible();
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
	await openDownload(page);
	await page
		.getByRole("button", { name: "Keep a copy of this run", exact: true })
		.click();
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
	await openOtherWays(page);
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
	await enterLocalTown(page);
	await closeSaves(page);
	await expect(page.locator(".town-ready")).toBeVisible();
	await pause(page);
	const original = await packet(page, info, "original");
	await showTab(page, "Help");
	await page.getByRole("button", { name: /^Restore the public bus/ }).click();
	await expect(page.locator(".intervention-result")).toContainText(
		"The public bus is running again",
	);
	await showTab(page, "Compare");
	const comparison = page.locator(".day-comparison");
	if ((await comparison.getAttribute("open")) === null)
		await comparison.locator(":scope > summary").click();
	await page
		.getByRole("button", { name: "Compare from here", exact: true })
		.click();
	await expect(
		page.getByText("How this comparison works", { exact: true }),
	).toBeVisible();
	const changed = await packet(page, info, "changed");
	const oldLink = await page
		.getByRole("link", { name: /Download save/ })
		.getAttribute("href");
	await importPacket(page, { schema: "invalid" });
	await expect(page.getByRole("alert")).toBeVisible();
	await showTab(page, "Help");
	await expect(page.locator(".intervention-result")).toContainText(
		"The public bus is running again",
	);
	await showTab(page, "Compare");
	await expect(
		page.getByText("How this comparison works", { exact: true }),
	).toBeVisible();
	await openDownload(page);
	await expect(
		page.getByRole("link", { name: /Download save/ }),
	).toHaveAttribute("href", oldLink ?? "missing-download-link");
	expect(await packet(page, info, "failed-import-preserved")).toEqual(changed);
	await importPacket(page, original);
	await showTab(page, "Help");
	await expect(page.locator(".intervention-result")).toHaveCount(0);
	await showTab(page, "Compare");
	await expect(
		page.getByText("How this comparison works", { exact: true }),
	).toHaveCount(0);
	await openDownload(page);
	await expect(page.getByRole("link", { name: /Download save/ })).toHaveCount(
		0,
	);
	expect(await packet(page, info, "successful-import")).toEqual({
		...original,
		castLocal: { ...original.castLocal, file: true },
	});
	await openSaves(page);
	await openOtherWays(page);
	await page.getByLabel("Start from a seed number").fill("73");
	await enterLocalTown(page);
	await closeSaves(page);
	await expect(page.locator(".town-ready")).toBeVisible();
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
	await openDownload(page);
	await page
		.getByRole("button", { name: "Keep a copy of this run", exact: true })
		.click();
	await openSaves(page);
	await openOtherWays(page);
	await page.getByLabel("Start from a seed number").fill("99");
	await enterLocalTown(page);
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
	expect(await packet(page, info, "after-delayed-replies")).toEqual({
		...original,
		castLocal: { ...original.castLocal, file: true },
	});
	await closeSaves(page);
	await expect(page.locator(".town-ready")).toBeVisible();
});

test("exports survive rejected imports and exports from a replacement survive its delayed state", async ({
	page,
}, info) => {
	await installGate(page);
	await page.goto("/");
	await enterLocalTown(page);
	await closeSaves(page);
	await expect(page.locator(".town-ready")).toBeVisible();
	await pause(page);
	const original = await packet(page, info, "edge-original");
	await page.evaluate(() => {
		(window as unknown as { sessionSaveGate: SaveGate }).sessionSaveGate.hold =
			true;
	});
	await openSaves(page);
	await openDownload(page);
	await page
		.getByRole("button", { name: "Keep a copy of this run", exact: true })
		.click();
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
	await openDownload(page);
	await expect(page.getByRole("link", { name: /Download save/ })).toBeVisible();
	// Export waits for a replacement acknowledgement before exposing its new world.
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
	await expect(
		page.getByRole("button", { name: "Keep a copy of this run", exact: true }),
	).toHaveCount(0);
	await page.evaluate(() => {
		const gate = (window as unknown as { sessionSaveGate: SaveGate })
			.sessionSaveGate;
		gate.holdState = false;
		for (const deliver of gate.heldState.splice(0)) deliver();
	});
	expect(await packet(page, info, "after-restore-acknowledgement")).toEqual({
		...original,
		castLocal: { ...original.castLocal, file: true },
	});
	// A title-page file read can fail after a later timer round has been queued.
	await page.evaluate(() => {
		const read = File.prototype.text;
		File.prototype.text = function () {
			if (this.name !== "broken.json") return read.call(this);
			return new Promise<string>((resolve) =>
				Object.assign(window, {
					releaseFileRead: () => {
						void read.call(this).then(resolve);
					},
				}),
			);
		};
		(
			window as unknown as { sessionSaveGate: SaveGate }
		).sessionSaveGate.holdState = true;
	});
	await openOtherWays(page);
	await page.getByLabel("Import town save").setInputFiles({
		name: "broken.json",
		mimeType: "application/json",
		buffer: Buffer.from("{"),
	});
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					typeof (window as unknown as { releaseFileRead?: () => void })
						.releaseFileRead,
			),
		)
		.toBe("function");
	await closeSaves(page);
	await postStep(page);
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					(window as unknown as { sessionSaveGate: SaveGate }).sessionSaveGate
						.heldState.length,
			),
		)
		.toBe(1);
	await page.evaluate(() =>
		(window as unknown as { releaseFileRead: () => void }).releaseFileRead(),
	);
	await expect(page.getByRole("alert")).toContainText(
		"The town could not complete that action.",
	);
	await page.evaluate(() => {
		const gate = (window as unknown as { sessionSaveGate: SaveGate })
			.sessionSaveGate;
		gate.holdState = false;
		for (const deliver of gate.heldState.splice(0)) deliver();
	});

	expect((await packet(page, info, "after-delayed-step")).runtime.now).toBe(
		original.runtime.now + 15,
	);
	await expect(page.getByRole("alert")).toContainText(
		"The town could not complete that action.",
	);
});

test("a rejected local JSON file resumes automatic time without another action", async ({
	page,
}) => {
	await page.goto("/");
	await enterLocalTown(page);
	await expect(page.locator(".town-ready")).toBeVisible({ timeout: 120000 });
	await openOtherWays(page);
	await page.getByLabel("Import town save").setInputFiles({
		name: "invalid-local.json",
		mimeType: "application/json",
		buffer: Buffer.from("{"),
	});
	await expect(page.getByRole("alert")).toContainText(
		"The town could not complete that action.",
	);
	// No menu, walking, or other action resumes time after the error.
	const before = await postStep(page);
	await expect
		.poll(() =>
			page.evaluate(() => (window as unknown as { townNow: number }).townNow),
		)
		.toBe(before.now + 15);
	await expect(page.locator(".town-time strong")).toHaveText("08:15");
});
