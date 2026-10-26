import { expect, test } from "./clock-fixture";
import { openDownload } from "./session-helpers";

test("quiet Feedback choices wait for Submit and recording off sends only a note", async ({
	page,
}) => {
	await page.addInitScript(() =>
		localStorage.setItem("hf-lab-recording-off", "1"),
	);
	await page.addInitScript(() => {
		const notes: Record<string, unknown>[] = [];
		Object.assign(window, { quietFeedbackNotes: notes });
		const fetch = window.fetch;
		window.fetch = function (input, options) {
			if (
				String(input).endsWith("/run") &&
				options?.method === "POST" &&
				options.body instanceof Blob
			)
				void new Response(
					options.body.stream().pipeThrough(new DecompressionStream("gzip")),
				)
					.json()
					.then((note) => notes.push(note));
			return fetch.apply(this, [input, options]);
		};
	});
	const notes = () =>
		page.evaluate(
			() =>
				(window as unknown as { quietFeedbackNotes: Record<string, unknown>[] })
					.quietFeedbackNotes,
		);
	await page.route("https://human.adamwhite.work/**", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ id: "mock-note", ok: true }),
		});
	});
	await page.goto("/?lab=1");
	await openDownload(page);
	const stopping = page.getByRole("button", {
		name: "I'm stopping",
		exact: true,
	});
	const confused = page.getByRole("button", {
		name: "I'm confused",
		exact: true,
	});
	await stopping.click();
	await expect(stopping).toHaveAttribute("aria-pressed", "true");
	await confused.click();
	await expect(stopping).toHaveAttribute("aria-pressed", "false");
	await expect(confused).toHaveAttribute("aria-pressed", "true");
	expect(await notes()).toHaveLength(0);
	await page.getByRole("button", { name: "Submit", exact: true }).click();
	await expect(
		page.getByRole("status").filter({ hasText: "Sent. Your note is stored." }),
	).toBeVisible();
	expect(await notes()).toHaveLength(1);
	expect((await notes())[0]).toMatchObject({
		note: "I'm confused",
		run: { feedbackOnly: true },
	});
	expect((await notes())[0]).not.toHaveProperty("player");
	expect((await notes())[0]).not.toHaveProperty("session");
});

test("feedback preview names the current town and closing sends no note", async ({
	page,
}) => {
	let notes = 0;
	await page.route("https://human.adamwhite.work/**", async (route) => {
		if (/\/(run|feedback)$/.test(route.request().url())) notes++;
		await route.fulfill({ status: 200, body: "{}" });
	});
	await page.goto("/?lab=1");
	await page
		.getByRole("button", { name: /^(Enter|Return to) Mill Bridge/ })
		.click();
	await expect(page.locator(".town-ready")).toBeVisible({ timeout: 120000 });
	await openDownload(page);
	await page.getByText("What is sent", { exact: true }).click();
	await expect(page.locator(".feedback-preview")).toContainText(
		"Day 1 · seed 42",
	);
	await page
		.getByRole("button", { name: "Close Feedback", exact: true })
		.click();
	expect(notes).toBe(0);
});
