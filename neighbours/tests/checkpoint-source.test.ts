import { expect, it } from "vitest";
import type { TownPacket } from "../src/cast-session.ts";
import {
	checkpointChapter,
	checkpointSources,
} from "../src/checkpoint-source.ts";
import { canonicalHash } from "../src/core/hf4-canonical.ts";
import { createRuntime } from "./current-town.ts";

// Local receipt consistency controls, not a source-authentication/custody fixture.
function packet(): TownPacket {
	const value: TownPacket = {
		schema: "neighbours/concordia@2",
		rounds: 0,
		runtime: createRuntime(42, 6).export(),
	};
	const source = { retained: ["original source body"] };
	value.castLocal = {
		heads: [],
		file: true,
		localOnly: true,
		chapter: checkpointChapter(value),
		sources: { [canonicalHash(source)]: source },
	};
	return value;
}
it("preserves every source body and isolates the admitted copy for both replay consumers", () => {
	const value = packet();
	const copied = checkpointSources(value);
	expect(copied).toEqual(value.castLocal?.sources);
	const key = Object.keys(copied)[0];
	if (!key) throw Error("Missing test source");
	copied[key] = { changed: true };
	expect(copied).not.toEqual(value.castLocal?.sources);
});
it("refuses a different chapter, changed source body and unsupported shared custody", () => {
	const value = packet();
	const local = value.castLocal;
	if (!local) throw Error("Missing test receipt");
	expect(() =>
		checkpointSources({
			...value,
			castLocal: { ...local, chapter: "0".repeat(64) },
		}),
	).toThrow("identity differs");
	expect(() =>
		checkpointSources({
			...value,
			castLocal: {
				...local,
				sources: { ["0".repeat(64)]: { changed: true } },
			},
		}),
	).toThrow("digest differs");
	expect(() =>
		checkpointSources({
			...value,
			castLocal: { ...local, heads: [{} as never] },
		}),
	).toThrow("custody");
});
