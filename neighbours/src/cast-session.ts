/** Browser-only ownership and recording. Never folded into rule hashes or read by replay. */
import {
	DEFAULT_NORMS,
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
import { type CastChapter, prepareTownCast } from "./core/cast-continuity.ts";
import { restoreRuntime } from "./core/restore.ts";
import { createRuntime } from "./core/scenario.ts";
import type { Save } from "./core/state.ts";
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
	lab.setPersonaRecording(`feedback-note-${crypto.randomUUID()}`);
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
	engine: "2.17.0",
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
	private recordingChoice = 0;
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
		this.recordingChoice++;
		lab.setPersonaRecording(`pending-${crypto.randomUUID()}`);
	};
	preferencesChanged = () => {
		this.invalidate();
		if (this.recordReady && this.active) void this.recording().catch(() => {});
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
		this.heads = [];
		this.sources = {};
		this.staged = undefined;
		this.file = false;
		await shelf.ready;
		if (!this.active || generation !== this.generation)
			throw Error("Run changed while preparing cast.");
		this.localOnly = explicitLocal || !shelf.enabled;
		const cast =
			!this.localOnly && shelf.enabled
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
			throw Error("Run changed while claiming cast.");
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
		this.heads = cast?.claims ?? [];

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
		void this.recording().catch(() => {});
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
		let run: unknown;
		if (lab.telemetryOn || sharePlay) {
			try {
				run = await capture();
			} catch {
				/* The note remains available. */
			}
		}
		await lab.sendFeedback(note, { name, run, sharePlay });
		return !(lab.telemetryOn || sharePlay) || run === undefined || run === null;
	}
	async recording(allow?: boolean) {
		if (!this.recordReady || !this.active) {
			lab.setPersonaRecording("pending-world");
			return;
		}
		const choice = ++this.recordingChoice;
		const generation = this.generation,
			revisions = this.heads.map((p) => p.revision).join("/");
		lab.setPersonaRecording(`group-${crypto.randomUUID()}`);
		if (this.file) return;
		if (!this.heads.length) {
			lab.setPersonaRecording(null);
			return;
		}
		const pinned = structuredClone(this.heads);
		const current = () =>
			this.active &&
			generation === this.generation &&
			choice === this.recordingChoice &&
			this.heads.map((p) => p.revision).join("/") === revisions;
		const reply = await shelf.request<{
			sameEpoch: boolean;
			revisions: string[];
			recordingEpoch: string | null;
		}>({ action: "recordingBatch", envelopes: pinned });
		if (!current() || reply.revisions.join("/") !== revisions) return;
		if (allow !== undefined) {
			const ack = await shelf.request<{
				sameEpoch: boolean;
				revisions: string[];
				recordingEpoch: string | null;
			}>({
				action: "recordingBatch",
				envelopes: pinned,
				allowRecording: allow,
				recordingEpoch: reply.recordingEpoch ?? undefined,
			});
			if (
				current() &&
				ack.revisions.join("/") === revisions &&
				ack.sameEpoch === allow
			)
				lab.allowPersonaRecording(allow);
		} else lab.allowPersonaRecording(reply.sameEpoch);
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
				"Imported files do not own browser branches. Export locally or explicitly save an alternate branch.",
			);
		await shelf.ready;
		if (!shelf.enabled) throw Error("Enable browser continuity first.");
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
				"Wait for an actual finished action and finish active projects in this town.",
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
			throw Error("Export the source journal before saving more people.");
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
				life,
				checkpoint: {
					schema: raw.schema,
					sourceMinute: raw.now,
					rng: raw.rng,
					sha256: digest,
				},
			},
			limitations: [
				`Full source snapshot retained in the local town/export; ${portable.person.limitations.length} detailed omissions remain in its passport.`,
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
			await this.recording();
		}
	}
}
