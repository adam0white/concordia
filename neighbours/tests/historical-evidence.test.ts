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

it("retains the previous public206 workflow and browser bodies byte for byte", () => {
	const base = new URL("../archive/hf417-public206-source/", import.meta.url);
	const files = JSON.parse(
		readFileSync(new URL("manifest.json", base), "utf8"),
	) as { path: string; capturePath: string; bytes: number; sha256: string }[];
	expect(files.length).toBeGreaterThan(5);
	for (const file of files) {
		const raw = readFileSync(new URL(file.capturePath, base));
		expect(raw.length, file.path).toBe(file.bytes);
		expect(createHash("sha256").update(raw).digest("hex"), file.path).toBe(
			file.sha256,
		);
	}
});
