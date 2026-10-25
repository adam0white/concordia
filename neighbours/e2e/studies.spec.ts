import { readFile } from "node:fs/promises";
import { createRuntime } from "../src/core/index.ts";
import { Runtime } from "../src/core/runtime.ts";
import type { Save } from "../src/core/state.ts";
import { expect, type Page, step, test } from "./clock-fixture";
import { openOtherWays, openSaves, showTab } from "./session-helpers";

test.use({ actionTimeout: 15000 });

async function enter(page: Page) {
	await page.goto("/?lab=1");
	await page
		.getByRole("button", { name: /^(Enter|Return to) Alder Quay/ })
		.click();
	await expect(page.locator(".town-ready")).toBeVisible({ timeout: 60000 });
	await showTab(page, "Compare");
}
async function comparisonReady(page: Page) {
	await expect(
		page
			.locator(".day-comparison")
			.getByText("Resources and neighbour state at the end", { exact: true }),
	).toBeVisible({ timeout: 60000 });
	await expect(
		page.getByRole("button", { name: "Cancel comparison", exact: true }),
	).toHaveCount(0);
}
async function anotherSetup(page: Page) {
	const comparison = page.locator(".day-comparison");
	const retry = comparison.getByText("Try another comparison", { exact: true });
	if (await retry.isVisible()) {
		const details = retry.locator("..");
		if ((await details.getAttribute("open")) === null) await retry.click();
	}
	return comparison;
}

test("320px recorded studies show actual case outcomes, honest LLM limits and keyboard section selection", async ({
	page,
}) => {
	await page.setViewportSize({ width: 320, height: 740 });
	await enter(page);
	await showTab(page, "Recorded studies");
	const study = page.getByRole("region", {
		name: "Recorded hall inspection study",
	});
	await expect(study).toContainText("4 actual LLM calls");
	const table = study.getByRole("table").first();
	await expect(
		table.getByRole("row", { name: /LLM · actual model calls/ }),
	).toContainText("open-section");
	await expect(
		table.getByRole("row", { name: /HF · learned rules intact/ }),
	).toContainText("opened");
	const cases = study.getByRole("combobox", { name: /^Inspection case/ });
	await cases.selectOption("3");
	await expect(cases).toHaveValue("3");
	await expect(
		table.getByRole("row", { name: /LLM · actual model calls/ }),
	).toContainText("ask-inspector");
	await expect(
		table.getByRole("row", { name: /LLM · actual model calls/ }),
	).toContainText("Not completed");
	await expect(study).toContainText("Observed moisture: unknown");
	await study
		.getByText("Method, limits and original measurements", { exact: true })
		.click();
	await expect(study).toContainText("One model run per case");
	await expect(study).not.toContainText("No LLM arm");
	const downloaded = page.waitForEvent("download");
	await study
		.getByRole("link", { name: /Download recorded measurements/ })
		.click();
	const path = await (await downloaded).path();
	if (!path) throw Error("Missing recorded measurements download");
	const raw = JSON.parse(await readFile(path, "utf8"));
	expect(raw.calls).toHaveLength(4);
	// The raw baseline remains historical. Only full-report limits govern the UI.
	expect(
		raw.baseline.limits.some((limit: string) => limit.includes("No LLM arm")),
	).toBe(true);
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= innerWidth,
		),
	).toBe(true);
	await page.getByRole("combobox", { name: /^Study/ }).selectOption("cart");
	const cartReport = await (
		await page.request.get("/experiments/cart-choice-probe.json")
	).json();
	// The regenerated canonical run searched actual decisions without finding a matched opportunity.
	expect(cartReport.opportunity).toBeNull();
	expect(cartReport.raviDecisions).toBeGreaterThan(0);
	const results = page.locator(".study-results");
	await expect(
		results.locator("div").filter({ hasText: "With cart goal" }),
	).toHaveText("With cart goalNot recorded");
	await expect(
		results.locator("div").filter({ hasText: "Cart goal removed" }),
	).toHaveText("Cart goal removedNot recorded");
	await expect(results).toContainText(
		"This choice study did not measure completion",
	);
	await expect(results).not.toContainText("cart-slow");
});

