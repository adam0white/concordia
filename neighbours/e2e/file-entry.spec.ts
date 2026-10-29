import { readFile } from "node:fs/promises";
import {
	type APIRequestContext,
	type Browser,
	expect,
	type Page,
	test,
} from "@playwright/test";
import type { TownPacket } from "../src/cast-session.ts";
import { checkpointSources } from "../src/checkpoint-source.ts";
import { canonicalHash } from "../src/core/hf4-canonical.ts";
import { decodeSave } from "../src/ui/save-codec.ts";

/** SDK chunks carry the complete encoded journal. Decode with the shipped reader;
 * keep the original whole-packet assertions and strict cold replay below. */
async function recordedCheckpoint(json: string) {
	const packet = (await decodeSave(new Blob([json]))) as TownPacket;
	checkpointSources(packet);
	return packet;
}

test("built entry refuses invalid selectors and preserves missing-identity memory play", async ({
	page,
}) => {
	await page.addInitScript(() => {
		const writes: string[] = [];
		Object.assign(window, { entryWrites: writes });
		const set = Storage.prototype.setItem;
		Storage.prototype.setItem = function (key, value) {
			writes.push(key);
			return set.call(this, key, value);
		};
		const open = indexedDB.open.bind(indexedDB);
		indexedDB.open = (name, version) => {
			writes.push(`db:${name}`);
			return open(name, version);
		};
	});
	for (const path of ["/?file=0", "/?file=1&file=1", "/file/?file=wrong"]) {
		await page.goto(path);
		await expect(page.getByText(/^Invalid file entry/)).toBeVisible();
		expect(
			await page.evaluate(
				() => (window as unknown as { entryWrites: string[] }).entryWrites,
			),
		).toEqual([]);
	}
	await page.goto("/?file=1&source=agent#kept");
	await expect(page).toHaveURL(/\/file\/\?source=agent#kept$/);
	await expect(page.getByLabel("Town file", { exact: true })).toBeVisible();
	await expect(
		page.getByText(/Recording unavailable: missing-identity/),
	).toBeVisible();
	expect(
		await page.evaluate(() => localStorage.getItem("hf-lab-player")),
	).toBeNull();
	expect(
		await page.evaluate(() =>
			(window as unknown as { entryWrites: string[] }).entryWrites.filter(
				(k) =>
					k === "db:alder-quay" ||
					k.startsWith("hf-lab-session:") ||
					k.startsWith("hf-lab-run:"),
			),
		),
	).toEqual([]);
	// Actual native positive: ordinary construction and Welcome still run.
	await page.goto("/");
	await expect(
		page.getByRole("button", { name: /^Other ways in/ }),
	).toBeVisible();
	expect(
		await page.evaluate(() =>
			sessionStorage.getItem("hf-lab-session:neighbours"),
		),
	).toMatch(/^[a-f0-9]{32}:/);
	await page.getByRole("button", { name: /^Other ways in/ }).click();
	await expect(
		page.getByRole("link", { name: "Open a saved town in memory" }),
	).toHaveAttribute("href", "/file/");
	// Literal build artifact, served by a static server too.
	expect(await readFile("dist/file/index.html", "utf8")).toBe(
		await readFile("dist/index.html", "utf8"),
	);
});

// Real production App + immutable SDK15, served under a synthetic secure origin.
// All requests remain local or are refused. Queued chunks are not delivery receipts.
test("real SDK preserves existing session, OFF and statuses; final pagehide captures the complete file", async ({
	browser,
	request,
	baseURL,
}) => {
	const { createHash } = await import("node:crypto");
	const { gzipSync } = await import("node:zlib");
	const { createRuntime, restoreRuntime } = await import(
		"../src/core/index.ts"
	);
	const { canonicalPersona } = await import("@adam0white/lab-client");
	const { openDebug } = await import("./session-helpers");
	const runtime = createRuntime(
		42,
		206,
	).export() as import("../src/core/runtime.ts").NativeTownArchive;
	const person = runtime.owner.run.current.people.ada;
	if (!person) throw Error("Missing complete source person");
	const original = canonicalPersona(person);
	const sha = createHash("sha256").update(original).digest("hex");
	const packet = {
		schema: "neighbours/concordia@2",
		rounds: runtime.physical.round,
		runtime,
		castLocal: {
			heads: [],
			sources: { [sha]: person },
			chapter: canonicalHash({
				seed: runtime.physical.seed,
				hf: runtime.hf,
				initial: runtime.owner.run.initial,
			}),
			file: true,
			localOnly: true,
		},
	};
	const origin = "https://neighbours.test";
	const context = await browser.newContext();
	await context.route("**/*", async (route) => {
		const url = new URL(route.request().url());
		if (url.origin !== origin) return route.abort();
		const response = await request.get(
			`${baseURL}${url.pathname}${url.search}`,
		);
		await route.fulfill({ response });
	});
	const player = "a".repeat(32),
		sid = `${"b".repeat(32)}:1234`,
		run = "c".repeat(32);
	await context.addInitScript(
		({ player, sid, run }) => {
			if (!sessionStorage.getItem("test-seeded")) {
				localStorage.setItem("hf-lab-player", player);
				sessionStorage.setItem("hf-lab-session:neighbours", sid);
				sessionStorage.setItem("hf-lab-run:neighbours", run);
				sessionStorage.setItem("test-seeded", "1");
			}
			Object.assign(window, {
				fileProbe: {
					hidden: false,
					saveHeld: false,
					release: () => {},
					terminated: 0,
					posts: [] as string[],
					native: [] as string[],
				},
			});
			const probe = (
				window as unknown as {
					fileProbe: {
						hidden: boolean;
						saveHeld: boolean;
						release: () => void;
						terminated: number;
						posts: string[];
						native: string[];
					};
				}
			).fileProbe;
			window.addEventListener("pagehide", () => {
				probe.hidden = true;
			});
			const NativeWorker = window.Worker;
			window.Worker = class extends NativeWorker {
				postMessage(
					message: unknown,
					options?: StructuredSerializeOptions | Transferable[],
				) {
					probe.posts.push((message as { type: string }).type);
					if (Array.isArray(options)) super.postMessage(message, options);
					else super.postMessage(message, options);
				}
				terminate() {
					probe.terminated++;
					super.terminate();
				}
				set onmessage(handler:
					| ((this: Worker, event: MessageEvent) => unknown)
					| null) {
					super.onmessage = handler
						? (event) => {
								if (
									probe.hidden &&
									event.data.type === "save" &&
									event.data.requestId < 0
								) {
									probe.saveHeld = true;
									probe.release = () => {
										handler.call(this, event);
									};
								} else handler.call(this, event);
							}
						: null;
				}
				get onmessage() {
					return super.onmessage;
				}
			};
			const open = indexedDB.open.bind(indexedDB);
			indexedDB.open = (name, version) => {
				if (name === "alder-quay") {
					probe.native.push(name);
					throw Error("Native database in file entry");
				}
				return open(name, version);
			};
		},
		{ player, sid, run },
	);
	const page = await context.newPage();
	const identity = () =>
		page.evaluate(() => [
			localStorage.getItem("hf-lab-player"),
			sessionStorage.getItem("hf-lab-session:neighbours"),
			sessionStorage.getItem("hf-lab-run:neighbours"),
		]);
	const exportFile = async () => {
		await openDebug(page);
		await page
			.getByRole("button", { name: "Keep a copy of this run", exact: true })
			.click();
		const link = page.getByRole("link", { name: "Download save", exact: true });
		await expect(link).toBeVisible();
		return page.evaluate(
			async (href) =>
				JSON.parse(
					await new Response(
						(await (await fetch(href ?? "")).blob())
							.stream()
							.pipeThrough(new DecompressionStream("gzip")),
					).text(),
				),
			await link.getAttribute("href"),
		);
	};
	try {
		await page.goto(`${origin}/file/?labRunSource=agent`);
		await expect(page.getByLabel("Town file", { exact: true })).toBeVisible();
		expect(await identity()).toEqual([player, sid, run]);
		await page.getByLabel("Town file", { exact: true }).setInputFiles({
			name: "full.json",
			mimeType: "application/json",
			buffer: Buffer.from(JSON.stringify(packet)),
		});
		await expect(page.locator(".town-ready")).toBeVisible();
		const full = await exportFile();
		expect(restoreRuntime(full.runtime).export()).toEqual(runtime);
		expect(canonicalPersona(full.castLocal.sources[sha])).toBe(original);
		await page
			.getByRole("button", { name: "Close Game menu", exact: true })
			.click();
		await page
			.getByRole("button", { name: "Walk somewhere", exact: true })
			.click();
		await page
			.getByRole("button", { name: "Market kitchen about 30 min", exact: true })
			.click();
		const fullContinued = await exportFile();
		await page
			.getByRole("button", { name: "Close Game menu", exact: true })
			.click();
		await page
			.getByRole("button", { name: "Close file session", exact: true })
			.click();
		await page.getByLabel("Town file", { exact: true }).setInputFiles({
			name: "compact.json.gz",
			mimeType: "application/gzip",
			buffer: gzipSync(JSON.stringify(packet)),
		});
		await expect(page.locator(".town-ready")).toBeVisible();
		expect(await exportFile()).toEqual(full);
		// Privacy signals suppress recording until the real switch explicitly opts in.
		await page.evaluate(() => {
			Object.defineProperty(navigator, "globalPrivacyControl", {
				configurable: true,
				value: true,
			});
			window.dispatchEvent(new Event("focus"));
		});
		await expect(
			page.getByRole("switch", { name: "Recording", exact: true }),
		).not.toBeChecked();
		await page.getByRole("switch", { name: "Recording", exact: true }).check();
		expect(
			await page.evaluate(() =>
				localStorage.getItem("hf-lab-privacy-override:neighbours"),
			),
		).toBe("1");
		// The actual Recording switch persists OFF without changing session identity.
		await page
			.getByRole("switch", { name: "Recording", exact: true })
			.uncheck();
		expect(
			await page.evaluate(() => localStorage.getItem("hf-lab-recording-off")),
		).toBe("1");
		expect(await identity()).toEqual([player, sid, run]);
		await page.getByRole("switch", { name: "Recording", exact: true }).check();
		expect(await identity()).toEqual([player, sid, run]);
		// Add one real input; both full and gzip imports continue through Python.
		await page
			.getByRole("button", { name: "Close Game menu", exact: true })
			.click();
		await page
			.getByRole("button", { name: "Walk somewhere", exact: true })
			.click();
		await page
			.getByRole("button", { name: "Market kitchen about 30 min", exact: true })
			.click();
		const continued = await exportFile();
		expect(continued).toEqual(fullContinued);
		expect(continued.runtime.physical.player).toBeDefined();
		expect(canonicalPersona(continued.castLocal.sources[sha])).toBe(original);
		await page.evaluate(() =>
			window.dispatchEvent(new PageTransitionEvent("pagehide")),
		);
		await expect
			.poll(() =>
				page.evaluate(
					() =>
						(window as unknown as { fileProbe: { saveHeld: boolean } })
							.fileProbe.saveHeld,
				),
			)
			.toBe(true);
		expect(
			await page.evaluate(
				() =>
					(window as unknown as { fileProbe: { terminated: number } }).fileProbe
						.terminated,
			),
		).toBe(1); // first selection closed
		await page.evaluate(() =>
			(
				window as unknown as { fileProbe: { release: () => void } }
			).fileProbe.release(),
		);
		await expect
			.poll(() =>
				page.evaluate(
					() =>
						(window as unknown as { fileProbe: { terminated: number } })
							.fileProbe.terminated,
				),
			)
			.toBe(2);
		const queued = async () =>
			page.evaluate(async () => {
				const db = await new Promise<IDBDatabase>((resolve, reject) => {
					const r = indexedDB.open("hf-lab-pending", 1);
					r.onsuccess = () => resolve(r.result);
					r.onerror = () => reject(r.error);
				});
				const rows = await new Promise<{ body: Blob }[]>((resolve, reject) => {
					const r = db.transaction("pieces").objectStore("pieces").getAll();
					r.onsuccess = () => resolve(r.result);
					r.onerror = () => reject(r.error);
				});
				db.close();
				return Promise.all(
					rows.map(async (row) =>
						JSON.parse(
							await new Response(
								row.body.stream().pipeThrough(new DecompressionStream("gzip")),
							).text(),
						),
					),
				);
			});
		await expect
			.poll(async () => (await queued()).filter((r) => r.kind === "run").length)
			.toBeGreaterThan(0);
		const chunks = (await queued()).filter((r) => r.kind === "run");
		const upload = chunks[chunks.length - 1]?.data.upload;
		const captured = chunks
			.filter((r) => r.data.upload === upload)
			.sort((a, b) => a.data.index - b.data.index);
		expect(captured).toHaveLength(captured[0].data.total);
		const final = await recordedCheckpoint(
			captured.map((r) => r.data.text).join(""),
		);
		expect(final).toEqual(continued);
		// Compare complete native state too, including every actor, input and RNG field.
		expect(restoreRuntime(final.runtime).export()).toEqual(
			restoreRuntime(continued.runtime).export(),
		);
		await test.info().attach("synthetic-local-final-queue-proof", {
			contentType: "application/json",
			body: JSON.stringify({
				queueOnly: true,
				delivery: false,
				chunks: captured.length,
				packetSHA256: createHash("sha256")
					.update(JSON.stringify(final))
					.digest("hex"),
				originalPersonSHA256: sha,
				completePacketEqualsContinued: true,
				queue: captured,
			}),
		});
		expect(captured.every((r) => r.runSource === "agent")).toBe(true);
		expect(await identity()).toEqual([player, sid, run]);
		expect(
			await page.evaluate(
				() =>
					(window as unknown as { fileProbe: { native: string[] } }).fileProbe
						.native,
			),
		).toEqual([]);
		// A changed identity is rejected truthfully on the next actual startup.
		await page.evaluate(() =>
			localStorage.setItem("hf-lab-top-level-player", "d".repeat(32)),
		);
		await page.reload();
		await expect(
			page.getByText(/Recording unavailable: identity-mismatch/),
		).toBeVisible();
		expect(await identity()).toEqual([player, sid, run]);
		await page.evaluate(() => {
			localStorage.removeItem("hf-lab-top-level-player");
			sessionStorage.setItem("hf-lab-session:neighbours", "invalid-session");
		});
		await page.reload();
		await expect(
			page.getByText(/Recording unavailable: incompatible-session/),
		).toBeVisible();
		expect((await identity())[1]).toBe("invalid-session");
	} finally {
		await context.close();
	}
});

type ReviewProbe = {
	hidden: boolean;
	compressionHeld: boolean;
	holdExport: boolean;
	finalHeld: boolean;
	releaseCompression: () => void;
	releaseFinal: () => void;
	terminated: number;
	native: string[];
	holdState: boolean;
	stateHeld: boolean;
	releaseState: () => void;
	compressionDone: boolean;
};
type SelectionProbe = { read: boolean; release: () => void; workers: number };
type ProbeWindow = Window & {
	reviewProbe: ReviewProbe;
	selectionProbe: SelectionProbe;
};
async function queuedPieces(page: Page) {
	return page.evaluate(async () => {
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			const r = indexedDB.open("hf-lab-pending", 1);
			r.onsuccess = () => resolve(r.result);
			r.onerror = () => reject(r.error);
		});
		const rows = await new Promise<{ body: Blob }[]>((resolve, reject) => {
			const r = db.transaction("pieces").objectStore("pieces").getAll();
			r.onsuccess = () => resolve(r.result);
			r.onerror = () => reject(r.error);
		});
		db.close();
		return Promise.all(
			rows.map(async (row) =>
				JSON.parse(
					await new Response(
						row.body.stream().pipeThrough(new DecompressionStream("gzip")),
					).text(),
				),
			),
		);
	});
}
async function finalQueuedRun(page: Page) {
	await expect
		.poll(
			async () =>
				(await queuedPieces(page)).filter((r) => r.kind === "run").length,
		)
		.toBeGreaterThan(0);
	const pieces = (await queuedPieces(page)).filter((r) => r.kind === "run");
	expect(pieces).toHaveLength(pieces[0].data.total);
	return recordedCheckpoint(
		pieces
			.sort((a, b) => a.data.index - b.data.index)
			.map((r) => r.data.text)
			.join(""),
	);
}
async function lifecycleFile({
	browser,
	request,
	baseURL,
}: {
	browser: Browser;
	request: APIRequestContext;
	baseURL: string | undefined;
}) {
	const origin = "https://neighbours.test";
	const context = await browser.newContext();
	await context.route("**/*", async (route) => {
		const u = new URL(route.request().url());
		if (u.origin !== origin) return route.abort();
		await route.fulfill({
			response: await request.get(`${baseURL}${u.pathname}${u.search}`),
		});
	});
	await context.addInitScript(() => {
		localStorage.setItem("hf-lab-player", "a".repeat(32));
		sessionStorage.setItem(
			"hf-lab-session:neighbours",
			`${"b".repeat(32)}:1234`,
		);
		sessionStorage.setItem("hf-lab-run:neighbours", "c".repeat(32));
		const p: ReviewProbe = {
			hidden: false,
			compressionHeld: false,
			holdExport: false,
			finalHeld: false,
			releaseCompression: () => {},
			releaseFinal: () => {},
			terminated: 0,
			native: [],
			holdState: false,
			stateHeld: false,
			releaseState: () => {},
			compressionDone: false,
		};
		(window as unknown as ProbeWindow).reviewProbe = p;
		window.addEventListener("pagehide", () => (p.hidden = true));
		const W = Worker;
		window.Worker = class extends W {
			terminate() {
				p.terminated++;
				super.terminate();
			}
			set onmessage(h:
				| ((this: Worker, event: MessageEvent) => unknown)
				| null) {
				super.onmessage = h
					? (e) => {
							if (p.holdState && e.data.type === "state" && e.data.save) {
								p.stateHeld = true;
								p.releaseState = () => h.call(this, e);
							} else if (
								p.hidden &&
								e.data.type === "save" &&
								e.data.requestId < 0
							) {
								p.finalHeld = true;
								p.releaseFinal = () => h.call(this, e);
							} else h.call(this, e);
						}
					: null;
			}
			get onmessage() {
				return super.onmessage;
			}
		};
		const C = CompressionStream;
		window.CompressionStream = class extends C {
			constructor(format: CompressionFormat) {
				super(format);
				const hold = p.holdExport;
				p.holdExport = false;
				Object.defineProperty(this, "readable", {
					value: this.readable.pipeThrough(
						new TransformStream({
							transform(v, c) {
								c.enqueue(v);
							},
							async flush() {
								if (hold) {
									p.compressionHeld = true;
									await new Promise<void>((r) => (p.releaseCompression = r));
									p.compressionDone = true;
								}
							},
						}),
					),
				});
			}
		};
		const open = indexedDB.open.bind(indexedDB);
		indexedDB.open = (name, version) => {
			if (name === "alder-quay") {
				p.native.push(name);
				throw Error("host native db");
			}
			return open(name, version);
		};
	});
	const page = await context.newPage();

	const runtime = (await import("../src/core/index"))
		.createRuntime(42, 206)
		.export() as import("../src/core/runtime.ts").NativeTownArchive;
	const packet = {
		schema: "neighbours/concordia@2",
		rounds: runtime.physical.round,
		runtime,
	};
	await page.goto(`${origin}/file/?labRunSource=agent`);
	await page.getByLabel("Town file", { exact: true }).setInputFiles({
		name: "full.json",
		mimeType: "application/json",
		buffer: Buffer.from(JSON.stringify(packet)),
	});
	await expect(page.locator(".town-ready")).toBeVisible();
	return { context, page, runtime };
}
test("regression: pending export must not publish after file pagehide while final snapshot waits", async ({
	browser,
	request,
	baseURL,
}, info) => {
	const { context, page, runtime } = await lifecycleFile({
		browser,
		request,
		baseURL,
	});
	try {
		await (await import("./session-helpers")).openDebug(page);
		await page.evaluate(
			() => ((window as unknown as ProbeWindow).reviewProbe.holdExport = true),
		);
		await page
			.getByRole("button", { name: "Keep a copy of this run", exact: true })
			.click();
		await expect
			.poll(() =>
				page.evaluate(
					() => (window as unknown as ProbeWindow).reviewProbe.compressionHeld,
				),
			)
			.toBe(true);
		await page.evaluate(() =>
			window.dispatchEvent(new PageTransitionEvent("pagehide")),
		);
		await expect
			.poll(() =>
				page.evaluate(
					() => (window as unknown as ProbeWindow).reviewProbe.finalHeld,
				),
			)
			.toBe(true);
		const before = await page
			.getByRole("link", { name: "Download save", exact: true })
			.count();
		await page.evaluate(() =>
			(window as unknown as ProbeWindow).reviewProbe.releaseCompression(),
		);
		// Let the real production encodeSave promise complete while the final save remains pending.
		await expect
			.poll(() =>
				page.evaluate(
					() =>
						(window as unknown as { reviewProbe: ReviewProbe }).reviewProbe
							.compressionDone,
				),
			)
			.toBe(true);
		await page.evaluate(() => new Promise<void>((r) => setTimeout(r, 0)));
		const result = await page.evaluate(() => ({
			hidden: (window as unknown as ProbeWindow).reviewProbe.hidden,
			finalHeld: (window as unknown as ProbeWindow).reviewProbe.finalHeld,
			terminated: (window as unknown as ProbeWindow).reviewProbe.terminated,
			native: (window as unknown as ProbeWindow).reviewProbe.native,
			download: document.querySelector("a[download]")?.getAttribute("href"),
		}));
		await info.attach("repro", {
			body: JSON.stringify({ before, ...result }),
			contentType: "application/json",
		});
		await page.evaluate(() =>
			(window as unknown as ProbeWindow).reviewProbe.releaseFinal(),
		);
		await expect
			.poll(() =>
				page.evaluate(
					() => (window as unknown as ProbeWindow).reviewProbe.terminated,
				),
			)
			.toBe(1);
		expect(before).toBe(0);
		expect(result.hidden).toBe(true);
		expect(
			result.download,
			"retired export callback published a new download after pagehide",
		).toBeUndefined();
		const { restoreRuntime } = await import("../src/core/index.ts");
		expect(
			restoreRuntime((await finalQueuedRun(page)).runtime).export(),
		).toEqual(runtime);
		await expect(
			page.getByRole("link", { name: "Download save", exact: true }),
		).toHaveCount(0);
	} finally {
		await context.close();
	}
});

