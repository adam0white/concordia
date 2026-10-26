/** Browser-only ownership and recording. Never folded into rule hashes or read by replay. */
import {
	DEFAULT_NORMS,
	ENGINE_VERSION,
	isContinuingCommitment,
	type Person,
	projectCalendarPersona,
	snapshot,
} from "@adam0white/human-framework";
import {
	anchorPersonaLife,
	canonicalCast,
	canonicalPersona,
	claimCastChapterBatch,
	closePersonaBranch,
	createPersona,
	initialPersonaLife,
	type PersonaEnvelope,
	type PersonaLife,
	personaChannel,
	validatePersona,
	watchPersonaCheckpoint,
} from "@adam0white/lab-client";
import {
	ALLOCATION,
	CAST_EDITION,
	CAST_RULES,
	type CastRole,
	HOST_CAST,
} from "./core/canonical-cast.ts";
import type { CastChapter } from "./core/cast-continuity.ts";
import { createRuntime } from "./core/scenario.ts";
import type { Save } from "./core/state.ts";
import { isPassInput, passContinuationWitness } from "./pass-rafi.ts";
import {
	prepareReceivingTownCast as prepareTownCast,
	restoreReceivingRuntime as restoreRuntime,
} from "./received-town.ts";
import { lab } from "./ui/lab.tsx";
export interface TownPacket {
	schema: string;
	rounds: number;
	runtime: Save;
	castLocal?: {
		heads: PersonaEnvelope[];
		file: boolean;
		chapter: string;
		localOnly?: boolean;
		sources?: Record<string, Person>;
	};
	castBoundary?: { actorId: string; person: Person };
}
/** Explicit notes never need a town or an optional snapshot. */
export async function sendFeedbackWithoutRun(
	note: string,
	name: string,
	sharePlay = false,
): Promise<boolean> {
	await lab.sendFeedback(note, {
		name,
		run: { feedbackOnly: true },
		sharePlay,
	});
	return true;
}
export const shelf = personaChannel();
const stamp = () => ({
	game: "neighbours",
	build: lab.build().c ?? "development",
	engine: ENGINE_VERSION,
	rules: CAST_RULES,
});
const identity = (ids: string[]) => Object.fromEntries(ids.map((x) => [x, x]));
export class CastSession {
	generation = 0;
	heads: PersonaEnvelope[] = [];
	file = false;
	localOnly = false;
	active = true;
	private stop: () => void;
	private checkpointBusy = false;
	private sources: Record<string, Person> = {};
	private recordReady = false;
	private sourceQueue: Promise<void> = Promise.resolve();
	private staged?: {
		sources: Record<string, Person>;
		heads: PersonaEnvelope[];
		file: boolean;
		generation: number;
		localOnly: boolean;
	};
	constructor(
		private capture: (castId?: string) => Promise<unknown>,
		private accepted: () => void | Promise<void> = () => {},
	) {
		this.stop = watchPersonaCheckpoint(() => this.checkpointAll());
		window.addEventListener("storage", this.preferencesChanged);
		window.addEventListener("hf-lab-preference", this.preferencesChanged);
	}
	invalidate = () => {
		this.generation++;
	};
	preferencesChanged = (event: Event) => {
		const key = (event as StorageEvent).key;
		const recordingOnly =
			event.type === "hf-lab-preference" ||
			(typeof key === "string" &&
				(key.startsWith("hf-lab-") || key.startsWith("hf-persona-recording:")));
		if (!recordingOnly) this.invalidate();
	};
	suspend() {
		this.recordReady = false;
		this.invalidate();
	}
	commitFresh() {
		if (this.active) this.recordReady = true;
	}
	close() {
		this.active = false;
		this.suspend();
		this.stop();
		window.removeEventListener("storage", this.preferencesChanged);
		window.removeEventListener("hf-lab-preference", this.preferencesChanged);
	}
	async fresh(
		seed: number,
		population = 206,
		explicitLocal = false,
	): Promise<TownPacket> {
		this.suspend();
		const generation = this.generation;
		await shelf.ready;
		if (!this.active || generation !== this.generation)
			throw Error(
				"The game changed while its people were being prepared. Please try again.",
			);
		const localOnly = explicitLocal || !shelf.enabled;
		const cast =
			!localOnly && shelf.enabled
				? await claimCastChapterBatch(
						shelf,
						ALLOCATION.map((p) => p.castId),
						stamp(),
						async (inputs) => {
							const candidate = prepareTownCast(seed, population, inputs);
							restoreRuntime(candidate);
							return candidate;
						},
						{ isCurrent: () => this.active && generation === this.generation },
					)
				: null;
		if (!this.active || generation !== this.generation)
			throw Error(
				"The game changed while its people were being loaded. Please try again.",
			);
		const runtime =
			cast?.initial ?? (createRuntime(seed, population).export() as Save);
		const initial = Object.fromEntries(
			runtime.people
				.filter((r) => r.known)
				.map((r) => [HOST_CAST[r.person.id as CastRole], snapshot(r.person)]),
		);
		runtime.chapter = {
			edition: CAST_EDITION,
			inputs: cast?.inputs ?? [],
			claims: cast?.claims ?? [],
			initial,
			mapping: "neighbours-calendar/1",
		} satisfies CastChapter;
		// Admission can fail after the shared shelf accepted a batch. Keep the old
		// receipts until this exact candidate is ready; never substitute local people.
		this.heads = cast?.claims ?? [];
		this.sources = {};
		this.staged = undefined;
		this.file = false;
		this.localOnly = localOnly;

		return { schema: "neighbours/concordia@1", rounds: 0, runtime };
	}
	async load(value: unknown, local = false) {
		this.suspend();
		const g = this.generation;
		const packet = value as TownPacket;
		restoreRuntime(packet.runtime); // Detached validation; never mutates the current worker.
		for (const input of packet.runtime?.chapter?.inputs ?? [])
			await validatePersona(input.parent);
		for (const claim of packet.runtime?.chapter?.claims ?? [])
			await validatePersona(claim);
		let heads: PersonaEnvelope[] = [],
			file = true;
		if (local && packet.castLocal && !packet.castLocal.file) {
			if (
				packet.castLocal.chapter !==
				canonicalPersona([packet.runtime.seed, packet.runtime.chapter])
			)
				throw Error("Ownership receipts do not belong to this pinned chapter.");
			heads = await Promise.all(
				packet.castLocal.heads.map((p) => validatePersona(p)),
			);
			if (
				heads.length > 6 ||
				new Set(heads.map((h) => h.castId)).size !== heads.length
			)
				throw Error("Duplicate ownership receipt.");
			if (
				(packet.runtime.chapter?.claims ?? []).some(
					(claim) => !heads.some((h) => h.castId === claim.castId),
				)
			)
				throw Error("Incomplete chapter ownership receipts.");
			for (const h of heads) {
				const claim = packet.runtime.chapter?.claims.find(
					(c) => c.castId === h.castId,
				);
				const role = (Object.keys(HOST_CAST) as CastRole[]).find(
					(r) => HOST_CAST[r] === h.castId,
				);
				if (
					!role ||
					h.source.game !== "neighbours" ||
					h.source.rules !== CAST_RULES ||
					(h.revision !== claim?.revision &&
						(h.transfer.sourceRole !== role ||
							h.transfer.castPassport !== "neighbours-cast/1")) ||
					(claim && h.branchId !== claim.branchId)
				)
					throw Error("Unbound ownership receipt.");
			}
			for (const h of heads) {
				const claim = packet.runtime.chapter?.claims.find(
					(c) => c.castId === h.castId,
				);
				if (h.revision === claim?.revision) continue;
				const role = (Object.keys(HOST_CAST) as CastRole[]).find(
					(r) => HOST_CAST[r] === h.castId,
				);
				if (h.terminal) {
					if (
						packet.runtime.people.find((r) => r.person.id === role)?.person.body
							.alive !== false
					)
						throw Error("Terminal receipt does not match the saved death.");
					continue;
				}
				const checkpoint = h.transfer.checkpoint as
					| { sha256?: string; sourceMinute?: number; rng?: unknown }
					| undefined;
				const raw = checkpoint?.sha256
					? packet.castLocal.sources?.[checkpoint.sha256]
					: undefined;
				if (
					!raw ||
					raw.id !== role ||
					raw.now !== checkpoint?.sourceMinute ||
					canonicalPersona(raw.rng) !== canonicalPersona(checkpoint.rng)
				)
					throw Error("Owned source receipt lacks its full local snapshot.");
			}

			file = false;
		}
		if (!this.active || g !== this.generation)
			throw Error("Run changed during validation.");
		const sources = packet.castLocal?.sources ?? {};
		if (JSON.stringify(sources).length > 1048576)
			throw Error("Source journal exceeds local bound.");
		for (const [digest, raw] of Object.entries(sources)) {
			const actual = [
				...new Uint8Array(
					await crypto.subtle.digest(
						"SHA-256",
						new TextEncoder().encode(canonicalPersona(raw)),
					),
				),
			]
				.map((n) => n.toString(16).padStart(2, "0"))
				.join("");
			if (actual !== digest) throw Error("Source journal digest differs.");
		}
		if (!this.active || g !== this.generation)
			throw Error("Run changed during source validation.");
		this.staged = {
			heads,
			file,
			generation: g,
			sources,
			localOnly: packet.castLocal?.localOnly ?? file,
		};
	}
	commitLoad() {
		const staged = this.staged;
		this.staged = undefined;
		if (!staged || staged.generation !== this.generation) return;
		this.heads = staged.heads;
		this.sources = staged.sources;
		this.file = staged.file;
		this.localOnly = staged.localOnly;
		this.recordReady = true;
	}
	abortLoad() {
		this.staged = undefined;
	}

