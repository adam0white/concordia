/** Verify the served build's identity against this checkout and installed HF. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const app = resolve(import.meta.dirname, "..");
const root = resolve(app, "..");
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const name = "@adam0white/human-framework";
const declared = read(resolve(app, "package.json")).dependencies[name];
const installed = read(resolve(app, "node_modules", name, "package.json"));
assert.equal(installed.name, name);
assert.equal(
	installed.version,
	declared,
	"Installed HF differs from the exact game pin",
);
const git = (...args) =>
	execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const commit = git("rev-parse", "HEAD");
const dirty = Boolean(git("status", "--porcelain"));
if (process.argv.includes("--clean"))
	assert.equal(dirty, false, "Deployment requires clean source");
const paths = process.argv.slice(2).filter((arg) => arg !== "--clean");
assert(paths.length, "Pass the actual built release.json path");
for (const path of paths) {
	const release = read(resolve(app, path));
	assert.equal(
		release.framework,
		installed.version,
		"Built framework stamp is stale",
	);
	assert.equal(release.hf, installed.version, "Built HF stamp is stale");
	assert.equal(release.commit, commit, "Built source commit is stale");
	assert.equal(release.dirty, dirty, "Built source cleanliness is stale");
}
console.log(
	`Verified ${paths.length} built release record(s): ${commit}, HF ${installed.version}, dirty:${dirty}`,
);
