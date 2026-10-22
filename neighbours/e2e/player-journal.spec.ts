import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import {
	step as automaticStep,
	expect,
	type Page,
	type TestInfo,
	test,
} from "./clock-fixture";
import {
	closeSaves,
	openDownload,
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
	await closeSaves(page);
	return JSON.parse(gunzipSync(await readFile(path)).toString("utf8"));
}

/** Step one actual round and wait until the town clock shows it. */
async function step(page: Page, count = 1) {
	for (let i = 0; i < count; i++) await automaticStep(page);
}

test("the player walks, speaks with a promise and keeps it; the journal records each step from actual events", async ({
	page,
}, info) => {
	test.setTimeout(180_000);
	await page.goto("/");
	await page
		.getByRole("button", { name: /^(Enter|Return to) Alder Quay/ })
		.click();
	await expect(page.locator(".town-ready")).toBeVisible({ timeout: 60_000 });

	await page.locator('[data-map-place="hall"] .place-hit-area').click();
	await page.getByRole("button", { name: /Walk to Flooded hall ·/ }).click();
	for (let i = 0; i < 6; i++) await step(page);
	await page
		.locator(".place-company")
		.getByRole("button", { name: /^Talk to / })
		.first()
		.click();
	const panel = page.locator(".speak-panel");
	const name = (await page.locator(".game-sheet h2").textContent())?.trim();
	expect(name).toBeTruthy();
	const promise = page.getByRole("button", {
		name: /^Put it to /,
		exact: true,
	});
	// No hour is promised by default: the player chooses the work (and may choose the deadline).
	await expect(promise).toBeDisabled();
	await panel.locator("[data-affordance-id]").first().click();
	await panel.locator('[data-work-id="carry-meals"]').click();
	await expect(promise).toBeEnabled();
	// No predicted answer is shown before asking.
	await expect(panel).not.toContainText("Likely");
	await promise.click();
	const answer = panel.locator(".latest-answer");
	await expect(answer.locator(".voice").first()).not.toBeEmpty();
	await expect(answer).toContainText("You made a promise and asked");

	// HF may refuse; a refusal holds no pledge. Otherwise keep the pledge.
	const packet = await exportPacket(page, info, "after-speech");
	const request = packet.runtime.player.requests.at(-1);
	expect(request).toBeDefined();
	// Only a yes binds at once; an offered pledge waits on their decision and is not worked yet.
	const pledged =
		Boolean(request.pledgeId) &&
		packet.runtime.player.pledges.find(
			(p: { id: string }) => p.id === request.pledgeId,
		)?.status === "open";
	if (pledged) {
		const start = panel.getByRole("button", {
			name: "Start the hour",
			exact: true,
		});
		if (await start.isVisible()) await start.click();
		else await page.getByRole("button", { name: "Done", exact: true }).click();
		await step(page, 16);
	}
	await showTab(page, "Town");
	// Let the resident's own next decision happen; HF decides what they do.
	for (let i = 0; i < 4; i++) await step(page);

	await showTab(page, "Journal");
	const lines = page.locator(".player-journal li");
	await expect(lines.first()).toBeVisible();
	const saved = await exportPacket(page, info, "after-journal");
	await showTab(page, "Journal");
	const player = saved.runtime.player as {
		log: { id: number }[];
		requests: {
			id: number;
			answerEvent: number;
			answer: { verdict: string; counterOffer?: { label: string } };
			startedEvent?: number;
			resultEvent?: number;
			pledgeId?: string;
		}[];
		pledges: { id: string; status: string; resolvedEvent?: number }[];
	};
	const ids = new Set(player.log.map((event) => event.id));
	const kept = player.requests.find((q) => q.id === request.id);
	expect(kept).toBeDefined();
	const linesFor = async (eventId: number | undefined) => {
		if (eventId === undefined) return [];
		const found: string[] = [];
		for (const line of await lines.all()) {
			const events = ((await line.getAttribute("data-events")) ?? "").split(
				" ",
			);
			if (events.includes(String(eventId)))
				found.push((await line.textContent()) ?? "");
		}
		return found;
	};
	// The request and the answer share one line, in the resident's own words.
	const asked = await linesFor(kept?.answerEvent);
	expect(asked).toHaveLength(1);
	expect(asked[0]).toContain(name ?? "");
	// Whatever HF answered, the line carries that verdict's own wording.
	const verdict = kept?.answer.verdict;
	if (verdict === "refused") expect(asked[0]).toContain("It was a refusal.");
	else if (verdict === "complied")
		expect(asked[0]).toContain("They agreed under protest.");
	else if (
		(verdict === "deferred" || verdict === "modified") &&
		kept?.answer.counterOffer
	)
		expect(asked[0]).toContain("They offered to ");
	else
		expect(asked[0]).not.toMatch(
			/It was a refusal|agreed under protest|They offered to /,
		);
	// The action they took, when HF chose to act on it.
	if (kept?.startedEvent !== undefined)
		expect((await linesFor(kept.startedEvent))[0]).toContain("began to");
	// The delivered result of the promised hour, or a neutral note that it lapsed.
	const pledge = player.pledges.find((p) => p.id === kept?.pledgeId);
	info.annotations.push({
		type: "recorded",
		description: `verdict ${kept?.answer.verdict}; started ${kept?.startedEvent !== undefined}; pledge ${pledge?.status ?? "none"}`,
	});
	if (pledge?.status === "kept")
		expect((await lines.allTextContents()).join(" ")).toMatch(
			/meals reached the market/,
		);
	// Every line is recorded and points at actual events in the saved player log.
	for (const line of await lines.all()) {
		const events = ((await line.getAttribute("data-events")) ?? "").trim();
		expect(events.length).toBeGreaterThan(0);
		for (const id of events.split(/\s+/))
			expect(ids.has(Number(id))).toBe(true);
	}
});

