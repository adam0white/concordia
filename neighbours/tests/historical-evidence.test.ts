import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("retains every frozen historical test/fixture body without relabelling it as HF4 evidence", () => {
	const manifest = JSON.parse(
		readFileSync(
			new URL("../archive/hf3-source/historical-tests.json", import.meta.url),
			"utf8",
		),
	) as {
		files: {
			path: string;
			capturePath: string;
			sha256: string;
			bytes: number;
		}[];
	};
	expect(manifest.files.length).toBeGreaterThan(50);
	for (const file of manifest.files) {
		const raw = readFileSync(
			new URL(`../archive/hf3-source/${file.capturePath}`, import.meta.url),
		);
		expect(raw.length, file.path).toBe(file.bytes);
		expect(createHash("sha256").update(raw).digest("hex"), file.path).toBe(
			file.sha256,
		);
	}
});
