import { defineConfig } from "cf/config";
export default defineConfig({
	accountId: "a20259cba74e506296745f9c67c1f3bc",
	worker: {
		name: "alder-quay-neighbours",
		compatibilityDate: "2026-10-20",
		domains: ["neighbours.adamwhite.work"],
		assets: { notFoundHandling: "single-page-application" },
	},
});
