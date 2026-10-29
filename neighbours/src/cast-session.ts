/** Browser ownership coordinator. The complete current native town is portable
 * as a file. Per-actor shared departure/reentry stays a prewrite refusal until
 * the published Neighbours role and exact custody contracts exist.
 */
import {
	claimCastChapterBatch,
	type PersonaEnvelope,
	personaChannel,
} from "@adam0white/lab-client";
import { ALLOCATION, CAST_RULES } from "./core/canonical-cast.ts";
import {
	admitTownPerson,
	prepareIncomingTownDurably,
} from "./core/cast-continuity.ts";
import { HF_VERSION } from "./core/hf-version.ts";
import { canonicalHash } from "./core/hf4-canonical.ts";
import { restoreRuntime } from "./core/restore.ts";
import type { NativeTownArchive } from "./core/runtime.ts";
import { createRuntime } from "./core/scenario.ts";
import { persistPreparedTown } from "./prepared-town-store.ts";
import { lab } from "./ui/lab.tsx";
export interface TownPacket {
	schema: string;
	rounds: number;
	runtime: NativeTownArchive;
	castLocal?: {
		heads: PersonaEnvelope[];
		file: boolean;
		chapter: string;
		localOnly?: boolean;
		sources?: Record<string, unknown>;
	};
}
export const shelf =
	typeof location !== "undefined" && location.pathname === "/file/"
		? null
		: personaChannel();
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
const chapter = (packet: TownPacket) =>
	canonicalHash({
		seed: packet.runtime.physical.seed,
		hf: packet.runtime.hf,
		initial: packet.runtime.owner.run.initial,
	});