test("regression: pagehide invalidates an outstanding canonical file read", async ({
	page,
}) => {
	await page.goto("/file/");
	await page.evaluate(() => {
		const text = Blob.prototype.text;
		const p: SelectionProbe = { read: false, release: () => {}, workers: 0 };
		(window as unknown as ProbeWindow).selectionProbe = p;
		Blob.prototype.text = function () {
			Blob.prototype.text = text;
			p.read = true;
			return new Promise<void>((r) => (p.release = r)).then(() =>
				text.call(this),
			);
		};
		const W = Worker;
		window.Worker = class extends W {
			constructor(url: string | URL, options?: WorkerOptions) {
				super(url, options);
				p.workers++;
			}
		};
	});
	const runtime = (await import("../src/core/index"))
		.createRuntime(42, 206)
		.export() as import("../src/core/runtime.ts").NativeTownArchive;
	await page.getByLabel("Town file", { exact: true }).setInputFiles({
		name: "full.json",
		mimeType: "application/json",
		buffer: Buffer.from(
			JSON.stringify({
				schema: "neighbours/concordia@2",
				rounds: runtime.physical.round,
				runtime,
			}),
		),
	});
	await expect
		.poll(() =>
			page.evaluate(
				() => (window as unknown as ProbeWindow).selectionProbe.read,
			),
		)
		.toBe(true);
	await page.evaluate(() => {
		window.dispatchEvent(new PageTransitionEvent("pagehide"));
		(window as unknown as ProbeWindow).selectionProbe.release();
	});
	await expect(page.getByLabel("Town file", { exact: true })).toBeVisible();
	await expect(page.locator(".town-ready")).toHaveCount(0);
	expect(
		await page.evaluate(
			() => (window as unknown as ProbeWindow).selectionProbe.workers,
		),
	).toBe(0);
});

