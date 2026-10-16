import { readFile } from "node:fs/promises";
import { expect, type Page, type TestInfo, test } from "@playwright/test";

type Packet = {
	schema: string;
	rounds: number;
	runtime: {
		seed: number;
		now: number;
		hf: string;
		people: { person: { trace: unknown[] } }[];
	};
};
async function pause(page: Page) {
	const button = page.getByRole("button", { name: "Pause town", exact: true });
	if (await button.isVisible()) await button.click();
	await expect(
		page.getByRole("button", { name: "Play town", exact: true }),
	).toBeVisible();
}
async function packet(
	page: Page,
	info: TestInfo,
	name: string,
): Promise<Packet> {
	const link = page.getByRole("link", { name: /Download save/ });
	const previous = (await link.count())
		? await link.getAttribute("href")
		: null;
	await page.getByRole("button", { name: "Export", exact: true }).click();
	await expect
		.poll(async () => {
			const href = await link.getAttribute("href").catch(() => null);
			return Boolean(href && href !== previous);
		})
		.toBe(true);
	const downloadPromise = page.waitForEvent("download");
	await link.click();
	const download = await downloadPromise;
	const path = info.outputPath(`${name}.json`);
	await download.saveAs(path);
	const result = JSON.parse(await readFile(path, "utf8")) as Packet;
	expect(result.schema).toBe("neighbours/concordia@1");
	expect(result.runtime.people).toHaveLength(208);
	expect(result.runtime.hf).toBe("2.2.1");
	return result;
}
async function importPacket(page: Page, value: unknown) {
	await page.getByLabel("Import town save").setInputFiles({
		name: "town.json",
		mimeType: "application/json",
		buffer: Buffer.from(JSON.stringify(value)),
	});
}

test("real WASM town preserves requested exports, imports, reloads and previous seed", async ({
	page,
}, info) => {
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto("/");
	await expect(
		page.getByRole("button", { name: "Pause town", exact: true }),
	).toBeVisible();
	await pause(page);
	const initial = await packet(page, info, "initial");
	expect(initial.runtime.seed).toBe(42);
	let current = initial;
	// Cross the autosave cadence; each export must own its request despite pause/step save traffic.
	for (let i = 0; i < 7; i++) {
		await page.getByRole("button", { name: "Advance one round" }).click();
		const next = await packet(page, info, `step-${i}`);
		expect(next.runtime.now).toBe(current.runtime.now + 15);
		expect(next.rounds).toBe(current.rounds + 1);
		current = next;
	}
	expect(
		current.runtime.people.every(
			(resident) => resident.person.trace.length > 0,
		),
	).toBe(true);
	await importPacket(page, initial);
	await expect
		.poll(async () => (await packet(page, info, "imported")).runtime.now)
		.toBe(initial.runtime.now);
	await page.getByRole("button", { name: "Advance one round" }).click();
	const continued = await packet(page, info, "continued");
	expect(continued.runtime.now).toBe(initial.runtime.now + 15);
	const minutes = continued.runtime.now;
	const committed = `Saved · Day ${Math.floor(minutes / 1440) + 1} · ${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
	await expect(page.getByText(committed, { exact: true })).toBeVisible();
	await page.reload();
	await expect(
		page.getByRole("button", { name: "Play town", exact: true }),
	).toBeVisible();
	expect(await packet(page, info, "reload")).toEqual(continued);
	await page.getByRole("tab", { name: "Inspector", exact: true }).click();
	await page.getByLabel("New town seed").fill("73");
	await page.getByRole("button", { name: "Start town", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Pause town", exact: true }),
	).toBeVisible();
	await pause(page);
	expect((await packet(page, info, "seed73")).runtime.seed).toBe(73);
	await page
		.getByRole("button", { name: "Restore previous town", exact: true })
		.click();
	await expect
		.poll(async () => (await packet(page, info, "previous")).runtime.seed)
		.toBe(42);
	const previousTown = await packet(page, info, "before-invalid");
	await page.getByLabel("Import town save").setInputFiles({
		name: "broken.json",
		mimeType: "application/json",
		buffer: Buffer.from('{"schema":"invalid"}'),
	});
	await expect(page.getByRole("alert")).toBeVisible();
	const before = await packet(page, info, "after-invalid");
	expect(before).toEqual(previousTown);
	await page.getByRole("button", { name: "Advance one round" }).click();
	expect((await packet(page, info, "usable")).runtime.now).toBe(
		before.runtime.now + 15,
	);
	expect(errors).toEqual([]);
});

test("390px town has no horizontal overflow and keyboard can open a person", async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto("/");
	await expect(
		page.getByRole("button", { name: "Pause town", exact: true }),
	).toBeVisible();
	await pause(page);
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= window.innerWidth,
		),
	).toBe(true);
	const ada = page.getByRole("button", { name: /Ada:/ }).first();
	await ada.focus();
	await page.keyboard.press("Enter");
	await expect(page.getByLabel("Ada's details", { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Close person details" }).focus();
	await page.keyboard.press("Enter");
	await expect(page.getByLabel("Ada's details", { exact: true })).toHaveCount(
		0,
	);
});
