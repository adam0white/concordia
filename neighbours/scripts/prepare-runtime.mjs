import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const FRAMEWORK_VERSION = "4.10.0";

const app = resolve(import.meta.dirname, "..");
const root = resolve(app, "..");
const output = resolve(app, "public/runtime");
await mkdir(output, { recursive: true });
for (const file of [
	"pyodide.mjs",
	"pyodide.asm.mjs",
	"pyodide.asm.wasm",
	"python_stdlib.zip",
	"pyodide-lock.json",
])
	await cp(resolve(app, "node_modules/pyodide", file), resolve(output, file));
const lock = JSON.parse(
	await readFile(resolve(app, "runtime-lock.json"), "utf8"),
);
let wheel;
try {
	wheel = await readFile(resolve(output, "absl.whl"));
} catch {
	const response = await fetch(lock.absl.url);
	if (!response.ok) throw Error("Cannot obtain pinned Python dependency");
	wheel = Buffer.from(await response.arrayBuffer());
}
if (createHash("sha256").update(wheel).digest("hex") !== lock.absl.sha256)
	throw Error("Python dependency integrity mismatch");
await writeFile(resolve(output, "absl.whl"), wheel);
const paths = [
	"concordia/__init__.py",
	"concordia/typing/__init__.py",
	"concordia/typing/entity.py",
	"concordia/environment/__init__.py",
	"concordia/environment/engine.py",
	"concordia/environment/step_controller.py",
	"concordia/contrib/__init__.py",
	"concordia/contrib/neighbours/__init__.py",
	"concordia/contrib/neighbours/engine.py",
];
const files = {};
for (const file of paths)
	files[file] = await readFile(resolve(root, file), "utf8");
const digest = createHash("sha256").update(JSON.stringify(files)).digest("hex");
await writeFile(
	resolve(output, "python-files.json"),
	JSON.stringify({ schema: 1, digest, files }),
);
let commit = "development",
	dirty = true;
try {
	commit = execFileSync("git", ["rev-parse", "HEAD"], {
		cwd: root,
		encoding: "utf8",
	}).trim();
	dirty = !!execFileSync("git", ["status", "--porcelain"], {
		cwd: root,
		encoding: "utf8",
	}).trim();
} catch {}
await writeFile(
	resolve(app, "public/release.json"),
	JSON.stringify(
		{
			commit,
			dirty,
			app: "neighbours@1",
			framework: FRAMEWORK_VERSION,
			hf: FRAMEWORK_VERSION,
			concordiaUpstream: "6fbfbc58f324aa74f78568c488713210889a801e",
			pythonBundle: digest,
			runtime: "Browser-local Python Concordia and released HF",
			pyodide: "314.0.7",
		},
		null,
		2,
	),
);
await cp(
	resolve(root, "LICENSE"),
	resolve(app, "public/concordia-license.txt"),
);
const notices = [
	["Concordia (Apache-2.0)", resolve(root, "LICENSE")],
	[
		`Human Framework ${FRAMEWORK_VERSION} (MIT)`,
		resolve(app, "node_modules/@adam0white/human-framework/LICENSE"),
	],
	[
		"@noble/hashes 2.4.0 (MIT)",
		resolve(app, "node_modules/@noble/hashes/LICENSE"),
	],
	["React (MIT)", resolve(app, "node_modules/react/LICENSE")],
	["React DOM (MIT)", resolve(app, "node_modules/react-dom/LICENSE")],
	["Pyodide 314.0.7 (MPL-2.0)", resolve(app, "licenses/pyodide.txt")],
	[
		"CPython 3.14.2 (PSF and incorporated licenses)",
		resolve(app, "licenses/cpython.txt"),
	],
	[
		"Literata (SIL OFL 1.1, latin subset via Fontsource 5.3.0)",
		resolve(app, "licenses/literata-ofl.txt"),
	],
	[
		"Caveat (SIL OFL 1.1, latin subset via Fontsource 5.3.0)",
		resolve(app, "licenses/caveat-ofl.txt"),
	],
];
const noticeParts = [
	"Neighbours third-party notices. Unmodified Pyodide source: https://github.com/pyodide/pyodide/tree/314.0.7 . CPython source: https://github.com/python/cpython/tree/v3.14.2 . Concordia source and modifications: https://github.com/adam0white/concordia/tree/neighbours . absl-py source: https://github.com/abseil/abseil-py/tree/v2.5.1 .",
];
for (const [name, path] of notices)
	noticeParts.push(`${name}\n${await readFile(path, "utf8")}`);
// The pinned wheel carries its original Apache-2.0 license. Extract without Python.
const { loadPyodide } = await import("pyodide");
const py = await loadPyodide({
	indexURL: `${resolve(app, "node_modules/pyodide")}/`,
	stdout: () => {},
});
py.FS.writeFile("/absl.whl", wheel);
noticeParts.push(
	"absl-py 2.5.1\n" +
		py.runPython(
			"import zipfile\nzipfile.ZipFile('/absl.whl').read('absl_py-2.5.1.dist-info/licenses/LICENSE').decode()",
		),
);
await writeFile(
	resolve(app, "public/third-party-notices.txt"),
	noticeParts.join("\n\n"),
);
console.log(
	`Prepared actual Python Concordia modules ${digest.slice(0, 12)} and self-hosted Python runtime.`,
);
