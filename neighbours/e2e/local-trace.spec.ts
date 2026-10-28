import { readFile } from "node:fs/promises";
import { expect, postStep, test } from "./clock-fixture";
import { enterLocalTown } from "./local-fixture";
import { closeSaves, openDebug } from "./session-helpers";

type Trace = {
	limit: number;
	entries: {
		event: string;
		command?: string;
		pending?: number;
		durationMs?: number;
		workerPending?: boolean;
		width?: number;
		frameWidth?: number;
		reply?: string;
		result?: string;
	}[];
};
for (const size of [
	{ width: 360, height: 690 },
	{ width: 1280, height: 800 },
]) {
	test(`local trace observes real held-reply menu drain at ${size.width}`, async ({
		page,
	}, info) => {
		await page.setViewportSize(size);
		await page.addInitScript(() => {
			const gate = { hold: false, held: [] as (() => void)[], posts: 0 };
			Object.assign(window, { traceGate: gate });
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
				postMessage(message: unknown) {
					gate.posts++;
					super.postMessage(message);
				}
			};
		});
		await page.route("https://**", (route) => route.abort());
		await page.goto("/");
		await enterLocalTown(page);
		await expect(page.locator(".town-ready")).toBeVisible();
		await closeSaves(page);
		await page.evaluate(() => {
			(window as unknown as { traceGate: { hold: boolean } }).traceGate.hold =
				true;
		});
		await postStep(page);
		await expect
			.poll(() =>
				page.evaluate(
					() =>
						(window as unknown as { traceGate: { held: unknown[] } }).traceGate
							.held.length,
				),
			)
			.toBe(1);
		await page.getByRole("button", { name: "Game menu", exact: true }).click();
		await expect(
			page.getByRole("button", { name: "Game menu", exact: true }),
		).toBeDisabled();
		await expect(page.locator(".session-menu")).not.toBeVisible();
		await page.clock.fastForward(500);
		await page.evaluate(() => {
			const gate = (
				window as unknown as {
					traceGate: { hold: boolean; held: (() => void)[] };
				}
			).traceGate;
			gate.hold = false;
			for (const release of gate.held.splice(0)) release();
		});
		await expect(page.locator(".session-menu")).toBeVisible();
		await expect(page.locator(".menu-debug")).not.toHaveAttribute("open");
		await openDebug(page);
		const posts = await page.evaluate(
			() =>
				(window as unknown as { traceGate: { posts: number } }).traceGate.posts,
		);
		await page
			.getByRole("button", { name: "Read local UI trace", exact: true })
			.click();
		const pre = page
			.getByRole("region", { name: "Local UI trace" })
			.locator("pre");
		const trace: Trace = JSON.parse((await pre.textContent()) ?? "");
		const requested = trace.entries.findIndex(
			(e) => e.event === "menu-request" && e.pending === 1,
		);
		expect(requested).toBeGreaterThanOrEqual(0);
		expect(trace.entries[requested]?.workerPending).toBe(true);
		const after = trace.entries.slice(requested + 1);
		const arrival = after.findIndex(
			(e) => e.event === "reply" && e.reply === "state",
		);
		const ack = after.findIndex(
			(e) => e.event === "ack" && e.command === "step",
		);
		const opened = after.findIndex((e) => e.event === "menu-open");
		expect(arrival).toBeGreaterThanOrEqual(0);
		expect(ack).toBeGreaterThan(arrival);
		expect(opened).toBeGreaterThan(ack);
		expect(after[ack]).toMatchObject({ result: "accepted", pending: 0 });
		expect(after[ack]?.durationMs).toBeGreaterThanOrEqual(500);
		expect(after[opened]?.width).toBe(size.width);
		expect(after[opened]?.frameWidth).toBeGreaterThan(0);
		await page.evaluate(() => {
			window.dispatchEvent(new Event("resize"));
			document.dispatchEvent(new Event("visibilitychange"));
			window.dispatchEvent(
				new PageTransitionEvent("pagehide", { persisted: false }),
			);
			window.dispatchEvent(
				new PageTransitionEvent("pageshow", { persisted: false }),
			);
		});
		await page
			.getByRole("button", { name: "Read local UI trace", exact: true })
			.click();
		const text = (await pre.textContent()) ?? "";
		expect(text).toContain('"event": "resize"');
		expect(text).toContain('"event": "visibilitychange"');
		expect(text).toContain('"event": "pagehide"');
		expect(text).toContain('"event": "pageshow"');
		expect(text).toContain('"persisted": false');
		expect(text).toContain('"buildCommit": "Unknown');
		expect(text).not.toContain('"runtime": {');
		expect(text.length).toBeLessThan(100_000);
		const href = await page
			.getByRole("link", { name: "Download local UI trace", exact: true })
			.getAttribute("href");
		expect(href).toMatch(/^blob:/);
		const download = page.waitForEvent("download");
		await page
			.getByRole("link", { name: "Download local UI trace", exact: true })
			.click();
		const downloaded = info.outputPath("local-ui-trace.json");
		await (await download).saveAs(downloaded);
		expect(await readFile(downloaded, "utf8")).toBe(text);
		await expect
			.poll(() =>
				page.evaluate(
					() =>
						(window as unknown as { traceGate: { posts: number } }).traceGate
							.posts,
				),
			)
			.toBe(posts);
		const bounds = await pre.boundingBox();
		expect(bounds?.width).toBeLessThan(size.width);
	});
}
