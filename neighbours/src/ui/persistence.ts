const DATABASE = "alder-quay";
const REVISION_KEY = "checkpoint-revision";
const CHANNEL = "alder-quay-checkpoints";

const NAMED_PREFIX = "named-town:";
export type NamedTown = { key: string; name: string; savedAt: number };
type NamedRecord = NamedTown & {
	format: "neighbours/named-town@1";
	packet: unknown;
};
type Current = () => boolean;
const alwaysCurrent = () => true;
function namedRecord(value: unknown, key: string): NamedRecord {
	const r = value as NamedRecord | undefined;
	if (
		!key.startsWith(NAMED_PREFIX) ||
		!r ||
		r.format !== "neighbours/named-town@1" ||
		r.key !== key ||
		typeof r.name !== "string" ||
		!r.name.trim() ||
		r.name.length > 120 ||
		!Number.isFinite(r.savedAt) ||
		r.packet === undefined
	)
		throw new Error(
			"This named town could not be read. Its saved copy is unchanged.",
		);
	return r;
}

type Revision = { revision: string; source: string };

export class SaveConflictError extends Error {
	constructor() {
		super("Another tab saved the town on this device.");
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
	throw new Error("The saved-state version on this device could not be read.");
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
			reject(tx.error ?? new Error("Reading the saved town was cancelled."));
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
				reject(tx.error ?? new Error("Reading the saved town was cancelled."));
			};
		});
	}

	/** Serialize own writes; atomically reject stale writers before changing either slot. */
	write(
		packet: unknown,
		slot: "latest" | "previous",
		current: Current = alwaysCurrent,
	): Promise<void> {
		return this.enqueue((store) => {
			store.put(packet, slot);
		}, current);
	}

	/** Names and wall time are outside the complete, untouched native packet. */
	async saveNamed(
		name: string,
		packet: unknown,
		current: Current = alwaysCurrent,
	): Promise<string> {
		if (!name.trim() || name.length > 120)
			throw Error("Use a town name of 1 to 120 characters.");
		const key = NAMED_PREFIX + crypto.randomUUID();
		const record: NamedRecord = {
			format: "neighbours/named-town@1",
			key,
			name: name.trim(),
			savedAt: Date.now(),
			packet: structuredClone(packet),
		};
		await this.enqueue((store) => {
			store.add(record, key);
		}, current);
		return key;
	}

	async listNamed(): Promise<NamedTown[]> {
		const db = await this.connect();
		return new Promise((resolve, reject) => {
			const tx = db.transaction("saves", "readonly"),
				store = tx.objectStore("saves");
			const request = store.openCursor(
				IDBKeyRange.bound(NAMED_PREFIX, `${NAMED_PREFIX}\uffff`),
			);
			const result: NamedTown[] = [];
			let failure: unknown;
			request.onsuccess = () => {
				const cursor = request.result;
				if (!cursor) return;
				try {
					const { key, name, savedAt } = namedRecord(
						cursor.value,
						String(cursor.key),
					);
					result.push({ key, name, savedAt });
					cursor.continue();
				} catch (error) {
					failure = error;
					tx.abort();
				}
			};
			tx.oncomplete = () => {
				db.close();
				if (this.closed) reject(Error("This visitor session is closed."));
				else resolve(result.sort((a, b) => b.savedAt - a.savedAt));
			};
			tx.onabort = tx.onerror = () => {
				db.close();
				reject(failure ?? tx.error ?? Error("Named towns could not be read."));
			};
		});
	}
	async readNamed(key: string): Promise<NamedRecord> {
		if (this.closed) throw Error("This visitor session is closed.");
		if (!key.startsWith(NAMED_PREFIX)) throw Error("Invalid named town key.");
		const value = await localSave(key);
		if (this.closed) throw Error("This visitor session is closed.");
		return namedRecord(value, key);
	}

	/** Existing revision/source CAS also covers an atomic current-town backup and replacement. */
	replaceNamed(
		key: string,
		candidate: unknown,
		former: unknown,
		current: Current = alwaysCurrent,
	): Promise<void> {
		return this.enqueue((store) => {
			const request = store.get(key);
			request.onsuccess = () => {
				try {
					this.assertCurrent(current);
					const record = namedRecord(request.result, key);
					if (JSON.stringify(record.packet) !== JSON.stringify(candidate))
						throw Error("The named copy changed during validation.");
					store.put(former, "previous");
					store.put(record.packet, "latest");
				} catch {
					store.transaction.abort();
				}
			};
		}, current);
	}
	settled(): Promise<unknown> {
		return this.queue;
	}
	private assertCurrent(current: Current) {
		if (this.closed || !current())
			throw Error("This town operation is no longer current.");
	}
	private enqueue(
		change: (store: IDBObjectStore) => void,
		current: Current,
	): Promise<void> {
		const next = this.queue.then(() => this.commit(change, current));
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

	private async commit(
		change: (store: IDBObjectStore) => void,
		currentOperation: Current,
	) {
		this.assertCurrent(currentOperation);
		if (!this.opened)
			throw new Error("This tab cannot take ownership of the saved town.");
		if (this.conflicted) throw new SaveConflictError();
		const db = await this.connect();
		try {
			this.assertCurrent(currentOperation);
		} catch (error) {
			db.close();
			throw error;
		}
		return new Promise<void>((resolve, reject) => {
			const tx = db.transaction("saves", "readwrite");
			this.transaction = tx;
			const store = tx.objectStore("saves");
			const check = store.get(REVISION_KEY);
			const next = { revision: crypto.randomUUID(), source: this.source };
			let failure: unknown;
			// A source can retire after CAS while the final requests are still pending.
			// Abort the transaction then. If it is already durable, completion remains a
			// success and the caller must adopt that committed packet, not claim rollback.
			const abortIfStale = () => {
				try {
					this.assertCurrent(currentOperation);
				} catch (error) {
					try {
						tx.abort();
						failure = error;
					} catch {
						/* A durable transaction cannot be cancelled retroactively. */
					}
				}
			};
			window.addEventListener("storage", abortIfStale);
			window.addEventListener("hf-lab-preference", abortIfStale);
			tx.addEventListener("success", abortIfStale, true);
			const detach = () => {
				window.removeEventListener("storage", abortIfStale);
				window.removeEventListener("hf-lab-preference", abortIfStale);
			};
			check.onsuccess = () => {
				try {
					this.assertCurrent(currentOperation);
					const current = revision(check.result);
					if (
						this.conflicted ||
						current?.revision !== this.expected?.revision ||
						current?.source !== this.expected?.source
					)
						throw new SaveConflictError();
					change(store);
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
				detach();
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
				detach();
				db.close();
				this.transaction = undefined;
				if (failure instanceof SaveConflictError) this.conflict();
				reject(
					failure ?? tx.error ?? new Error("Saving the town was cancelled."),
				);
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
