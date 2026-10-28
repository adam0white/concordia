import { readFile, writeFile } from "node:fs/promises";
import { gunzipSync, gzipSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import { openSaves } from "./session-helpers";

// Scope: optional source-bound actual packet, supplied by the author/reviewer.
// No synthetic delivery, owner profile, remote service, screenshot or player claim.
test.use({ trace: "off", screenshot: "off" });
const packetPath = process.env.NEIGHBOURS_EVENING_PACKET;
test("actual current-cast evening is readable through the ordinary file App and Journal", async ({
	page,
}, info) => {
	test.skip(
		!packetPath,
		"Supply the retained actual canonical-six native packet for this focused source control.",
	);
	await page.route("**/*", (route) =>
		new URL(route.request().url()).hostname === "127.0.0.1"
			? route.continue()
			: route.abort(),
	);
	await page.addInitScript(() => {
		const probe = {
			hold: false,
			releases: [] as (() => void)[],
			saves: [] as unknown[],
			messages: [] as string[],
			writes: [] as string[],
			now: 0,
		};
		Object.assign(window, { eveningProbe: probe });
		const set = Storage.prototype.setItem;
		Storage.prototype.setItem = function (key, value) {
			probe.writes.push(`storage:${key}`);
			return set.call(this, key, value);
		};
		const transaction = IDBDatabase.prototype.transaction;
		IDBDatabase.prototype.transaction = function (stores, mode, options) {
			if (mode === "readwrite") probe.writes.push(`db:${this.name}`);
			return transaction.call(this, stores, mode, options);
		};
		const NativeWorker = window.Worker;
		window.Worker = class extends NativeWorker {
			postMessage(
				message: unknown,
				options?: StructuredSerializeOptions | Transferable[],
			) {
				probe.messages.push(String((message as { type?: string }).type));
				if (Array.isArray(options)) super.postMessage(message, options);
				else super.postMessage(message, options);
			}
			set onmessage(handler:
				| ((this: Worker, event: MessageEvent) => unknown)
				| null) {
				super.onmessage = handler
					? (event) => {
							if (event.data.type === "ready" || event.data.type === "state")
								probe.now = event.data.view.now;
							if (event.data.type === "save" && event.data.requestId > 0) {
								probe.saves.push(event.data.save);
								if (probe.hold) {
									probe.releases.push(() => handler.call(this, event));
									return;
								}
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

	await page.clock.install();
	await page.clock.pauseAt(new Date());
	await page.goto("/file/");
	await page.getByLabel("Town file", { exact: true }).setInputFiles({
		name: "actual.json.gz",
		mimeType: "application/gzip",
		buffer: await readFile(packetPath as string),
	});
	await expect(page.locator(".town-ready")).toBeVisible({ timeout: 60000 });
	const native = JSON.parse(
		gunzipSync(await readFile(packetPath as string)).toString(),
	);
	const initialWrites = await page.evaluate(
		() =>
			(window as unknown as { eveningProbe: { writes: string[] } }).eveningProbe
				.writes.length,
	);
	const checks: unknown[] = [];
	for (const size of [
		{ width: 360, height: 690 },
		{ width: 1280, height: 800 },
	]) {
		await page.setViewportSize(size);
		const mapBefore = await page.locator(".game-scene").boundingBox();
		await openSaves(page);
		await expect(page.locator(".menu-debug")).not.toHaveAttribute("open");
		await page.keyboard.press("Escape");
		await page.getByRole("button", { name: "Journal", exact: true }).click();
		const sheet = page.locator(".game-sheet");
		const supper = sheet.locator("article.event").filter({
			has: page.getByRole("heading", {
				name: "Neighbours shared Sam’s supper",
				exact: true,
			}),
		});
		await supper.locator(".evening-reading > summary").scrollIntoViewIfNeeded();
		await supper.locator(".evening-reading > summary").click();
		const ece = supper.getByRole("region", { name: "Ece's evening record" });
		await expect(ece).toContainText("Voluntarily accepted");
		await expect(ece).toContainText("30 recorded minutes awake");
		await expect(ece).toContainText("Meal delivery recorded");
		await expect(ece).toContainText("Later retained activity");
		await expect(
			supper.getByRole("region", { name: "Derya's evening record" }),
		).toContainText("No delivery recorded when the evening closed");
		const missedClass = sheet.locator("article.event").filter({
			has: page.getByRole("heading", {
				name: "Nora’s class did not happen",
				exact: true,
			}),
		});
		await missedClass
			.locator(".evening-reading > summary")
			.scrollIntoViewIfNeeded();
		await missedClass.locator(".evening-reading > summary").click();
		await expect(missedClass).toContainText("The room was never prepared");
		await expect(
			missedClass.getByRole("region", { name: "Ece's evening record" }),
		).toContainText("No delivery recorded when the evening closed");
		const summary = supper.locator(".evening-reading > summary");
		await summary.scrollIntoViewIfNeeded();
		await summary.focus();
		await expect(summary).toBeFocused();
		await page.keyboard.press("Enter");
		await expect(supper.locator(".evening-reading")).not.toHaveAttribute(
			"open",
		);
		await page.keyboard.press("Enter");
		await expect(supper.locator(".evening-reading")).toHaveAttribute(
			"open",
			"",
		);
		const overflow = await page.evaluate(() => ({
			page: document.documentElement.scrollWidth > innerWidth + 1,
			sheet: [...document.querySelectorAll(".game-sheet")].some(
				(e) => e.scrollWidth > e.clientWidth + 1,
			),
		}));
		expect(overflow).toEqual({ page: false, sheet: false });
		await sheet.evaluate((e) => {
			e.scrollTop = e.scrollHeight;
		});
		expect(await sheet.evaluate((e) => e.scrollTop)).toBeGreaterThan(0);
		const close = sheet.getByRole("button", {
			name: "Close Journal",
			exact: true,
		});
		await expect(close).toBeInViewport();
		await close.click();
		const mapAfter = await page.locator(".game-scene").boundingBox();
		expect(mapAfter).toEqual(mapBefore);
		await page
			.getByRole("button", {
				name: /^Read story: Neighbours shared Sam’s supper/,
			})
			.click();
		await expect(
			page.locator("article.event").filter({
				has: page.getByRole("heading", {
					name: "Neighbours shared Sam’s supper",
					exact: true,
				}),
			}),
		).toBeFocused();
		await page
			.getByRole("button", { name: "Close Journal", exact: true })
			.click();
		expect(await page.locator(".game-scene").boundingBox()).toEqual(mapBefore);
		checks.push({
			size,
			mapBefore,
			mapAfter,
			overflow,
			keyboardDisclosure: true,
			stickyClose: true,
		});
	}
	// Every read capture must leave the complete native runtime unchanged and make no storage write.
	const captured = await page.evaluate(
		() =>
			(
				window as unknown as {
					eveningProbe: {
						saves: unknown[];
						writes: string[];
						messages: string[];
					};
				}
			).eveningProbe,
	);
	expect(captured.saves.length).toBeGreaterThan(0);
	for (const packet of captured.saves)
		expect((packet as { runtime: unknown }).runtime).toEqual(native.runtime);
	expect(captured.writes).toHaveLength(initialWrites);
	expect(
		captured.messages.filter((type) => type !== "save" && type !== "restore"),
	).toEqual([]);
	await writeFile(
		info.outputPath("complete-reading-captures.json.gz"),
		gzipSync(JSON.stringify(captured)),
	);
	console.log(
		"Capture boundary:",
		JSON.stringify({
			snapshots: captured.saves.length,
			persistentWritesDuringRead: captured.writes.length - initialWrites,
			completeRuntimesUnchanged: true,
		}),
	);
	console.log("Evening reading geometry:", JSON.stringify(checks));
	await info.attach("geometry.json", {
		body: JSON.stringify(checks, null, 2),
		contentType: "application/json",
	});
});

test("held snapshot replies cannot republish after close, time advance or file replacement", async ({
	page,
}, info) => {
	test.skip(!packetPath, "Supply the unchanged actual source packet.");
	await page.route("**/*", (route) =>
		new URL(route.request().url()).hostname === "127.0.0.1"
			? route.continue()
			: route.abort(),
	);
	await page.addInitScript(() => {
		const probe = {
			hold: false,
			releases: [] as (() => void)[],
			saves: [] as unknown[],
			messages: [] as string[],
			writes: [] as string[],
			now: 0,
		};
		Object.assign(window, { eveningProbe: probe });
		const set = Storage.prototype.setItem;
		Storage.prototype.setItem = function (key, value) {
			probe.writes.push(`storage:${key}`);
			return set.call(this, key, value);
		};
		const transaction = IDBDatabase.prototype.transaction;
		IDBDatabase.prototype.transaction = function (stores, mode, options) {
			if (mode === "readwrite") probe.writes.push(`db:${this.name}`);
			return transaction.call(this, stores, mode, options);
		};
		const NativeWorker = window.Worker;
		window.Worker = class extends NativeWorker {
			postMessage(
				message: unknown,
				options?: StructuredSerializeOptions | Transferable[],
			) {
				probe.messages.push(String((message as { type?: string }).type));
				if (Array.isArray(options)) super.postMessage(message, options);
				else super.postMessage(message, options);
			}
			set onmessage(handler:
				| ((this: Worker, event: MessageEvent) => unknown)
				| null) {
				super.onmessage = handler
					? (event) => {
							if (event.data.type === "ready" || event.data.type === "state")
								probe.now = event.data.view.now;
							if (event.data.type === "save" && event.data.requestId > 0) {
								probe.saves.push(event.data.save);
								if (probe.hold) {
									probe.releases.push(() => handler.call(this, event));
									return;
								}
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

	await page.clock.install();
	await page.clock.pauseAt(new Date());
	await page.goto("/file/");
	const file = {
		name: "actual.json.gz",
		mimeType: "application/gzip",
		buffer: await readFile(packetPath as string),
	};
	await page.getByLabel("Town file", { exact: true }).setInputFiles(file);
	await expect(page.locator(".town-ready")).toBeVisible({ timeout: 60000 });
	await openSaves(page);
	await page.keyboard.press("Escape");
	await page.getByRole("button", { name: "Journal", exact: true }).click();
	const supper = page.locator("article.event").filter({
		has: page.getByRole("heading", {
			name: "Neighbours shared Sam’s supper",
			exact: true,
		}),
	});
	const summary = supper.locator(".evening-reading > summary");
	await page.evaluate(
		() =>
			((
				window as unknown as { eveningProbe: { hold: boolean } }
			).eveningProbe.hold = true),
	);
	await summary.click();
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					(window as unknown as { eveningProbe: { releases: unknown[] } })
						.eveningProbe.releases.length,
			),
		)
		.toBe(1);
	await summary.click();
	await page.evaluate(() => {
		const p = (
			window as unknown as {
				eveningProbe: { releases: (() => void)[]; hold: boolean };
			}
		).eveningProbe;
		p.hold = false;
		for (const release of p.releases.splice(0)) release();
	});
	await expect(
		supper.getByRole("region", { name: "Ece's evening record" }),
	).toHaveCount(0);
	// Advance only one ordinary host round while a read reply is held. The changed view invalidates it.
	await page.evaluate(
		() =>
			((
				window as unknown as { eveningProbe: { hold: boolean } }
			).eveningProbe.hold = true),
	);
	await summary.click();
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					(window as unknown as { eveningProbe: { releases: unknown[] } })
						.eveningProbe.releases.length,
			),
		)
		.toBe(1);
	const before = await page.evaluate(
		() =>
			(window as unknown as { eveningProbe: { now: number } }).eveningProbe.now,
	);
	for (let i = 0; i < 200; i++) {
		await page.clock.fastForward(100);
		if (
			(await page.evaluate(
				() =>
					(window as unknown as { eveningProbe: { now: number } }).eveningProbe
						.now,
			)) > before
		)
			break;
	}
	expect(
		await page.evaluate(
			() =>
				(window as unknown as { eveningProbe: { now: number } }).eveningProbe
					.now,
		),
	).toBe(before + 15);
	await page.evaluate(() => {
		const p = (
			window as unknown as {
				eveningProbe: { releases: (() => void)[]; hold: boolean };
			}
		).eveningProbe;
		p.hold = false;
		for (const release of p.releases.splice(0)) release();
	});
	await expect(supper).toContainText("town changed or this reading closed");
	await expect(
		supper.getByRole("region", { name: "Ece's evening record" }),
	).toHaveCount(0);
	await summary.click();
	await page.evaluate(
		() =>
			((
				window as unknown as { eveningProbe: { hold: boolean } }
			).eveningProbe.hold = true),
	);
	await summary.click();
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					(window as unknown as { eveningProbe: { releases: unknown[] } })
						.eveningProbe.releases.length,
			),
		)
		.toBe(1);
	await page
		.getByRole("button", { name: "Close file session", exact: true })
		.click();
	await expect(page.getByLabel("Town file", { exact: true })).toBeVisible();
	// Reopen the same seed/time packet in a new runtime generation before releasing the old reply.
	await page.getByLabel("Town file", { exact: true }).setInputFiles(file);
	await expect(page.locator(".town-ready")).toBeVisible({ timeout: 60000 });
	await page.evaluate(() => {
		const p = (
			window as unknown as {
				eveningProbe: { releases: (() => void)[]; hold: boolean };
			}
		).eveningProbe;
		p.hold = false;
		for (const release of p.releases.splice(0)) release();
	});
	await expect(
		page.getByRole("region", { name: "Ece's evening record" }),
	).toHaveCount(0);
	await page.getByRole("button", { name: "Journal", exact: true }).click();
	await summary.click();
	await expect(
		supper.getByRole("region", { name: "Ece's evening record" }),
	).toContainText("Meal delivery recorded");
	await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
	await expect(
		supper.getByRole("region", { name: "Ece's evening record" }),
	).toHaveCount(0);
	const captured = await page.evaluate(
		() => (window as unknown as { eveningProbe: unknown }).eveningProbe,
	);
	await writeFile(
		info.outputPath("held-boundary-captures.json.gz"),
		gzipSync(JSON.stringify(captured)),
	);
	console.log(
		"Held-boundary controls:",
		JSON.stringify({
			closedReplyDiscarded: true,
			oneOrdinaryRound: 15,
			replacedSameSeedTimeDiscarded: true,
			pagehideClearsReading: true,
		}),
	);
});
