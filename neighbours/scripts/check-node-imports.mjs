/** Load every core and experiment module with plain Node from a clean checkout of HEAD (no Vite resolution). */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const app = resolve(import.meta.dirname, "..");
const repo = execFileSync("git", ["rev-parse", "--show-toplevel"], {
	cwd: app,
	encoding: "utf8",
}).trim();
const dir = join(mkdtempSync(join(tmpdir(), "neighbours-imports-")), "tree");
execFileSync("git", ["worktree", "add", "--detach", "--quiet", dir, "HEAD"], {
	cwd: repo,
});
try {
	const clean = join(dir, "neighbours");
	symlinkSync(join(app, "node_modules"), join(clean, "node_modules"));
	let count = 0;
	for (const folder of ["src/core", "src/experiments"])
		for (const file of readdirSync(join(app, folder)).filter((f) =>
			f.endsWith(".ts"),
		))
			await import(pathToFileURL(join(app, folder, file)).href);
	for (const folder of ["src/core", "src/experiments"])
		for (const file of readdirSync(join(clean, folder)).filter((f) =>
			f.endsWith(".ts"),
		)) {
			await import(pathToFileURL(join(clean, folder, file)).href);
			count++;
		}
	console.log(
		`PASS: ${count} modules load with plain Node from a clean HEAD checkout`,
	);
} finally {
	execFileSync("git", ["worktree", "remove", "--force", dir], { cwd: repo });
	rmSync(resolve(dir, ".."), { recursive: true, force: true });
}
