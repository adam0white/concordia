const DATABASE = "alder-quay";
/** One complete runtime packet, committed atomically before success is reported. */
export async function localSave(
	value?: unknown,
	slot = "latest",
): Promise<unknown> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DATABASE, 1);
		request.onupgradeneeded = () => request.result.createObjectStore("saves");
		request.onerror = () => reject(request.error);
		request.onsuccess = () => {
			const db = request.result;
			const tx = db.transaction(
				"saves",
				value === undefined ? "readonly" : "readwrite",
			);
			const store = tx.objectStore("saves");
			const action =
				value === undefined ? store.get(slot) : store.put(value, slot);
			let result: unknown;
			action.onsuccess = () => {
				result = action.result;
			};
			tx.oncomplete = () => {
				db.close();
				resolve(result);
			};
			tx.onerror = () => {
				db.close();
				reject(tx.error);
			};
			tx.onabort = () => {
				db.close();
				reject(tx.error ?? new Error("Device save aborted"));
			};
		};
	});
}
