import { mkdir } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { enterLocalTown, expect, type Page, test } from "./local-fixture";

type FeedbackPayload = {
	kind?: string;
	name?: string;
	note?: string;
	data?: { note?: string };
	run?: unknown;
	player?: string;
	runId?: string;
};
async function observeLabPayloads(page: Page) {
	await page.addInitScript(() => {
		const payloads: FeedbackPayload[] = [];
		Object.assign(window, { __qaLabPayloads: payloads });
		const actual = window.fetch;
		window.fetch = function (input, options) {
			const response = actual.apply(this, [input, options]);
			if (
				/\/(linked|run)$/.test(String(input)) &&
				options?.method === "POST" &&
				options.body instanceof Blob
			)
				void new Response(
					options.body.stream().pipeThrough(new DecompressionStream("gzip")),
				)
					.json()
					.then((payload) => payloads.push(payload));
			return response;
		};
	});
}
const labPayloads = (page: Page) =>
	page.evaluate(
		() =>
			(window as unknown as { __qaLabPayloads: FeedbackPayload[] })
				.__qaLabPayloads,
	);

const evidence = process.env.NEIGHBOURS_EVIDENCE;
async function capture(page: Page, name: string) {
	await expect
		.poll(() =>
			page.evaluate(() => document.scrollingElement?.scrollHeight ?? 0),
		)
		.toBeLessThanOrEqual(page.viewportSize()?.height ?? 0);
	await expect(
		page.getByRole("button", { name: "Information", exact: true }),
	).toHaveCount(1);
	await expect(
		page.getByRole("button", { name: "Game menu", exact: true }),
	).toHaveCount(1);
	const small = await page.evaluate(() =>
		Array.from(
			document.querySelectorAll(
				'button, a, select, summary, input:not([type="checkbox"])',
			),
		)
			.filter((element) => {
				const r = element.getBoundingClientRect();
				const style = getComputedStyle(element);
				return (
					r.width > 0 &&
					r.height > 0 &&
					r.bottom > 0 &&
					r.top < innerHeight &&
					r.right > 0 &&
					r.left < innerWidth &&
					style.visibility !== "hidden" &&
					style.display !== "none"
				);
			})
			.filter((element) => {
				const r = element.getBoundingClientRect();
				return r.width < 43.9 || r.height < 43.9;
			})
			.map((element) => ({
				text: element.textContent?.trim().slice(0, 60),
				width: element.getBoundingClientRect().width,
				height: element.getBoundingClientRect().height,
			})),
	);
	expect(small).toEqual([]);

	if (evidence) {
		await mkdir(evidence, { recursive: true });
		await page.screenshot({
			path: `${evidence}/${page.viewportSize()?.width}-${name}.png`,
		});
	}
}
async function menu(page: Page) {
	await page.getByRole("button", { name: "Game menu", exact: true }).click();
	await expect(page.locator(".session-menu")).toBeVisible();
}
async function held(page: Page) {
	await page.waitForTimeout(500);
	const time = await page.locator(".town-time strong").textContent();
	await page.waitForTimeout(5000);
	await expect(page.locator(".town-time strong")).toHaveText(time ?? "");
}
for (const width of [360, 1280]) {
	test(`approved grammar and review regressions at ${width}`, async ({
		page,
	}) => {
		test.setTimeout(180000);
		await page.setViewportSize({ width, height: width === 360 ? 690 : 800 });
		await page.addInitScript(() => {
			localStorage.setItem("hf-lab-recording-off", "1");
			window.confirm = () => {
				throw Error("Native confirmation forbidden");
			};
		});
		await page.goto("/");
		await expect(
			page.getByRole("button", { name: "Enter Mill Bridge", exact: true }),
		).toBeInViewport();
		await expect(
			page.locator("details").filter({ hasText: "Playtest privacy" }),
		).toHaveCount(0);
		await capture(page, "title");
		await page.getByRole("button", { name: /^Other ways in/ }).click();
		await page.getByLabel("Start from a seed number").fill("42");
		await enterLocalTown(page);
		await capture(page, "loading");
		await expect(page.locator(".town-ready")).toBeVisible({ timeout: 120000 });
		await expect(page.locator(".next-step")).toContainText("Explore the town");
		await expect(page.locator(".neighbour-strip button")).toHaveCount(7);
		for (const chip of await page.locator(".neighbour-strip button").all())
			await expect(chip).toBeInViewport();
		await expect(
			page.getByRole("button", { name: /^(Pause|Play|Step)$/ }),
		).toHaveCount(0);
		await expect(
			page.getByRole("combobox", { name: "Playback speed" }),
		).toHaveCount(0);
		await capture(page, "town");
		await expect
			.poll(() =>
				page.locator(".map-person, .map-cluster").evaluateAll(
					(markers) =>
						markers.length > 0 &&
						markers.every((marker) => {
							const rect = marker.getBoundingClientRect();
							return rect.width >= 44 && rect.height >= 44;
						}),
				),
			)
			.toBe(true);
		const rects = await page.evaluate(() => ({
			scene: document
				.querySelector(".game-scene")
				?.getBoundingClientRect()
				.toJSON(),
			column: document
				.querySelector(".game-column")
				?.getBoundingClientRect()
				.toJSON(),
			footer: document
				.querySelector(".notice-footer")
				?.getBoundingClientRect()
				.toJSON(),
			actions: document
				.querySelector(".game-actions")
				?.getBoundingClientRect()
				.toJSON(),
		}));
		if (width === 1280) {
			expect(rects.column?.width).toBeGreaterThanOrEqual(360);
			expect(rects.column?.width).toBeLessThanOrEqual(width / 2);
			expect(
				(rects.scene?.width ?? 0) + (rects.column?.width ?? 0),
			).toBeCloseTo(width, 0);
			expect(rects.actions?.bottom).toBeCloseTo(
				800 - (rects.footer?.height ?? 0),
				0,
			);
		}
		await page.locator('.neighbour-strip [data-person-id="ada"]').click();
		await expect(page.locator(".game-actions .primary")).toHaveText(
			/Walk to Workshop to talk/,
		);
		await capture(page, "person");
		await page
			.getByRole("button", { name: "Information", exact: true })
			.click();
		await held(page);
		await capture(page, "information");
		await page.locator(".game-actions").click({ position: { x: 10, y: 5 } });
		await expect(page.locator(".game-info")).toHaveCount(0);
		await page
			.getByRole("button", { name: "Close person details", exact: true })
			.click();
		await page
			.getByRole("button", { name: "Help the town", exact: true })
			.click();
		await expect(page.locator(".town-support .support-option")).toHaveCount(3);
		await capture(page, "help");
		const credits = await page
			.locator(".credit-tokens")
			.getAttribute("aria-label");
		await page.getByRole("button", { name: /^Lend tools/ }).click();
		await expect(page.locator(".credit-tokens")).not.toHaveAttribute(
			"aria-label",
			credits ?? "",
		);
		await page
			.getByRole("button", { name: "Close Help the town", exact: true })
			.click();
		await page.getByRole("button", { name: "Journal", exact: true }).click();
		await menu(page);
		await page.keyboard.press("Escape");
		await expect(page.locator(".game-sheet .sheet-heading h2")).toHaveText(
			"Journal",
		);
		await page
			.getByRole("button", { name: "Close Journal", exact: true })
			.click();
		await menu(page);
		await held(page);
		await capture(page, "menu");
		const rows = await page
			.locator(".menu-scroll > button, .menu-scroll > a")
			.allTextContents();
		expect(
			rows.map((s) => s.trim()).filter((s) => s !== "Full screen"),
		).toEqual([
			"Read the journal ▸",
			"Switch light or dark colours",
			"Compare possible outcomes ▸",
			"Recorded studies ▸",
			"Feedback ▸",
			"All games",
			"New game",
			"People saved in this browser",
		]);
		await expect(
			page.getByRole("button", { name: "Automatic", exact: true }),
		).toHaveAttribute("aria-pressed", "true");
		for (const name of ["Slow", "Steady", "Fast"])
			await expect(
				page.getByRole("button", { name, exact: true }),
			).toBeVisible();
		await expect(
			page.locator('.session-menu input[type="number"]'),
		).toHaveCount(0);
		await page
			.getByRole("button", { name: /^Compare possible outcomes/ })
			.click();
		await expect(
			page.getByText(
				"These are possible outcomes. Your town stays unchanged.",
				{ exact: true },
			),
		).toBeVisible();
		await expect(page.locator(".day-comparison")).toBeVisible();
		await capture(page, "compare");
		await page.keyboard.press("Escape");
		await expect(page.locator(".study-overlay")).toHaveCount(0);
		await menu(page);
		await page.getByRole("button", { name: /^Recorded studies/ }).click();
		await capture(page, "studies");
		await page.keyboard.press("Escape");
		await menu(page);
		await page.getByRole("button", { name: /^Feedback/ }).click();
		await expect(
			page.getByRole("button", { name: "Submit", exact: true }),
		).toBeEnabled();
		const sharePlay = page.getByRole("checkbox", {
			name: "Share this run and my play with the lab",
			exact: true,
		});
		await expect(sharePlay).toHaveCount(1);
		await expect(sharePlay).toBeVisible();
		await expect(sharePlay).not.toBeChecked();
		await capture(page, "feedback");
		await page.getByText("+ Add a name", { exact: true }).click();
		await expect(page.getByLabel("Your name (optional)")).toBeVisible();
		await page.getByLabel("Your name (optional)").fill("QA-local");
		const [download] = await Promise.all([
			page.waitForEvent("download"),
			page
				.getByRole("button", { name: "Keep a copy of this run", exact: true })
				.click(),
		]);
		expect(download.suggestedFilename()).toBe("alder-quay-save.json.gz");
		await page
			.getByRole("button", { name: "Close Feedback", exact: true })
			.click();
		await menu(page);
		await page.locator(".session-menu .menu-debug > summary").click();
		await page
			.getByRole("button", {
				name: "Restore, import or start from a seed",
				exact: true,
			})
			.click();
		await expect(
			page.getByRole("button", { name: /^Return to Mill Bridge/ }),
		).toBeVisible();
		await page.getByRole("button", { name: /^Other ways in/ }).click();
		const path = await download.path();
		if (!path) throw Error("No downloaded save");
		await page.getByLabel("Import town save").setInputFiles(path);
		await expect(page.locator(".game-play")).toBeVisible();
	});
}