test("actual tools and bus branches retain setup, separate history and mark a same-clock live change stale", async ({
	page,
}) => {
	await enter(page);
	let comparison = page.locator(".day-comparison");
	await comparison
		.getByLabel("Change in the second run")
		.selectOption("lend-tools");
	await comparison.getByLabel("Simulated time").selectOption("24");
	await comparison
		.getByRole("button", { name: "Compare from here", exact: true })
		.click();
	await comparisonReady(page);
	const checkpoint =
		(await comparison.locator(".comparison-checkpoint").textContent()) ?? "";
	expect(checkpoint).toContain("24 rounds (6 hours)");
	expect(checkpoint).toContain("Day 1, 08:00");
	await expect(
		comparison.getByRole("region", { name: "Changed resources" }),
	).toContainText("Tools owned, including in use");
	comparison = await anotherSetup(page);
	await comparison
		.getByLabel("Change in the second run")
		.selectOption("restore-bus");
	await showTab(page, "Town");
	await showTab(page, "Compare");
	comparison = await anotherSetup(page);
	await expect(comparison.getByLabel("Change in the second run")).toHaveValue(
		"restore-bus",
	);
	await expect(comparison.getByLabel("Simulated time")).toHaveValue("24");
	await comparison
		.getByRole("button", { name: "Compare from here", exact: true })
		.click();
	await comparisonReady(page);
	const history = page.getByRole("combobox", { name: /^Recent comparisons/ });
	await expect(history.locator("option")).toHaveCount(2);
	const options = await history.locator("option").evaluateAll((nodes) =>
		nodes.map((node) => ({
			value: (node as HTMLOptionElement).value,
			label: node.textContent ?? "",
		})),
	);
	const tools = options.find((option) => /lend tools/i.test(option.label));
	const bus = options.find((option) => /restore bus/i.test(option.label));
	expect(tools).toBeTruthy();
	expect(bus).toBeTruthy();
	if (!tools || !bus)
		throw Error("Both actual comparisons must remain available");
	expect(tools.value).not.toBe(bus.value);
	await history.selectOption(tools.value);
	await expect(comparison).toContainText("lend tools");
	await expect(comparison.locator(".comparison-checkpoint")).toHaveText(
		checkpoint,
	);
	await history.selectOption(bus.value);
	await expect(comparison).toContainText("restore bus");
	await expect(comparison.locator(".comparison-stale")).toHaveCount(0);
	await showTab(page, "Help");
	await page
		.getByRole("button", { name: /Lend.*tools|Add.*shared tools/i })
		.click();
	await showTab(page, "Compare");
	await expect(comparison.locator(".comparison-stale")).toContainText(
		"Your town has changed",
	);
	await expect(comparison.locator(".comparison-checkpoint")).toHaveText(
		checkpoint,
	);
	await expect(page.locator(".town-time")).toContainText("08:00");
	await showTab(page, "Town");
	await step(page);
	await showTab(page, "Compare");
	await expect(page.locator(".town-time")).toContainText("08:15");
	await expect(comparison.locator(".comparison-checkpoint")).toHaveText(
		checkpoint,
	);
	await expect(comparison.locator(".comparison-stale")).toBeVisible();
});

test("a genuinely completed hall disables tools before any branch starts", async ({
	page,
}) => {
	const host = new Runtime(createRuntime(42, 8).export() as Save);
	for (let round = 0; round < 96 * 40 && host.s.hall < 12; round++) host.step();
	expect(host.s.hall).toBe(12);
	expect(host.s.controls).toBe(3);
	const packet = {
		schema: "neighbours/concordia@1",
		rounds: host.s.round,
		runtime: host.export(),
	};
	await enter(page);
	await openSaves(page);
	await openOtherWays(page);
	await page.getByLabel("Import town save").setInputFiles({
		name: "actual-completed-hall.json",
		mimeType: "application/json",
		buffer: Buffer.from(JSON.stringify(packet)),
	});
	await showTab(page, "Compare");
	const comparison = page.locator(".day-comparison");
	await expect(
		comparison
			.getByLabel("Change in the second run")
			.locator('option[value="lend-tools"]'),
	).toHaveAttribute("disabled", "");
	await expect(comparison).toContainText(
		"Shared tools cannot be added right now",
	);
	await expect(
		comparison.getByRole("button", { name: "Compare from here", exact: true }),
	).toBeDisabled();
	await expect(
		comparison.getByRole("button", { name: "Cancel comparison", exact: true }),
	).toHaveCount(0);
	await expect(
		comparison.getByText("Resources and neighbour state at the end", {
			exact: true,
		}),
	).toHaveCount(0);
	await expect(comparison.getByRole("alert")).toHaveCount(0);
});
