import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: false,
	workers: 1,
	retries: 0,
	timeout: 120_000,
	globalTimeout: 1_500_000,
	expect: { timeout: 30_000 },
	reporter: [["list"], ["html", { open: "never" }]],
	use: {
		baseURL: process.env.NEIGHBOURS_LIVE_URL ?? "http://127.0.0.1:5286",
		browserName: "chromium",
		trace:
			process.env.NEIGHBOURS_NO_SCREENSHOTS === "1"
				? {
						mode: "retain-on-failure",
						screenshots: false,
						snapshots: true,
						sources: true,
					}
				: "retain-on-failure",
		screenshot:
			process.env.NEIGHBOURS_NO_SCREENSHOTS === "1" ? "off" : "only-on-failure",
		viewport: { width: 1280, height: 900 },
	},
	webServer: process.env.NEIGHBOURS_LIVE_URL
		? undefined
		: {
				command:
					"npm run build && npx vite preview --host 127.0.0.1 --port 5286 --strictPort",
				url: "http://127.0.0.1:5286",
				reuseExistingServer: false,
				timeout: 120_000,
			},
});