for (const width of [360, 1280]) {
	for (const mode of ["on", "off-ticked", "off-unticked"]) {
		test(`Feedback Submit shares only the chosen data at ${width}, mode=${mode}`, async ({
			page,
		}) => {
			await page.setViewportSize({ width, height: width === 360 ? 690 : 800 });
			await observeLabPayloads(page);
			await page.addInitScript(() => {
				Object.defineProperty(navigator, "doNotTrack", {
					value: "1",
					configurable: true,
				});
				Object.defineProperty(navigator, "globalPrivacyControl", {
					value: true,
					configurable: true,
				});
				localStorage.setItem("hf-lab-feedback-name", "Earlier tester");
			});
			await page.route("**/lab/api/**", async (route) => {
				// Linked uploads retire only on a receipt for that exact piece.
				const body = route.request().postDataBuffer();
				if (!body) throw Error("Expected a compressed lab upload");
				const payload = JSON.parse(gunzipSync(body).toString("utf8")) as {
					id?: string;
				};
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					headers: { "Access-Control-Allow-Origin": "*" },
					body: JSON.stringify({
						id: payload.id ?? "qa-local-receipt",
						ok: true,
					}),
				});
			});
			const configured =
				process.env.NEIGHBOURS_LIVE_URL ?? "http://127.0.0.1:5286";
			let entry = "/";
			if (!configured.startsWith("https://")) {
				entry = "https://neighbours-ui-test.invalid/";
				await page.route(
					"https://neighbours-ui-test.invalid/**",
					async (route) => {
						const requested = new URL(route.request().url());
						const response = await route.fetch({
							url: new URL(requested.pathname + requested.search, configured)
								.href,
						});
						await route.fulfill({ response });
					},
				);
			}
			await page.goto(entry);
			await enterLocalTown(page);
			await expect(page.locator(".town-ready")).toBeVisible({
				timeout: 120000,
			});
			await menu(page);
			const recording = page.getByLabel("Recording", {
				exact: true,
			});
			await expect(recording).not.toBeChecked();
			if (mode === "on") await recording.check();
			await page.getByRole("button", { name: /^Feedback/ }).click();
			const share = page.getByLabel("Share this run and my play with the lab", {
				exact: true,
			});
			await expect(share).toHaveCount(mode === "on" ? 0 : 1);
			if (mode !== "on") {
				await expect(share).not.toBeChecked();
				if (mode === "off-ticked") await share.check();
			}
			await expect(
				page.getByRole("button", { name: "Submit", exact: true }),
			).toBeEnabled();
			await page.getByText("+ Add a name", { exact: true }).click();
			await expect(page.getByLabel("Your name (optional)")).toHaveValue(
				"Earlier tester",
			);
			await page.getByLabel("Your name (optional)").fill("  QA named tester  ");
			await page
				.locator("#feedback-note")
				.fill("Intercepted Submit verification.");
			await page.getByRole("button", { name: "Not sure", exact: true }).click();
			await capture(page, `feedback-${mode}`);
			await page.getByRole("button", { name: "Submit", exact: true }).click();
			await expect(
				page.getByText("Sent. Your note is stored.", { exact: true }),
			).toBeVisible();
			await expect
				.poll(async () =>
					(await labPayloads(page)).find((x) =>
						(x.note ?? x.data?.note)?.includes(
							"Intercepted Submit verification.",
						),
					),
				)
				.toBeTruthy();
			const payloads = await labPayloads(page);
			const note = payloads.find((x) =>
				(x.note ?? x.data?.note)?.includes("Intercepted Submit verification."),
			);
			expect(note?.name).toBe("QA named tester");
			expect(note?.note ?? note?.data?.note).toContain("Verdict: mixed");
			if (mode === "off-unticked") {
				expect(note?.run).toEqual({ feedbackOnly: true });
				expect(note).not.toHaveProperty("player");
				expect(note).not.toHaveProperty("session");
			} else {
				expect(note?.kind).toBe("note");
				expect(note?.player).toBeTruthy();
				expect(
					payloads.some(
						(x) =>
							x.kind === "run" &&
							x.player === note?.player &&
							x.runId === note?.runId,
					),
				).toBe(true);
			}
			expect(
				await page.evaluate(() => localStorage.getItem("hf-lab-feedback-name")),
			).toBe("QA named tester");
		});
	}
}

