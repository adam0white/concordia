/** Optional engineering proof sink. Never imported by production. */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { TownRunOwner } from "../src/core/hf4-owner.ts";

let flushNativeProof: (() => void) | undefined;
export function facultyProof(owner: TownRunOwner, label: string) {
	const directory = process.env.NEIGHBOURS_FACULTY_PROOF_DIR;
	if (!directory) return (_extra?: unknown) => {};
	const initial = owner.export(),
		steps: unknown[] = [],
		advance = owner.advance.bind(owner);
	owner.advance = (...args) => {
		try {
			const result = advance(...args);
			steps.push({
				request: structuredClone(owner.lastRequest),
				response: structuredClone(result),
			});
			return result;
		} catch (error) {
			steps.push({
				request: structuredClone(owner.lastRequest),
				error: String(error),
			});
			throw error;
		}
	};
	return (extra?: unknown) => {
		const body = Buffer.from(
			JSON.stringify({
				scope:
					"Actual public Run engineering faculty inputs/responses and complete initial/final native archives. Not natural trajectory or frequency.",
				label,
				initial,
				steps,
				final: owner.export(),
				extra,
			}),
		);
		mkdirSync(directory, { recursive: true });
		const path = resolve(directory, `${label}.json.gz`);
		writeFileSync(path, gzipSync(body), { flag: "wx" });
		const readback = gunzipSync(readFileSync(path));
		if (!readback.equals(body)) throw Error("Faculty proof readback differs");
		writeFileSync(
			resolve(directory, `${label}-receipt.json`),
			JSON.stringify({
				label,
				path,
				bytes: body.length,
				sha256: createHash("sha256").update(body).digest("hex"),
				gzipBytes: readFileSync(path).length,
				fullReadback: true,
			}) + "\n",
			{ flag: "wx" },
		);
		owner.advance = advance;
		flushNativeProof?.();
	};
}

// Capture constructor practice and detached cold-replay steps too. Per-owner
// faculty packets above focus on the named control; this sink keeps every actual
// public owner step reached by the isolated test worker, including failed calls.
if (process.env.NEIGHBOURS_FACULTY_PROOF_DIR) {
	const owners = new Map<
		TownRunOwner,
		{ initial: ReturnType<TownRunOwner["export"]>; steps: unknown[] }
	>();
	const advance = TownRunOwner.prototype.advance;
	TownRunOwner.prototype.advance = function (...args) {
		let trace = owners.get(this);
		if (!trace) {
			trace = { initial: this.export(), steps: [] };
			owners.set(this, trace);
		}
		try {
			const result = advance.apply(this, args);
			trace.steps.push({
				request: structuredClone(this.lastRequest),
				response: structuredClone(result),
			});
			return result;
		} catch (error) {
			trace.steps.push({
				request: structuredClone(this.lastRequest),
				error: String(error),
			});
			throw error;
		}
	};
	const output = resolve(
		process.env.NEIGHBOURS_FACULTY_PROOF_DIR,
		`all-native-${process.pid}-${process.hrtime.bigint()}`,
	);
	flushNativeProof = () => {
		const body = Buffer.from(
			JSON.stringify({
				scope:
					"Every actual public owner step in this isolated correction test worker, including constructor practice and detached cold replay. No native state edits.",
				owners: [...owners].map(([owner, trace]) => ({
					...trace,
					final: owner.export(),
				})),
			}),
		);
		writeFileSync(output + ".json.gz", gzipSync(body), { flag: "w" });
		const bytes = readFileSync(output + ".json.gz");
		if (!gunzipSync(bytes).equals(body))
			throw Error("Complete native proof readback differs");
		writeFileSync(
			output + "-receipt.json",
			JSON.stringify({
				path: output + ".json.gz",
				bytes: body.length,
				sha256: createHash("sha256").update(body).digest("hex"),
				gzipBytes: bytes.length,
				owners: owners.size,
				fullReadback: true,
			}) + "\n",
			{ flag: "w" },
		);
	};
}
