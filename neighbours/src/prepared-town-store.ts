import type { PreparedTown } from "./core/cast-continuity.ts";
import { canonicalHash } from "./core/hf4-canonical.ts";
import { sameJSONValue } from "./core/restore.ts";
/** One current durable receiving preparation. Completion awaits transaction commit
 * and full readback. This is host storage only; no shelf ownership is claimed.
 */
export async function persistPreparedTown(value: PreparedTown): Promise<void> {
	const key = canonicalHash(value);
	const db = await new Promise<IDBDatabase>((resolve, reject) => {
		const request = indexedDB.open("neighbours-hf4-prepared", 1);
		request.onupgradeneeded = () => request.result.createObjectStore("native");
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
	try {
		await new Promise<void>((resolve, reject) => {
			const tx = db.transaction("native", "readwrite");
			tx.objectStore("native").put(value, key);
			tx.oncomplete = () => resolve();
			tx.onabort = () =>
				reject(tx.error ?? Error("Receiving preparation aborted"));
			tx.onerror = () => reject(tx.error);
		});
		const read = await new Promise<unknown>((resolve, reject) => {
			const request = db
				.transaction("native", "readonly")
				.objectStore("native")
				.get(key);
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		if (!sameJSONValue(read, value))
			throw Error("Durable receiving preparation readback differs");
	} finally {
		db.close();
	}
}