test("regression: pending player reply must not enqueue a checkpoint after pagehide", async ({
	browser,
	request,
	baseURL,
}, info) => {
	const { context, page, runtime } = await lifecycleFile({
		browser,
		request,
		baseURL,
	});
	try {
		await page.evaluate(
			() => ((window as unknown as ProbeWindow).reviewProbe.holdState = true),
		);
		await page
			.getByRole("button", { name: "Walk somewhere", exact: true })
			.click();
		await page
			.getByRole("button", { name: "Market kitchen about 30 min", exact: true })
			.click();
		await expect
			.poll(() =>
				page.evaluate(
					() => (window as unknown as ProbeWindow).reviewProbe.stateHeld,
				),
			)
			.toBe(true);
		await page.evaluate(() =>
			window.dispatchEvent(new PageTransitionEvent("pagehide")),
		);
		await expect
			.poll(() =>
				page.evaluate(
					() => (window as unknown as ProbeWindow).reviewProbe.finalHeld,
				),
			)
			.toBe(true);
		const saves = async () =>
			(await queuedPieces(page)).filter((row) => row.kind === "save");
		const before = (await saves()).length;
		await page.evaluate(() =>
			(window as unknown as ProbeWindow).reviewProbe.releaseState(),
		);
		await page.evaluate(() => new Promise<void>((r) => setTimeout(r, 0)));
		const after = (await saves()).length;
		await info.attach("pending-state-repro", {
			body: JSON.stringify({
				before,
				after,
				probe: await page.evaluate(() => ({
					hidden: (window as unknown as ProbeWindow).reviewProbe.hidden,
					finalHeld: (window as unknown as ProbeWindow).reviewProbe.finalHeld,
					terminated: (window as unknown as ProbeWindow).reviewProbe.terminated,
				})),
			}),
			contentType: "application/json",
		});
		await page.evaluate(() =>
			(window as unknown as ProbeWindow).reviewProbe.releaseFinal(),
		);
		await expect
			.poll(() =>
				page.evaluate(
					() => (window as unknown as ProbeWindow).reviewProbe.terminated,
				),
			)
			.toBe(1);
		expect(
			after,
			"retired player reply enqueued SDK checkpoint after pagehide",
		).toBe(before);
		const final = await finalQueuedRun(page);
		expect(final.runtime.physical.people).toHaveLength(
			runtime.physical.people.length,
		);
		expect(final.runtime.physical.player).toBeDefined();
		expect((await saves()).length).toBe(before);
	} finally {
		await context.close();
	}
});