for (const width of [360, 1280]) {
	test(`Feedback before entering a town at ${width}`, async ({ page }) => {
		await observeLabPayloads(page);
		await page.setViewportSize({ width, height: 800 });
		await page.addInitScript(() =>
			localStorage.setItem("hf-lab-recording-off", "1"),
		);
		await page.route("**/lab/api/**", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				headers: { "Access-Control-Allow-Origin": "*" },
				body: JSON.stringify({ id: "qa-title-note", ok: true }),
			});
		});
		await page.goto("/");
		await expect(
			page.getByRole("button", { name: "Enter Mill Bridge", exact: true }),
		).toBeVisible();
		await menu(page);
		await page.getByRole("button", { name: /^Feedback/ }).click();
		await page
			.getByLabel(
				"What happened? What did you want to do? What got in the way?",
			)
			.fill("A note from the title.");
		await page.getByRole("button", { name: "Submit", exact: true }).click();
		await expect(
			page.getByText("Sent. Your note is stored.", { exact: true }),
		).toBeVisible();
		await expect
			.poll(async () => (await labPayloads(page)).find((x) => Boolean(x.run)))
			.toBeTruthy();
		const envelope = (await labPayloads(page)).find((x) => Boolean(x.run));
		expect(envelope?.run).toEqual({ feedbackOnly: true });
		expect(envelope).not.toHaveProperty("player");
		expect(envelope).not.toHaveProperty("session");
		await expect(page.locator(".town-ready")).toHaveCount(0);
	});
}
