/** Import every exact current core/experiment module with plain Node, plus an
 * independently copied byte-identical candidate snapshot. This runs before any
 * commit; a clean old HEAD is not evidence for changed dependency/runtime bytes.
 */
import { createHash } from "node:crypto";
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const app = resolve(import.meta.dirname, ".."),
	temporary = mkdtempSync(join(tmpdir(), "neighbours-imports-"));
const files = [];
function copy(folder) {
	for (const entry of readdirSync(join(app, folder), { withFileTypes: true })) {
		const name = join(folder, entry.name);
		if (entry.isDirectory()) copy(name);
		else if (/\.(ts|tsx)$/.test(name)) {
			const raw = readFileSync(join(app, name)),
				target = join(temporary, name);
			mkdirSync(dirname(target), { recursive: true });
			writeFileSync(target, raw);
			const sha = createHash("sha256").update(raw).digest("hex");
			if (
				createHash("sha256").update(readFileSync(target)).digest("hex") !== sha
			)
				throw Error("Snapshot readback differs");
			files.push({ name, sha });
		}
	}
}
try {
	copy("src");
	writeFileSync(
		join(temporary, "package.json"),
		JSON.stringify({ type: "module" }),
	);
	symlinkSync(join(app, "node_modules"), join(temporary, "node_modules"));
	let count = 0;
	for (const folder of ["src/core", "src/experiments"])
		for (const file of readdirSync(join(app, folder)).filter((name) =>
			name.endsWith(".ts"),
		)) {
			await import(pathToFileURL(join(app, folder, file)).href);
			await import(pathToFileURL(join(temporary, folder, file)).href);
			count++;
		}
	for (const file of files)
		if (
			createHash("sha256")
				.update(readFileSync(join(app, file.name)))
				.digest("hex") !== file.sha
		)
			throw Error("Source changed during Node import check");
	console.log(
		`PASS: ${count} current core/experiment modules import in plain Node and an exact independent source snapshot; ${files.length} full source bodies verified`,
	);
} finally {
	rmSync(temporary, { recursive: true, force: true });
}
