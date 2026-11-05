/** Scope: one hypothetical physical ablation; never imported by gameplay or native admission. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";
import { ENGINE_VERSION, FRAMEWORK_VERSION } from "@adam0white/human-framework";
import type { Intervention, TownEvent } from "../src/contracts.ts";
import { canReceiveInspectionRequest } from "../src/core/assistance.ts";
import { presentAt } from "../src/core/encounters.ts";
import { allEvenings } from "../src/core/evenings.ts";
import { createRuntime, restoreRuntime, type Save } from "../src/core/index.ts";
import { Runtime } from "../src/core/runtime.ts";

const app = resolve(import.meta.dirname, "..");
const json = (x: unknown) => JSON.stringify(x);
export const sha = (x: string | Uint8Array) =>
	createHash("sha256").update(x).digest("hex");
const hall = (s: Save) => {
	const p = s.places.find((p) => p.id === "hall");
	assert(p);
	return p;
};
/** Complete recursive diff, including unknown fields; no projection can hide a Person/RNG change. */
export function differences(a: unknown, b: unknown, path = ""): string[] {
	if (Object.is(a, b)) return [];
	if (!a || !b || typeof a !== "object" || typeof b !== "object") return [path];
	const left = a as Record<string, unknown>,
		right = b as Record<string, unknown>;
	return [...new Set([...Object.keys(left), ...Object.keys(right)])].flatMap(
		(k) => differences(left[k], right[k], `${path}/${k}`),
	);
}
export function physicalArm(actual: Save, capacity: 10 | 14): Runtime {
	assert.deepEqual(actual.pending, []);
	assert(actual.assistance?.opened && actual.assistance.result);
	assert.equal(hall(actual).capacity, 14);
	assert(hall(actual).reserved <= 10);
	assert(
		!allEvenings(actual).some((e) =>
			["preparing", "prepared"].includes(e.stage),
		),
	);
	const clone = structuredClone(actual);
	hall(clone).capacity = capacity;
	const expected =
		capacity === 14
			? []
			: [`/places/${actual.places.findIndex((p) => p.id === "hall")}/capacity`];
	assert.deepEqual(differences(actual, clone), expected);
	// Runtime's raw constructor is deliberately NOT restore/admission. No other field is reconciled.
	return new Runtime(clone);
}
function sourceFiles(directory: string): string[] {
	return readdirSync(resolve(app, directory), { withFileTypes: true }).flatMap(
		(e) =>
			e.isDirectory()
				? sourceFiles(`${directory}/${e.name}`)
				: [`${directory}/${e.name}`],
	);
}
function sources() {
	return Object.fromEntries(
		[
			...sourceFiles("src"),
			"scripts/capacity-study.ts",
			"package.json",
			"package-lock.json",
			"pnpm-lock.yaml",
			...sourceFiles("vendor"),
		]
			.sort()
			.map((p) => [p, sha(readFileSync(resolve(app, p)))]),
	);
}
function eventSummary(s: Save) {
	return allEvenings(s).map((e) => {
		const guests = Object.entries(e.replies).filter(
			([id]) => id !== e.organiserId,
		);
		return {
			...e,
			counts: {
				invited: guests.length,
				accepted: guests.filter(([, r]) => r.reply === "accepted").length,
				attempted: guests.filter(([, r]) => r.attempted).length,
				delivered: guests.filter(([, r]) => r.delivered).length,
			},
		};
	});
}
export function runStudy(output: string, selectionPath?: string) {
	mkdirSync(output, { recursive: true });
	const files: Record<
		string,
		{ sha256: string; bytes: number; uncompressedSha256: string }
	> = {};
	function save(name: string, value: unknown) {
		const text = `${json(value)}\n`,
			bytes = gzipSync(text);
		writeFileSync(resolve(output, `${name}.json.gz`), bytes);
		files[`${name}.json.gz`] = {
			sha256: sha(bytes),
			bytes: bytes.length,
			uncompressedSha256: sha(text),
		};
	}
	const initialSources = sources();
	const git = (args: string[]) =>
		execFileSync("git", args, { cwd: app, encoding: "utf8" }).trim();
	const identity = {
		git: git(["rev-parse", "HEAD"]),
		branch: git(["branch", "--show-current"]),
		dirty: git(["status", "--porcelain", "--untracked-files=all"]),
		node: process.version,
		framework: FRAMEWORK_VERSION,
		engine: ENGINE_VERSION,
		sources: initialSources,
		sourceFingerprint: sha(json(initialSources)),
		script: "scripts/capacity-study.ts",
		command: `PATH=/opt/homebrew/bin:$PATH node scripts/capacity-study.ts ${output}${selectionPath ? ` ${selectionPath}` : ""}`,
		selectionHistory: selectionPath
			? { path: selectionPath, sha256: sha(readFileSync(selectionPath)) }
			: null,
	};
	assert.equal(identity.git, "bc6681263775d94df60f39d3ccbdf1b660db51d7");
	assert.equal(identity.branch, "gd-resume-neighbours-capacity-study");
	const live = createRuntime(42) as Runtime;
	const initial = live.export() as Save;
	const inputs: { atRound: number; input: Intervention }[] = [];
	const history: unknown[] = [];
	let actual: Save | undefined;
	if (selectionPath) {
		const recorded = JSON.parse(
			gunzipSync(readFileSync(selectionPath)).toString(),
		) as {
			initial: Save;
			inputs: typeof inputs;
			history: { round: number; stateSha256: string }[];
		};
		assert.deepEqual(initial, recorded.initial);
		inputs.push(...recorded.inputs);
		for (const boundary of recorded.history) {
			for (const i of inputs.filter((i) => i.atRound === live.s.round))
				live.intervene(i.input);
			live.step();
			assert.equal(live.s.round, boundary.round);
			assert.equal(
				sha(json(live.s)),
				boundary.stateSha256,
				"Selection history replay drift",
			);
		}
		history.push(...recorded.history);
		actual = live.export() as Save;
	} else
		for (let n = 0; n <= 2400; n++) {
			if (
				live.s.hallSafe &&
				!live.s.assistance &&
				canReceiveInspectionRequest(live.actor("ada"))
			) {
				const input: Intervention = {
					kind: "request-inspection",
					actorId: "ada",
					proposalOrigin: { kind: "authored" },
					proposal: {
						schema: "neighbours-gm-proposal@1",
						kind: "inspection-request",
						target: "hall-annex",
						cue: "dry-sound",
						windowMinutes: 1440,
					},
				};
				live.intervene(input);
				inputs.push({ atRound: live.s.round, input });
				console.log(json({ requestAt: live.s.now, round: live.s.round }));
			}
			if (
				live.s.assistance?.opened &&
				hall(live.s).reserved <= 10 &&
				!allEvenings(live.s).some((e) =>
					["preparing", "prepared"].includes(e.stage),
				)
			) {
				actual = live.export() as Save;
				break;
			}
			if (n === 2400) break;
			const beforeEvent = live.s.nextEvent;
			live.step();
			history.push({
				round: live.s.round,
				at: live.s.now,
				hall: live.s.hall,
				safe: live.s.hallSafe,
				reserved: hall(live.s).reserved,
				events: live.s.events.filter((e) => e.id >= beforeEvent),
				stateSha256: sha(json(live.s)),
			});
			if (n % 96 === 95)
				console.log(
					json({
						selectionRound: live.s.round,
						at: live.s.now,
						hallSafe: live.s.hallSafe,
					}),
				);
		}
	save("selection-history", { initial, inputs, history });
	if (!actual) {
		const report = {
			schema: "neighbours-capacity-study@1",
			identity,
			status: "no-safe-opened-checkpoint",
			inputs,
			round: live.s.round,
			assistance: live.s.assistance ?? null,
			files,
		};
		writeFileSync(
			resolve(output, "result.json"),
			`${JSON.stringify(report, null, 2)}\n`,
		);
		return report;
	}
	const upcoming = allEvenings(actual)
		.filter((e) => e.startsAt > actual.now)
		.sort((a, b) => a.startsAt - b.startsAt || a.id.localeCompare(b.id))[0];
	const recurrence = actual.socialEvenings?.recurrence;
	assert(
		upcoming || recurrence,
		"No scheduled window: stop, do not search again",
	);
	const scheduledAt = recurrence
		? recurrence.firstStartsAt + recurrence.cycles.length * 7 * 1440
		: 0;
	const event = upcoming
		? {
				id: upcoming.id,
				startsAt: upcoming.startsAt,
				endsAt: upcoming.endsAt,
				instantiated: true,
			}
		: {
				id: `weekly-${recurrence?.cycles.length}-class`,
				startsAt: scheduledAt,
				endsAt: scheduledAt + 60,
				instantiated: false,
			};
	assert(event.startsAt > actual.now);
	// A schedule descriptor is not an invitation or fabricated native EveningEvent.
	const actualHash = sha(json(actual));
	save("actual-checkpoint", {
		schema: "neighbours/concordia@1",
		rounds: actual.round,
		runtime: actual,
	});
	const restored = restoreRuntime(actual);
	assert.deepEqual(restored.export(), actual);
	const replay = selectionPath ? restoreRuntime(actual) : createRuntime(42);
	for (let round = 0; !selectionPath && round < actual.round; round++) {
		for (const i of inputs.filter((i) => i.atRound === round))
			replay.intervene(i.input);
		replay.step();
	}
	assert.deepEqual(
		replay.export(),
		actual,
		"Ordinary input replay changed checkpoint",
	);
	for (let n = 0; n < 8; n++) {
		live.step();
		restored.step();
		replay.step();
	}
	assert.deepEqual(live.export(), restored.export());
	assert.deepEqual(live.export(), replay.export());
	save("actual-legal-continuation", { rounds: 8, runtime: live.export() });
	const endAt = event.endsAt + 7 * 1440;
	const arms = ([10, 14] as const).map((capacity) => {
		const runtime = physicalArm(actual, capacity);
		const start = runtime.export() as Save;
		save(`research-${capacity}-initial`, start);
		if (capacity === 10)
			assert.throws(
				() => restoreRuntime(start),
				/Invalid resources or reservation/,
			);
		const trace: unknown[] = [],
			events: TownEvent[] = [],
			activity: { id: string; at: number; event: TownEvent }[] = [];
		const arrivals: Record<
			string,
			Record<string, { at: number; awake: boolean }>
		> = {};
		let maximumReserved = hall(start).reserved;
		const saturatedAt: number[] = [];
		while (runtime.s.now < endAt) {
			const beforeEvent = runtime.s.nextEvent;
			for (const id of runtime.prepareRound()) {
				const chosen = runtime.choose(id);
				runtime.apply(id, chosen);
				maximumReserved = Math.max(maximumReserved, hall(runtime.s).reserved);
				assert(hall(runtime.s).reserved <= capacity);
			}
			assert.deepEqual(runtime.s.pending, []);
			if (hall(runtime.s).reserved === capacity)
				saturatedAt.push(runtime.s.now);
			const emitted = runtime.s.events.filter((e) => e.id >= beforeEvent);
			events.push(...structuredClone(emitted));
			for (const e of emitted)
				if (
					e.actorId &&
					e.at > actual.now &&
					["started", "completed", "attempt-failed", "interrupted"].includes(
						e.kind,
					)
				)
					activity.push({ id: e.actorId, at: e.at, event: structuredClone(e) });
			for (const e of allEvenings(runtime.s)) {
				const reached = arrivals[e.id] ?? {};
				arrivals[e.id] = reached;
				for (const p of runtime.s.people)
					if (
						p.job &&
						[`attend:${e.id}`, `host:${e.id}`].includes(p.job.offer.id) &&
						p.job.arrive <= runtime.s.now &&
						runtime.s.now <= p.job.end &&
						!reached[p.person.id]
					)
						reached[p.person.id] = {
							at: runtime.s.now,
							awake: presentAt(p, "hall", runtime.s.now),
						};
			}
			trace.push({
				at: runtime.s.now,
				reserved: hall(runtime.s).reserved,
				stateSha256: sha(json(runtime.s)),
			});
		}
		const end = runtime.export() as Save;
		const initialDiff = differences(actual, start);
		save(`research-${capacity}-trace`, { trace, events, activity, arrivals });
		save(`research-${capacity}-final`, end);
		const guests = new Set(
			allEvenings(end)
				.filter((e) => e.endsAt > actual.now)
				.flatMap((e) =>
					Object.entries(e.replies)
						.filter(([id, r]) => id !== e.organiserId && r.delivered)
						.map(([id]) => id),
				),
		);
		return {
			capacity,
			label:
				"hypothetical physical ablation of actual opened annex; not native admission",
			initialDiff,
			initialSha256: sha(json(start)),
			finalSha256: sha(json(end)),
			rounds: end.round - actual.round,
			endAt: end.now,
			maximumReserved,
			saturatedAt,
			evenings: eventSummary(end).filter((e) => e.endsAt > actual.now),
			arrivals,
			laterByEvening: allEvenings(end)
				.filter((e) => e.endsAt > actual.now)
				.map((e) => ({
					id: e.id,
					guests: Object.entries(e.replies)
						.filter(([id]) => id !== e.organiserId)
						.map(([id, reply]) => ({
							id,
							delivered: !!reply.delivered,
							nextStarted:
								activity.find(
									(a) =>
										a.id === id &&
										a.at > e.endsAt &&
										a.event.kind === "started",
								) ?? null,
							nextCompleted:
								activity.find(
									(a) =>
										a.id === id &&
										a.at > e.endsAt &&
										a.event.kind === "completed",
								) ?? null,
						})),
				})),
			knownNextActivities: end.people
				.filter((p) => p.known)
				.map((p) => ({
					id: p.person.id,
					name: p.person.name,
					events: activity
						.filter((a) => a.id === p.person.id && a.at > event.endsAt)
						.slice(0, 6),
				})),
			deliveredGuests: [...guests].sort(),
			nextActivityByGuest: [...guests]
				.sort()
				.map((id) => ({ id, next: activity.find((a) => a.id === id) ?? null })),
		};
	});
	assert.equal(sha(json(actual)), actualHash, "Actual checkpoint mutated");
	assert.deepEqual(
		sources(),
		initialSources,
		"Executed sources changed during run",
	);
	const low = arms[0],
		high = arms[1];
	assert(low && high);
	const report = {
		schema: "neighbours-capacity-study@1",
		identity,
		status: "paired",
		runtime:
			"TypeScript physical host / released HF; no Python orchestration claimed",
		initialPopulation: {
			total: initial.people.length,
			named: initial.people
				.filter((p) => p.known)
				.map((p) => ({ id: p.person.id, name: p.person.name })),
			background: initial.people.filter((p) => !p.known).length,
		},
		inputs,
		checkpoint: {
			at: actual.now,
			round: actual.round,
			sha256: actualHash,
			hall: hall(actual),
			assistance: actual.assistance,
			timber: actual.timber,
			event,
		},
		proofs: {
			restoredByteIdentity: true,
			ordinaryInputReplay: true,
			legalContinuationRounds: 8,
			actualUnmodified: true,
			nativeGuardPreserved: true,
			sourcesStable: true,
		},
		arms,
		gained: high.deliveredGuests.filter(
			(id) => !low.deliveredGuests.includes(id),
		),
		lost: low.deliveredGuests.filter(
			(id) => !high.deliveredGuests.includes(id),
		),
		files,
		limits: [
			"One predetermined seed and one pair, not a population estimate or HF superiority.",
			"Research capacity10 contradicts native opened-annex invariant and is intentionally not admitted/exported as native.",
			"Request, learning, assent, goal, time, all Persons/RNG and world initial state identical except declared capacity. No derived change.",
			"Arrivals are actual reached job boundaries, separate from awake overlap and delivered15minutes.",
			"Invited counts mean guests with actual received notice/reply records, not everyone who could see a noticeboard.",
			"Later events are observed actions/completions, not inferred motives or calibrated benefit.",
			"No new gameplay, provider/model calls, owner browser, source-unread visitor or player/taste acceptance.",
		],
	};
	writeFileSync(
		resolve(output, "result.json"),
		`${JSON.stringify(report, null, 2)}\n`,
	);
	console.log(
		json({
			status: report.status,
			checkpointRound: actual.round,
			event: event.id,
			gained: report.gained,
			lost: report.lost,
			arms: arms.map((a) => ({
				capacity: a.capacity,
				rounds: a.rounds,
				maximumReserved: a.maximumReserved,
				evenings: a.evenings.map((e) => ({ id: e.id, ...e.counts })),
			})),
		}),
	);
	return report;
}
if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
	assert(process.argv[2], "Supply an external output directory");
	runStudy(resolve(process.argv[2]), process.argv[3]);
}