	decorate(value: unknown): TownPacket {
		return {
			...(value as TownPacket),
			castLocal: {
				sources: structuredClone(this.sources),
				heads: structuredClone(this.heads),
				file: this.file,
				localOnly: this.localOnly,
				chapter: canonicalPersona([
					(value as TownPacket).runtime.seed,
					(value as TownPacket).runtime.chapter,
				]),
			},
		};
	}
	/** The single recording preference includes cross-game history linkage. */
	async feedback(
		note: string,
		name: string,
		capture: () => Promise<unknown>,
		sharePlay = false,
	): Promise<boolean> {
		if (sharePlay) lab.setTelemetryOff(false);
		const generation = this.generation;
		const revisions = this.heads.map((head) => head.revision).join("/");
		const current = () =>
			this.active &&
			this.recordReady &&
			generation === this.generation &&
			this.heads.map((head) => head.revision).join("/") === revisions;
		let run: unknown;
		if (lab.telemetryOn && current()) {
			let cancelTimeout = () => {};
			try {
				run = await Promise.race([
					capture(),
					new Promise<undefined>((resolve) => {
						const timer = globalThis.setTimeout(resolve, 4000);
						cancelTimeout = () => globalThis.clearTimeout(timer);
					}),
				]);
			} catch {
				/* An optional export must never prevent the note. */
			} finally {
				cancelTimeout();
			}
		}
		const includeRun =
			run !== undefined && run !== null && current() && lab.telemetryOn;
		// A marker suppresses the SDK's optional snapshot retry after unavailable/stale capture.
		// Sharing was applied at Submit; do not override a newer off choice after the await.
		await lab.sendFeedback(note, {
			name,
			run: includeRun ? run : { feedbackOnly: true },
			sharePlay: false,
		});
		return !includeRun;
	}
	/** Deprecated host hook. Recording and source continuity have no RPC dependency. */
	recording(_allow?: boolean): Promise<void> {
		return Promise.resolve();
	}

