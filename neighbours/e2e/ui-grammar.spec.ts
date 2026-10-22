import { mkdir } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";

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
			page.getByRole("button", { name: "Enter Alder Quay", exact: true }),
		).toBeInViewport();
		await expect(
			page.locator("details").filter({ hasText: "Playtest privacy" }),
		).toHaveCount(0);
		await capture(page, "title");
		await page.getByRole("button", { name: /^Other ways in/ }).click();
		await page.getByLabel("Start from a seed").fill("42");
		await page.getByRole("button", { name: "Start", exact: true }).click();
		await capture(page, "loading");
		await expect(page.locator(".town-ready")).toBeVisible({ timeout: 120000 });
		await expect(page.locator(".next-step")).toContainText("Find your feet");
		await expect(page.locator(".neighbour-strip button")).toHaveCount(9);
		for (const chip of await page.locator(".neighbour-strip button").all())
			await expect(chip).toBeInViewport();
		await expect(
			page.getByRole("button", { name: /^(Pause|Play|Step)$/ }),
		).toHaveCount(0);
		await expect(
			page.getByRole("combobox", { name: "Playback speed" }),
		).toHaveCount(0);
		await capture(page, "town");
		const rects = await page.evaluate(() => ({
			scene: document
				.querySelector(".game-scene")
				?.getBoundingClientRect()
				.toJSON(),
			column: document
				.querySelector(".game-column")
				?.getBoundingClientRect()
				.toJSON(),
			actions: document
				.querySelector(".game-actions")
				?.getBoundingClientRect()
				.toJSON(),
		}));
		if (width === 1280) {
			expect(rects.scene?.width).toBe(840);
			expect(rects.column?.width).toBe(440);
			expect(rects.actions?.bottom).toBe(800);
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
			"Paper or lamplight",
			"Compare futures ▸",
			"Recorded studies ▸",
			"Send word ▸",
			"To the title page",
			"All games",
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
		await page.getByRole("button", { name: /^Compare futures/ }).click();
		await expect(
			page.getByText("Hypothetical · Your town is unchanged", { exact: true }),
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
		await page.getByRole("button", { name: /^Send word/ }).click();
		await expect(
			page.getByRole("button", { name: "Send", exact: true }),
		).toBeDisabled();
		await expect(
			page.getByText("Recording is off, so nothing is sent.", { exact: true }),
		).toBeVisible();
		await capture(page, "feedback");
		await page.getByText("+ Add a name", { exact: true }).click();
		await page.getByLabel("Your name or tester id").fill("QA-local");
		const [download] = await Promise.all([
			page.waitForEvent("download"),
			page
				.getByRole("button", { name: "Keep a copy of this run", exact: true })
				.click(),
		]);
		expect(download.suggestedFilename()).toBe("alder-quay-save.json.gz");
		await page
			.getByRole("button", { name: "Close Send word", exact: true })
			.click();
		await menu(page);
		await page
			.getByRole("button", { name: "To the title page", exact: true })
			.click();
		await expect(
			page.getByRole("button", { name: /^Return to Alder Quay/ }),
		).toBeVisible();
		await page.getByRole("button", { name: /^Other ways in/ }).click();
		const path = await download.path();
		if (!path) throw Error("No downloaded save");
		await page.getByLabel("Import town save").setInputFiles(path);
		await expect(page.locator(".game-play")).toBeVisible();
	});
}

for (const width of [360, 1280]) {
	for (const privacy of [false, true]) {
		test(`Send word consent and remembered name at ${width}, privacy=${privacy}`, async ({
			page,
		}) => {
			test.setTimeout(120000);
			const received: {
				kind?: string;
				name?: string;
				note?: string;
				data?: { note?: string };
				run?: unknown;
			}[] = [];
			await page.setViewportSize({ width, height: width === 360 ? 690 : 800 });
			await page.route("**/lab/api/**", async (route) => {
				const request = route.request();
				if (request.method() === "POST") {
					const body = request.postDataBuffer();
					if (body) {
						const { gunzipSync } = await import("node:zlib");
						try {
							received.push(JSON.parse(gunzipSync(body).toString()));
						} catch {
							/* Non-gzip unrelated telemetry. */
						}
					}
				}
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					headers: { "Access-Control-Allow-Origin": "*" },
					body: JSON.stringify({ id: "qa-local-receipt", ok: true }),
				});
			});
			await page.addInitScript(
				({ privacy }) => {
					if (privacy)
						Object.defineProperty(navigator, "doNotTrack", {
							value: "1",
							configurable: true,
						});
					else {
						localStorage.setItem("hf-lab-recording-off", "1");
						Object.defineProperty(navigator, "doNotTrack", {
							value: "0",
							configurable: true,
						});
					}
					localStorage.setItem("hf-lab-feedback-name", "Earlier tester");
				},
				{ privacy },
			);
			// The client intentionally suppresses linked localhost recording. Serve the
			// exact local build at a secure synthetic origin; API transport stays intercepted.
			const configured =
				process.env.NEIGHBOURS_LIVE_URL ?? "http://127.0.0.1:5286";
			let entry = "/";
			if (!privacy && !configured.startsWith("https://")) {
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
			await page
				.getByRole("button", { name: "Enter Alder Quay", exact: true })
				.click();
			await expect(page.locator(".town-ready")).toBeVisible({
				timeout: 120000,
			});
			await menu(page);
			await page.getByRole("button", { name: /^Send word/ }).click();
			await expect(
				page.getByRole("button", { name: "Send", exact: true }),
			).toBeDisabled();
			await page.getByText("+ Add a name", { exact: true }).click();
			await expect(page.getByLabel("Your name or tester id")).toHaveValue(
				"Earlier tester",
			);
			await page
				.getByLabel("Your name or tester id")
				.fill("  QA named tester  ");
			await page
				.getByLabel(
					"What happened in the town, what you wanted, what got in the way.",
				)
				.fill("Intercepted browser verification.");
			await page.getByRole("button", { name: "Not sure", exact: true }).click();
			if (privacy)
				await page
					.getByLabel("Send this run with my note", { exact: true })
					.check();
			else
				await page
					.getByRole("switch", { name: "Record play for the lab", exact: true })
					.click();
			await expect(
				page.getByRole("button", { name: "Send", exact: true }),
			).toBeEnabled();
			await capture(
				page,
				privacy ? "feedback-privacy-consent" : "feedback-recording-enabled",
			);
			await page.getByRole("button", { name: "Send", exact: true }).click();
			await expect(
				page.getByText("Queued. Thank you.", { exact: true }),
			).toBeVisible();
			await expect
				.poll(
					() =>
						received.find((x) =>
							privacy ? Boolean(x.run) : x.kind === "note",
						),
					{ timeout: 30000 },
				)
				.toBeTruthy();
			const envelope = received.find((x) =>
				privacy ? Boolean(x.run) : x.kind === "note",
			);
			expect(envelope?.name).toBe("QA named tester");
			expect(envelope?.note ?? envelope?.data?.note).toContain(
				"Verdict: mixed",
			);
			expect(envelope?.note ?? envelope?.data?.note).toContain(
				"Intercepted browser verification.",
			);
			expect(
				await page.evaluate(() => localStorage.getItem("hf-lab-feedback-name")),
			).toBe("QA named tester");
		});
	}
}
