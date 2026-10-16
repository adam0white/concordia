export function stateHash(value: unknown): string {
	let h = 2166136261;
	for (const c of JSON.stringify(value)) {
		h = Math.imul(h ^ c.charCodeAt(0), 16777619);
	}
	return (h >>> 0).toString(16).padStart(8, "0");
}
export function keyed(seed: number, round: number, key: string) {
	return Number.parseInt(stateHash([seed, round, key]), 16) / 4294967296;
}