	private serialize(work: () => Promise<void>): Promise<void> {
		const next = this.sourceQueue.then(work);
		this.sourceQueue = next.catch(() => {});
		return next;
	}
	savePerson(castId: string, fork = false) {
		return this.serialize(async () => {
			const generation = this.generation,
				parents = this.heads.map((h) => h.revision).join("/");
			const packet = await this.capture(castId);
			if (
				generation !== this.generation ||
				parents !== this.heads.map((h) => h.revision).join("/")
			)
				throw Error("Run or ownership changed while capturing the source.");
			await this.checkpoint(packet, castId, fork);
		});
	}
	async checkpointAll() {
		if (
			!this.active ||
			this.localOnly ||
			this.checkpointBusy ||
			!shelf.enabled ||
			this.file ||
			this.staged
		)
			return;
		this.checkpointBusy = true;
		try {
			await this.serialize(async () => {
				const generation = this.generation;
				for (const c of ALLOCATION) {
					const parent = this.heads.find(
						(h) => h.castId === c.castId,
					)?.revision;
					try {
						const packet = await this.capture(c.castId);
						if (
							generation !== this.generation ||
							parent !== this.heads.find((h) => h.castId === c.castId)?.revision
						)
							return;
						await this.checkpoint(packet, c.castId);
					} catch {
						/* Unsupported or suspended source remains local. */
					}
				}
			});
		} finally {
			this.checkpointBusy = false;
		}
	}
	async checkpoint(value: unknown, castId: string, fork = false) {
		if (this.staged || !this.recordReady)
			throw Error("Wait for the town to finish loading.");
		const captureGeneration = this.generation;
		if (this.file && !fork)
			throw Error(
				"This imported game cannot update the people saved in this browser. Export it locally, or save a separate version of these people.",
			);
		await shelf.ready;
		if (!shelf.enabled)
			throw Error("First, turn on saving people in this browser.");
		if (captureGeneration !== this.generation)
			throw Error("Run changed before checkpoint.");
		const generation = captureGeneration,
			p = value as TownPacket;
		const id = (Object.keys(HOST_CAST) as CastRole[]).find(
			(id) => HOST_CAST[id] === castId,
		);
		const resident = p.runtime.people.find((r) => r.person.id === id);
		const boundary = p.castBoundary;
		const r =
			resident && boundary && boundary.actorId === id
				? { ...resident, person: boundary.person, job: undefined }
				: resident;
		if (!id || !r || !p.runtime.chapter)
			throw Error("This is not a played current cast chapter.");
		const parent = this.heads.find((h) => h.castId === castId);
		if (!r.person.body.alive) {
			if (!parent || fork)
				throw Error("A dead person cannot create a living alternate branch.");
			const terminal = await closePersonaBranch(parent, stamp(), r.person.now);
			if (generation !== this.generation) throw Error("Run changed.");
			await shelf.request({ action: "put", envelope: terminal });
			if (generation === this.generation)
				this.heads = this.heads.map((h) =>
					h.castId === castId ? terminal : h,
				);
			if (generation === this.generation) await this.accepted();
			return;
		}
		if (p.runtime.round === 0 || r.job || r.person.activity)
			throw Error(
				"Wait until an action finishes. Finish any projects still in progress in this town.",
			);
		const retained = r.person.agenda.commitments.filter((c) =>
			isContinuingCommitment(r.person.agenda, c),
		);
		const owed = r.person.agenda.owed ?? [];
		// Projection itself refuses unrepresented promises, family, injury and body state.
		const raw = snapshot(r.person);
		const portable = projectCalendarPersona(raw, {
			version: "neighbours-calendar/1",
			// Imports can legitimately carry no host repair skill. Never invent one.
			skills: Object.hasOwn(raw.skills, "repair") ? { repair: "repair" } : {},
			calendar: {
				version: "hf-persona-calendar-map/1",
				offset: 0,
				sourceNorms: DEFAULT_NORMS,
				references: {
					commitments: identity([
						...retained.flatMap((c) => [
							c.id,
							...(c.makeUpOf ? [c.makeUpOf] : []),
						]),
						...owed.map((d) => d.ofId),
					]),
					chains: identity(retained.flatMap((c) => (c.chain ? [c.chain] : []))),
					actions: identity([
						...retained.flatMap((c) => [...c.actions, ...(c.violatedBy ?? [])]),
						...owed.flatMap((d) => [...d.actions, ...(d.violatedBy ?? [])]),
					]),
					entities: identity(
						retained.flatMap((c) =>
							[c.toId, c.targetId].filter((x): x is string => x !== undefined),
						),
					),
					norms: identity(DEFAULT_NORMS.map((n) => n.id)),
				},
			},
		});
		const digest = [
			...new Uint8Array(
				await crypto.subtle.digest(
					"SHA-256",
					new TextEncoder().encode(canonicalPersona(raw)),
				),
			),
		]
			.map((n) => n.toString(16).padStart(2, "0"))
			.join("");
		const branchId = fork
			? crypto.randomUUID()
			: (parent?.branchId ?? crypto.randomUUID());
		const life =
			parent && !fork
				? anchorPersonaLife(
						parent.transfer.life as PersonaLife,
						castId,
						Date.now(),
					)
				: initialPersonaLife(castId, branchId, Date.now());
		this.sources[digest] = raw;
		if (JSON.stringify(this.sources).length > 1048576)
			throw Error("Export the full history before saving more people.");
		const passInput = p.runtime.chapter.inputs.find(
			(i) => i.parent.castId === castId && isPassInput(i),
		);
		const passWitness = passInput
			? passContinuationWitness(passInput, raw)
			: {};
		const envelope = await createPersona({
			format: "hf-persona/1",
			castId,
			castRevision: canonicalCast(castId).revision,
			branchId,
			parentRevision: fork ? null : (parent?.revision ?? null),
			source: stamp(),
			transfer: {
				castPassport: "neighbours-cast/1",
				sourceRole: id,
				person: portable,
				...passWitness,
				life,
				checkpoint: {
					schema: raw.schema,
					sourceMinute: raw.now,
					rng: raw.rng,
					sha256: digest,
				},
			},
			limitations: [
				`The saved town and its export keep the full original state. The portable record lists ${portable.person.limitations.length} details that it leaves out.`,
			],
		});
		if (!this.active || generation !== this.generation)
			throw Error("Run changed before source checkpoint.");
		await shelf.request({
			action: "put",
			envelope,
			...(fork ? { fork: true } : {}),
		});
		if (this.active && generation === this.generation) {
			this.heads = [
				...this.heads.filter((h) => h.castId !== castId),
				envelope,
			].sort((a, b) => a.castId.localeCompare(b.castId));
			await this.accepted();
		}
	}
}
