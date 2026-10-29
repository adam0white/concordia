/** Historical byte custody only. HF3 generators cannot supply current HF4
 * numerical evidence. The original checker/YAML and every report stay pinned;
 * current4 contracts and full native continuation have separate gates. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const app = resolve(import.meta.dirname, "..");
const history = JSON.parse(
	readFileSync(
		resolve(app, "archive/hf3-source/historical-reports.json"),
		"utf8",
	),
);
const requested = process.argv.slice(2);
const records = requested.length
	? requested.map((path) => {
			const record = history.records.find((item) => item.path === path);
			assert(record, `Unknown historical evidence: ${path}`);
			return record;
		})
	: history.records;
for (const record of records) {
	const path = resolve(app, record.path),
		raw = readFileSync(path);
	assert.equal(
		raw.length,
		record.bytes,
		`Historical bytes changed: ${record.path}`,
	);
	assert.equal(
		createHash("sha256").update(raw).digest("hex"),
		record.sha256,
		`Historical evidence changed: ${record.path}`,
	);
	assert.equal(
		statSync(path).mode & 0o777,
		Number.parseInt(record.mode, 8) & 0o777,
		`Historical mode changed: ${record.path}`,
	);
	console.log(
		`HISTORICAL ONLY: exact original ${record.path} (${record.gitObject}); no HF4 source/numeric/model success claim.`,
	);
}
console.log(
	`PASS: ${records.length} original report bodies retained. Current HF4 gates remain separate.`,
);
