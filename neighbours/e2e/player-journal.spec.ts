import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { expect, type Page, type TestInfo, test } from "@playwright/test";
import { closeSaves, openSaves, showTab } from "./session-helpers";

async function exportPacket(page: Page, info: TestInfo, name: string) {
	await openSaves(page);
	const link = page.getByRole("link", { name: /Download save/ });
	const old = (await link.count()) ? await link.getAttribute("href") : null;
	await page.getByRole("button", { name: "Export", exact: true }).click();
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
async function step(page: Page) {
	const clock = page.locator(".town-time strong");
	const before = await clock.textContent();
	const button = page.getByRole("button", { name: "Step: Advance one round" });
	await expect(button).toBeEnabled();
	await button.click();
	await expect(clock).not.toHaveText(before ?? "");
}
/** Step actual rounds until `done` holds, at most `limit` rounds. */
async function stepUntil(page: Page, done: () => Promise<boolean>, limit = 40) {
	for (let i = 0; i < limit && !(await done()); i++) await step(page);
	expect(await done()).toBe(true);
}

test("the player walks, speaks with a promise and keeps it; the journal records each step from actual events", async ({
	page,
}, info) => {
	test.setTimeout(180_000);
	await page.goto("/");
	await page.getByRole("button", { name: "Enter town", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Play town", exact: true }),
	).toBeVisible({ timeout: 60_000 });

	// Walk to the hall from the journal drawer, where walking needs no resident.
	await showTab(page, "Journal");
	const you = page.locator(".journal .speak-panel");
	await you.locator(".walk-list button", { hasText: "Flooded hall" }).click();
	await expect(you.locator(".player-place")).toContainText("Walking to");
	await stepUntil(page, async () =>
		/You are at Flooded hall/.test(
			(await you.locator(".player-place").textContent()) ?? "",
		),
	);

	// Speak to someone actually here, choosing a promise of one hour's work.
	await stepUntil(
		page,
		async () => (await you.locator(".your-company button").count()) > 0,
		24,
	);
	await you.locator(".your-company button").first().click();
	const panel = page.locator(".person-panel .speak-panel");
	const name = (await page.locator(".person-panel h2").textContent())?.trim();
	expect(name).toBeTruthy();
	const promise = panel.getByRole("button", {
		name: "Promise an hour",
		exact: true,
	});
	await expect(promise).toBeEnabled();
	await promise.click();
	const answer = panel.locator(".latest-answer");
	await expect(answer.locator(".voice").first()).not.toBeEmpty();
	await expect(answer).toContainText("You made a promise and asked");

	// HF may refuse; a refusal holds no pledge. Otherwise keep the pledge.
	const packet = await exportPacket(page, info, "after-speech");
	const request = packet.runtime.player.requests.at(-1);
	expect(request).toBeDefined();
	const pledged = Boolean(request.pledgeId);
	if (pledged) {
		const start = panel.getByRole("button", { name: "Start the hour" });
		await stepUntil(page, async () => (await start.count()) > 0, 8);
		await start.click();
		await expect(panel.locator(".player-place")).toContainText(
			/Walking to|Working at/,
		);
		await stepUntil(
			page,
			async () =>
				!/Working at|Walking to/.test(
					(await panel.locator(".player-place").textContent()) ?? "",
				),
			30,
		);
	}
	// Let the resident's own next decision happen; HF decides what they do.
	for (let i = 0; i < 4; i++) await step(page);

	await showTab(page, "Journal");
	const lines = page.locator(".journal .player-journal li");
	await expect(lines.first()).toBeVisible();
	const saved = await exportPacket(page, info, "after-journal");
	const player = saved.runtime.player as {
		log: { id: number }[];
		requests: {
			id: number;
			answerEvent: number;
			answer: { verdict: string };
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
	if (kept?.answer.verdict === "refused")
		expect(asked[0]).toContain("It was a refusal.");
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
