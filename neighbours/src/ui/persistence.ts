const DATABASE = "alder-quay";
const REVISION_KEY = "checkpoint-revision";
const CHANNEL = "alder-quay-checkpoints";

type Revision = { revision: string; source: string };

export class SaveConflictError extends Error {
	constructor() {
		super("Another tab saved the device town.");
		this.name = "SaveConflictError";
	}
}

function database(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DATABASE, 1);
		request.onupgradeneeded = () => request.result.createObjectStore("saves");
		request.onerror = () => reject(request.error);
		request.onsuccess = () => resolve(request.result);
	});
}

function revision(value: unknown): Revision | undefined {
	if (value === undefined) return undefined;
	if (
		value &&
		typeof value === "object" &&
		"revision" in value &&
		typeof value.revision === "string" &&
		"source" in value &&
		typeof value.source === "string"
	)
		return { revision: value.revision, source: value.source };
	throw new Error("The device checkpoint revision could not be read.");
}

/** Read a raw packet, including saves written before revision protection existed. */
export async function localSave(slot = "latest"): Promise<unknown> {
	const db = await database();
	return new Promise((resolve, reject) => {
		const tx = db.transaction("saves", "readonly");
		const action = tx.objectStore("saves").get(slot);
		let result: unknown;
		action.onsuccess = () => {
			result = action.result;
		};
		tx.oncomplete = () => {
			db.close();
			resolve(result);
		};
		tx.onabort = tx.onerror = () => {
			db.close();
			reject(tx.error ?? new Error("Device save read aborted"));
		};
	});
}

/** One visitor's optimistic write ownership; IndexedDB is the authority. */
export class DeviceSaves {
	private readonly source = crypto.randomUUID();
	private expected: Revision | undefined;
	private opened = false;
	private closed = false;
	private transaction: IDBTransaction | undefined;
	private conflicted = false;
	private queue: Promise<unknown> = Promise.resolve();
	private channel: BroadcastChannel | undefined;

	constructor(private readonly onConflict: () => void) {
		try {
			this.channel = new BroadcastChannel(CHANNEL);
			this.channel.onmessage = (event: MessageEvent<Revision>) => {
				if (event.data?.source !== this.source && this.opened) {
					void localSave(REVISION_KEY)
						.then((value) => {
							const current = revision(value);
							if (
								current?.source !== this.source &&
								current?.revision !== this.expected?.revision
							)
								this.conflict();
						})
						.catch(() => {});
				}
			};
		} catch {
			// Notifications are optional. Every commit still checks the stored revision.
		}
	}

	private conflict() {
		if (!this.closed && !this.conflicted) {
			this.conflicted = true;
			this.onConflict();
		}
	}

	/** Load the checkpoint and its expected revision in the same transaction. */
	async open(): Promise<unknown> {
		const db = await this.connect();
		return new Promise((resolve, reject) => {
			const tx = db.transaction("saves", "readonly");
			const store = tx.objectStore("saves");
			const packet = store.get("latest");
			const version = store.get(REVISION_KEY);
			tx.oncomplete = () => {
				db.close();
				try {
					if (this.closed) throw new Error("This visitor session is closed.");
					this.expected = revision(version.result);
					this.opened = true;
					resolve(packet.result);
				} catch (error) {
					reject(error);
				}
			};
			tx.onabort = tx.onerror = () => {
				db.close();
				reject(tx.error ?? new Error("Device save read aborted"));
			};
		});
	}

	/** Serialize own writes; atomically reject stale writers before changing either slot. */
	write(packet: unknown, slot: "latest" | "previous"): Promise<void> {
		const next = this.queue.then(() => this.commit(packet, slot));
		this.queue = next.catch(() => {});
		return next;
	}

	private async connect() {
		if (this.closed) throw new Error("This visitor session is closed.");
		const db = await database();
		if (this.closed) {
			db.close();
			throw new Error("This visitor session is closed.");
		}
		return db;
	}

	private async commit(packet: unknown, slot: "latest" | "previous") {
		if (!this.opened) throw new Error("Device save ownership is unavailable.");
		if (this.conflicted) throw new SaveConflictError();
		const db = await this.connect();
		return new Promise<void>((resolve, reject) => {
			const tx = db.transaction("saves", "readwrite");
			this.transaction = tx;
			const store = tx.objectStore("saves");
			const check = store.get(REVISION_KEY);
			const next = { revision: crypto.randomUUID(), source: this.source };
			let failure: unknown;
			check.onsuccess = () => {
				try {
					if (this.closed) throw new Error("This visitor session is closed.");
					const current = revision(check.result);
					if (
						this.conflicted ||
						current?.revision !== this.expected?.revision ||
						current?.source !== this.expected?.source
					)
						throw new SaveConflictError();
					store.put(packet, slot);
					store.put(next, REVISION_KEY);
				} catch (error) {
					failure = error;
					try {
						tx.abort();
					} catch {
						// close() may already have aborted this transaction.
					}
				}
			};
			tx.oncomplete = () => {
				db.close();
				this.transaction = undefined;
				this.expected = next;
				try {
					this.channel?.postMessage(next);
				} catch {
					// A notification failure cannot undo a committed checkpoint.
				}
				resolve();
			};
			tx.onabort = tx.onerror = () => {
				db.close();
				this.transaction = undefined;
				if (failure instanceof SaveConflictError) this.conflict();
				reject(failure ?? tx.error ?? new Error("Device save aborted"));
			};
		});
	}

	close() {
		this.closed = true;
		this.channel?.close();
		try {
			this.transaction?.abort();
		} catch {
			// A committed transaction cannot be cancelled retroactively.
		}
	}
}
