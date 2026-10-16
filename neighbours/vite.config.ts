import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
export default defineConfig({
	plugins: [
		react(),
		...(process.env.CF_BUILD ? [cloudflare({ assetsOnly: true })] : []),
	],
	worker: { format: "es" },
});