export class CastSession {
	generation = 0;
	heads: PersonaEnvelope[] = [];
	file = false;
	localOnly = false;
	active = true;
	private recordReady = false;
	private sources: Record<string, unknown> = {};
	private staged?: {
		file: boolean;
		localOnly: boolean;
		generation: number;
		sources: Record<string, unknown>;
	};
	constructor(
		_capture: (castId?: string) => Promise<unknown>,
		_accepted: () => void | Promise<void> = () => {},
		private readonly foreign = shelf === null,
	) {
		window.addEventListener("storage", this.preferencesChanged);
		window.addEventListener("hf-lab-preference", this.preferencesChanged);
	}
	invalidate = () => {
		this.generation++;
	};
	preferencesChanged = (event: Event) => {
		const key = (event as StorageEvent).key;
		if (
			event.type !== "hf-lab-preference" &&
			!(key?.startsWith("hf-lab-") || key?.startsWith("hf-persona-recording:"))
		)
			this.invalidate();
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
		window.removeEventListener("storage", this.preferencesChanged);
		window.removeEventListener("hf-lab-preference", this.preferencesChanged);
	}
	async fresh(
		seed: number,
		population = 206,
		explicitLocal = false,
	): Promise<TownPacket> {
		this.suspend();
		if (this.foreign || !shelf)
			throw Error("A file session cannot start a native town.");
		const generation = this.generation;
		const current = () => this.active && generation === this.generation;
		if (!explicitLocal) await shelf.ready;
		if (!current()) throw Error("Run changed while preparing people.");
		if (!explicitLocal && !shelf.enabled)
			throw Error(
				"Shared people are unavailable. Choose Start a fresh local town in Other ways in.",
			);
		if (!explicitLocal) {
			const result = await claimCastChapterBatch(
				shelf,
				ALLOCATION.map((person) => person.castId),
				{
					game: "neighbours",
					build: lab.build().c ?? "development",
					engine: HF_VERSION,
					rules: CAST_RULES,
				},
				async (inputs) => {
					// The SDK invokes this even when every nonempty source was refused. Do not
					// replace those people with authored copies or acknowledge an empty claim.
					if (!inputs.length)
						throw Error(
							"These saved people cannot enter the current Neighbours Run. Continue or export their source chapter.",
						);
					return prepareIncomingTownDurably(
						seed,
						population,
						inputs,
						persistPreparedTown,
						current,
					);
				},
				{
					isCurrent: current,
					admitPerson: async (input) => {
						admitTownPerson(input);
					},
				},
			);
			if (result)
				throw Error(
					"Unexpected receiving claim; this published client has no Neighbours target roles.",
				);
			// null means successful empty preparation AND acknowledged exact empty CAS.
		}
		// An explicitly authored local town has no incoming people or shared claim.
		// The worker still validates this complete packet before installing it;
		// its ordinary device-save path persists the accepted initial town.
		const runtime = explicitLocal
			? (createRuntime(seed, population).export() as NativeTownArchive)
			: await prepareIncomingTownDurably(
					seed,
					population,
					[],
					persistPreparedTown,
					current,
				);
		if (!current())
			throw Error("Run changed while its complete town was saved.");
		this.heads = [];
		this.sources = {};
		this.file = false;
		this.localOnly = explicitLocal;
		this.staged = undefined;
		return { schema: "neighbours/concordia@2", rounds: 0, runtime };
	}
	async load(value: unknown, local = false): Promise<void> {
		this.suspend();
		const generation = this.generation;
		const packet = value as TownPacket;
		if (
			packet?.schema !== "neighbours/concordia@2" ||
			!Number.isSafeInteger(packet.rounds) ||
			packet.rounds !== packet.runtime?.physical.round
		)
			throw Error(
				"Unsupported town checkpoint. Keep the historical file and start a fresh HF4 town.",
			);
		restoreRuntime(packet.runtime);
		if (packet.castLocal?.heads.length)
			throw Error(
				"Current shared per-actor custody cannot be resumed by this published Neighbours contract. Keep the source file.",
			);
		if (packet.castLocal && packet.castLocal.chapter !== chapter(packet))
			throw Error("Native town identity differs from its local receipt.");
		if (!this.active || generation !== this.generation)
			throw Error("Run changed during validation.");
		const sources = structuredClone(packet.castLocal?.sources ?? {});
		if (!sources || typeof sources !== "object" || Array.isArray(sources))
			throw Error("Invalid archived source journal");
		for (const [digest, body] of Object.entries(sources))
			if (!/^[a-f0-9]{64}$/.test(digest) || canonicalHash(body) !== digest)
				throw Error("Archived source journal digest differs");
		this.staged = {
			file: this.foreign || !local || packet.castLocal?.file === true,
			localOnly: true,
			generation,
			sources,
		};
	}
	commitLoad() {
		if (this.staged?.generation === this.generation) {
			this.file = this.staged.file;
			this.localOnly = this.staged.localOnly;
			this.sources = this.staged.sources;
			this.heads = [];
			this.recordReady = true;
			this.staged = undefined;
		}
	}
	abortLoad() {
		this.staged = undefined;
	}
	decorate(value: unknown): TownPacket {
		const packet = value as TownPacket;
		return {
			...packet,
			castLocal: {
				heads: [],
				sources: structuredClone(this.sources),
				file: this.file,
				localOnly: this.localOnly,
				chapter: chapter(packet),
			},
		};
	}
	recording(_allow?: boolean): Promise<void> {
		return Promise.resolve();
	}
	async savePerson(_castId: string, _fork = false): Promise<never> {
		throw Error(
			"Saving one person while the town continues needs the published Neighbours custody and source-role contract. Export the complete town instead.",
		);
	}
	async checkpointAll(): Promise<void> {
		/* No unsupported per-actor projection, fork or shelf write. */
	}
	async feedback(
		note: string,
		name: string,
		capture: () => Promise<unknown>,
		sharePlay = false,
	): Promise<boolean> {
		if (sharePlay) lab.setTelemetryOff(false);
		const generation = this.generation;
		let run: unknown;
		if (lab.telemetryOn && this.active && this.recordReady) {
			let timer: number | undefined;
			try {
				run = await Promise.race([
					capture(),
					new Promise<undefined>((resolve) => {
						timer = setTimeout(resolve, 4000);
					}),
				]);
			} catch {
			} finally {
				clearTimeout(timer);
			}
		}
		const include =
			run !== undefined &&
			run !== null &&
			this.active &&
			this.recordReady &&
			generation === this.generation &&
			lab.telemetryOn;
		await lab.sendFeedback(note, {
			name,
			run: include ? run : { feedbackOnly: true },
			sharePlay: false,
		});
		return !include;
	}
}
