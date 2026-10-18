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

type OutcomeGate = { held: (() => void)[]; holding: boolean };

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
					const musa = event.data.view.people.find(
						(p: { id: string }) => p.id === "musa",
					);
					if (
						!gate.holding &&
						!musa.commitments.some(
							(p: { label: string; status: string }) =>
								p.label === "Harvest food for Sam" && p.status === "kept",
						)
					)
						return;
					gate.holding = true;
					event.stopImmediatePropagation();
					gate.held.push(() => this.onmessage?.call(this, event));
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
	await page.locator('.neighbour-strip [data-person-id="musa"]').click();
	await openSaves(page);
	await page.getByRole("checkbox", { name: "Pause on new stories" }).uncheck();
	await closeSaves(page);
	await page
		.getByRole("combobox", { name: "Playback speed" })
		.selectOption("120");
	await page.getByRole("button", { name: "Play town", exact: true }).click();
	const held = () =>
		page.evaluate(
			() =>
				(window as unknown as { personOutcomeGate: OutcomeGate })
					.personOutcomeGate.held.length,
		);
	await expect.poll(held, { timeout: 60000 }).toBe(1);
	await page
		.getByRole("button", { name: "Next outcome for Musa", exact: true })
		.click();
	await expect.poll(held, { timeout: 60000 }).toBe(2);
	await page.evaluate(() => {
		const gate = (window as unknown as { personOutcomeGate: OutcomeGate })
			.personOutcomeGate;
		for (const reply of gate.held.splice(0)) reply();
	});
	await expect(page.locator(".advance-notice")).toBeVisible();
	await expect(page.locator(".advance-notice")).not.toContainText(
		"kept a promise: Harvest food for Sam",
	);
	await expect(
		page.getByRole("button", { name: "Play town", exact: true }),
	).toBeEnabled();
});
