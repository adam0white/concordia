import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
export default defineConfig({
	plugins: [
		react(),
		{
			name: "literal-file-entry",
			generateBundle: {
				order: "post",
				handler(_options, bundle) {
					const html = bundle["index.html"];
					if (html?.type !== "asset") throw Error("Missing built entry HTML");
					this.emitFile({
						type: "asset",
						fileName: "file/index.html",
						source: html.source,
					});
				},
			},
		},
		...(process.env.CF_BUILD ? [cloudflare({ assetsOnly: true })] : []),
	],
	worker: { format: "es" },
});
