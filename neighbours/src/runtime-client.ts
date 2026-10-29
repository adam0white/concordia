import { CastSession } from "./cast-session.ts";
import type { UiCommand, UiReply } from "./contracts";
import { roleFor } from "./core/canonical-cast.ts";
export class RuntimeClient {
	private worker: Worker;
	readonly cast: CastSession;
	private queue: Promise<void> = Promise.resolve();
	private booting = true;
	private starting = false;
	private current = true;
	private captures = new Map<number, (value: unknown) => void>();
	private captureSequence = -1000000;
	private readonly recordings = new WeakMap<object, unknown>();
	private restoring: number | null = null;
	private restoreSequence = 0;
	private pendingNew: number | null = null;
	private newSequence = 0;
	private day = 0;
	constructor(
		private onReply: (reply: UiReply) => void,
		hasLocalSave = false,
		accepted: () => void | Promise<void> = () => {},
		private readonly explicitLocal = false,
		private readonly foreign = false,
		initialSeed = 42,
	) {
		this.cast = new CastSession((id) => this.capture(id), accepted, foreign);
		this.worker = new Worker(new URL("./runtime.worker.ts", import.meta.url), {
			type: "module",
		});
		this.worker.onmessage = (event: MessageEvent<UiReply>) => {
			const reply = event.data;
			if (
				reply.type === "error" &&
				this.pendingNew !== null &&
				reply.newRequestId === this.pendingNew
			) {
				this.pendingNew = null;
				this.starting = false;
			}

			if (
				this.restoring !== null &&
				reply.type === "error" &&
				reply.restoreRequestId === this.restoring
			) {
				this.restoring = null;
				this.cast.abortLoad();
			}
			if (
				reply.type === "state" &&
				(reply.view.day > this.day ||
					reply.view.people.some((p) => p.known && p.lifeState === "dead"))
			) {
				this.day = reply.view.day;
				void this.cast.checkpointAll().catch(() => {});
			}
			if (
				(reply.type === "save" || reply.type === "cast-snapshot") &&
				reply.requestId !== undefined
			) {
				const capture = this.captures.get(reply.requestId);
				if (capture) {
					this.captures.delete(reply.requestId);
					if (
						reply.type === "save" &&
						reply.recording &&
						reply.save &&
						typeof reply.save === "object"
					)
						this.recordings.set(reply.save, reply.recording);
					capture(reply.save);
					return;
				}
			}
			if (reply.type === "ready" && this.booting) {
				this.booting = false;
				if (hasLocalSave || this.foreign) {
					this.onReply(reply);
					return;
				}
				this.starting = true;
				this.enqueue(async () => {
					const initial = await this.cast.fresh(
						initialSeed,
						206,
						this.explicitLocal,
					);
					this.pendingNew = ++this.newSequence;
					this.worker.postMessage({
						type: "new",
						seed: initialSeed,
						initial,
						newRequestId: this.pendingNew,
					});
				});
				return;
			}

			if ((reply.type === "save" || reply.type === "state") && reply.save) {
				reply.save = this.cast.decorate(reply.save);
				if (reply.recording)
					reply.recording = this.cast.decorate(reply.recording);
			}
			this.onReply(reply);
		};
		this.worker.onerror = () =>
			this.onReply({
				type: "error",
				message:
					"The simulation worker stopped. Reload and restore a saved town.",
			});
	}
	private enqueue(work: () => Promise<void>) {
		this.queue = this.queue
			.then(async () => {
				if (this.current) await work();
			})
			.catch((error) => {
				this.starting = false;
				if (this.current)
					this.onReply({
						type: "error",
						message: String(error instanceof Error ? error.message : error),
					});
			});
	}
	acceptView(reply: Extract<UiReply, { type: "ready" | "state" }>) {
		if (!this.current) return;
		if (
			reply.type === "ready" &&
			this.pendingNew !== null &&
			reply.newRequestId === this.pendingNew
		) {
			this.pendingNew = null;
			this.starting = false;
			this.cast.commitFresh();
			void this.cast.recording().catch(() => {});
		} else if (
			this.restoring !== null &&
			reply.restoreRequestId === this.restoring
		) {
			this.restoring = null;
			this.cast.commitLoad();
		}
	}
	send(command: UiCommand) {
		if (command.type === "new" || command.type === "restore") {
			this.pendingNew = null;
			this.restoring = null;
			this.cast.suspend();
		}

		if (
			this.starting &&
			(command.type === "step" || command.type === "advance")
		)
			return;
		if (this.foreign && command.type === "new") {
			this.onReply({
				type: "error",
				message: "A file session cannot start a native town.",
			});
			return;
		}
		if (command.type === "new") {
			this.starting = true;
			this.enqueue(async () => {
				const initial = await this.cast.fresh(
					command.seed,
					command.population ?? 206,
					this.explicitLocal,
				);
				this.pendingNew = ++this.newSequence;
				this.worker.postMessage({
					...command,
					initial,
					newRequestId: this.pendingNew,
				});
			});
		} else if (command.type === "restore") {
			this.enqueue(async () => {
				await this.cast.load(command.save, command.local === true);
				this.restoring = ++this.restoreSequence;
				this.worker.postMessage({
					...command,
					restoreRequestId: this.restoring,
				});
			});
		} else
			this.enqueue(async () => {
				this.worker.postMessage(command);
			});
	}
	capture(
		castId?: string,
		format: "native" | "journal" = "native",
	): Promise<unknown> {
		if (castId && format === "journal")
			return Promise.reject(Error("A journal must include the complete town."));
		return new Promise((resolve, reject) => {
			const id = this.captureSequence--;
			const timeout = setTimeout(() => {
				this.captures.delete(id);
				if (castId) this.send({ type: "cast-cancel", requestId: id });
				reject(Error("There is no completed save to restore."));
			}, 30000);
			this.captures.set(id, (value) => {
				clearTimeout(timeout);
				resolve(value);
			});
			this.send(
				castId
					? { type: "cast-capture", requestId: id, actorId: roleFor(castId) }
					: {
							type: format === "journal" ? "save-journal" : "save",
							requestId: id,
						},
			);
		});
	}
	/** Only an exact captured native object can name its atomic public journal. */
	recordingFor(packet: unknown): unknown {
		return packet && typeof packet === "object"
			? this.recordings.get(packet)
			: undefined;
	}
	close() {
		this.current = false;
		this.cast.close();
		this.worker.terminate();
	}
}
