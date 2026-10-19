import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { expect, type Page, test } from "@playwright/test";
import { closeSaves, openSaves, showTab } from "./session-helpers";

async function exported(page: Page) {
	await openSaves(page);
	const link = page.getByRole("link", { name: /Download save/ });
	const previous = (await link.count())
		? await link.getAttribute("href")
		: null;
	await page.getByRole("button", { name: "Export", exact: true }).click();
	await expect
		.poll(() => link.getAttribute("href").catch(() => null))
		.not.toBe(previous);
	const pending = page.waitForEvent("download");
	await link.click();
	const file = await (await pending).path();
	if (!file) throw Error("Missing actual save");
	const packet = JSON.parse(gunzipSync(await readFile(file)).toString("utf8"));
	await closeSaves(page);
	return packet;
}
/** Real fresh208-person town, bus intervention and autonomous HF promise outcome. */
test("following Musa stops at his actual kept promise and preserves exact reload", async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	const errors: string[] = [];
	page.on("pageerror", (e) => errors.push(e.message));
	await page.goto("/");
	await page.getByRole("button", { name: "Enter town", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Play town", exact: true }),
	).toBeEnabled({ timeout: 60000 });
	await showTab(page, "Help");
	await page.getByRole("button", { name: /Restore public bus/ }).click();
	await expect(page.locator(".intervention-result")).toContainText(
		"Bus restored",
	);
	await showTab(page, "Town");
	await page.locator('.neighbour-strip [data-person-id="musa"]').click();
	const next = page.getByRole("button", {
		name: "Next outcome for Musa",
		exact: true,
	});
	await expect(next).toHaveAttribute(
		"title",
		/resolved promise or invitation outcome/,
	);
	const before = await exported(page);
	expect(before.runtime.seed).toBe(42);
	expect(before.runtime.people).toHaveLength(208);
	expect(before.runtime.bus).toBe(true);
	const promise = (packet: typeof before) =>
		packet.runtime.people
			.find((r: { person: { id: string } }) => r.person.id === "musa")
			?.person.agenda.commitments.find(
				(c: { label: string }) => c.label === "Harvest food for Sam",
			);
	expect(promise(before)?.status).toBe("pending");
	await next.click();
	await expect(page.locator(".advance-notice")).toContainText(
		"Musa kept a promise: Harvest food for Sam.",
		{ timeout: 60000 },
	);
	await expect(next).toBeEnabled();
	await expect(
		page.getByRole("button", { name: "Play town", exact: true }),
	).toBeEnabled();
	const after = await exported(page);
	expect(promise(after)?.status).toBe("kept");
	expect(after.rounds).toBeGreaterThan(before.rounds);
	expect(after.runtime.now - before.runtime.now).toBeLessThan(1440);
	await page.reload();
	await page.getByRole("button", { name: "Enter town", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Play town", exact: true }),
	).toBeEnabled({ timeout: 60000 });
	await expect(page.locator(".advance-notice")).toHaveCount(0);
	expect(await exported(page)).toEqual(after);
	expect(errors).toEqual([]);
});

type HeldReply = { advance?: { reason: string; rounds: number } };
type OutcomeGate = {
	held: { reply: HeldReply; release: () => void }[];
	holding: boolean;
};
const gateOf = (page: Page) =>
	page.evaluate(() =>
		(
			window as unknown as { personOutcomeGate: OutcomeGate }
		).personOutcomeGate.held.map((h) => h.reply),
	);

/**
 * Lea keeps two promises on Day 1: the hall inspection at 15:15, then the displaced class at 18:15. Playback's
 * state for the first is held while a follow advance is queued behind it. The
 * advance must report the second promise, not the first one that preceding
 * playback already resolved. Each wait is on an actual worker reply: the held
 * playback state, then the advance's own completion reply.
 */
test("a queued follow advance excludes the outcome resolved by preceding playback", async ({
	page,
}) => {
	await page.addInitScript(() => {
		const gate: OutcomeGate = { held: [], holding: false };
		Object.assign(window, { personOutcomeGate: gate });
		const NativeWorker = window.Worker;
		window.Worker = class extends NativeWorker {
			constructor(url: string | URL, options?: WorkerOptions) {
				super(url, options);
				this.addEventListener("message", (event: MessageEvent) => {
					if (event.data.type !== "state") return;
					const lea = event.data.view.people.find(
						(p: { id: string }) => p.id === "lea",
					);
					if (
						!gate.holding &&
						!lea.commitments.some(
							(p: { label: string; status: string }) =>
								p.label === "Inspect the hall before resuming classes there" &&
								p.status === "kept",
						)
					)
						return;
					// From here every state reply is held, so playback cannot send another step.
					gate.holding = true;
					event.stopImmediatePropagation();
					gate.held.push({
						reply: { advance: event.data.advance },
						release: () => this.onmessage?.call(this, event),
					});
				});
			}
		};
	});
	await page.goto("/");
	await page.getByRole("button", { name: "Enter town", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Play town", exact: true }),
	).toBeEnabled({ timeout: 60000 });
	await showTab(page, "Help");
	await page.getByRole("button", { name: /Restore public bus/ }).click();
	await expect(page.locator(".intervention-result")).toContainText(
		"Bus restored",
	);
	await showTab(page, "Town");
	await page.locator('.neighbour-strip [data-person-id="lea"]').click();
	await openSaves(page);
	await page.getByRole("checkbox", { name: "Pause on new stories" }).uncheck();
	await closeSaves(page);
	await page
		.getByRole("combobox", { name: "Playback speed" })
		.selectOption("120");
	await page.getByRole("button", { name: "Play town", exact: true }).click();
	// Playback's step reply that resolved the first promise is held, unrendered.
	await expect.poll(() => gateOf(page), { timeout: 60000 }).toEqual([{}]);
	await page
		.getByRole("button", { name: "Next outcome for Lea", exact: true })
		.click();
	// The advance's own completion reply, queued behind the held step.
	await expect
		.poll(() => gateOf(page), { timeout: 60000 })
		.toEqual([
			{},
			{ advance: expect.objectContaining({ reason: "person-story" }) },
		]);
	await page.evaluate(() => {
		const gate = (window as unknown as { personOutcomeGate: OutcomeGate })
			.personOutcomeGate;
		for (const held of gate.held.splice(0)) held.release();
	});
	const notice = page.locator(".advance-notice");
	await expect(notice).toContainText(
		"Lea kept a promise: Hold the displaced class.",
	);
	await expect(notice).not.toContainText("Inspect the hall");
	await expect(
		page.getByRole("button", { name: "Play town", exact: true }),
	).toBeEnabled();
});