/** Read the device checkpoint directly, once: no polling, so it shows what was stored when called. */
async function deviceRequests(page: Page) {
	return page.evaluate(async () => {
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open("alder-quay", 1);
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		return new Promise<{ id: number; targetId: string; answerEvent: number }[]>(
			(resolve, reject) => {
				const request = db
					.transaction("saves")
					.objectStore("saves")
					.get("latest");
				request.onsuccess = () => {
					db.close();
					resolve(request.result?.runtime?.player?.requests ?? []);
				};
				request.onerror = () => reject(request.error);
			},
		);
	});
}

test("an answered request is on the device before it is shown and survives an immediate reload", async ({
	page,
}) => {
	test.setTimeout(180_000);
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto("/");
	await page
		.getByRole("button", { name: /^(Enter|Return to) Alder Quay/ })
		.click();
	await expect(page.locator(".town-ready")).toBeVisible({ timeout: 60_000 });
	await page.locator('[data-map-place="hall"] .place-hit-area').click();
	await page.getByRole("button", { name: /Walk to Flooded hall ·/ }).click();
	for (let i = 0; i < 6; i++) await step(page);
	await page
		.locator(".place-company")
		.getByRole("button", { name: /^Talk to / })
		.first()
		.click();
	const panel = page.locator(".speak-panel");
	const name = (await page.locator(".game-sheet h2").textContent())?.trim();
	expect(name).toBeTruthy();
	const before = await deviceRequests(page);
	await panel.locator("[data-affordance-id]").first().click();
	await panel.locator('[data-work-id="carry-meals"]').click();
	await page.getByRole("button", { name: /^Put it to /, exact: true }).click();
	const answer = panel.locator(".latest-answer");
	await expect(answer).toContainText("You made a promise and asked");
	// Shown means stored: read once, with no Export (which would itself save) and no polling.
	const stored = await deviceRequests(page);
	expect(stored).toHaveLength(before.length + 1);
	const request = stored.at(-1);
	expect(request).toBeDefined();

	// Reload at once: the answered request and its answer come back from the device.
	await page.reload();
	await page
		.getByRole("button", { name: /^(Enter|Return to) Alder Quay/ })
		.click();
	await closeSaves(page);
	await expect(page.locator(".town-ready")).toBeVisible({ timeout: 60_000 });
	expect(await deviceRequests(page)).toEqual(stored);
	await showTab(page, "Journal");
	const line = page.locator(
		`.player-journal li[data-events~="${request?.answerEvent}"]`,
	);
	await expect(line).toHaveCount(1);
	await expect(line).toContainText(name ?? "");
	expect(errors).toEqual([]);
});
