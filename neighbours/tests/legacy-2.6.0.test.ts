/**
 * A save written by the HF 2.6.0 site (Phase C: timber, a played promise) restores under the current HF and
 * continues exactly. Only version stamps migrate: the save `hf`, each person's `engine` and the `HF x.y.z`
 * decision source. The fixture's `after48` was produced by the 2.6.0 build itself (commit e3d0382).
 */
import { readFileSync } from "node:fs";
import { ENGINE_VERSION } from "@adam0white/human-framework";
import { expect, it } from "vitest";
import { HF_VERSION } from "../src/core/hf-version.ts";
import type { Runtime } from "../src/core/runtime.ts";
import type { Save } from "../src/core/state.ts";
import { restoreRuntime } from "./historical-runtime.ts";

const fixture = JSON.parse(
	readFileSync(
		new URL("./fixtures/hf-2.6.0-played.json", import.meta.url),
		"utf8",
	),
) as { start: Save; after48: Save };
/** Stamps only: every other byte must match. */
const stamps = (save: unknown) =>
	JSON.parse(
		JSON.stringify(save)
			.replaceAll('"HF 2.6.0"', `"HF ${HF_VERSION}"`)
			.replaceAll('"engine":"2.6.0"', `"engine":"${ENGINE_VERSION}"`)
			.replaceAll('"hf":"2.6.0"', `"hf":"${HF_VERSION}"`),
	);

it("a played 2.6.0 save migrates its stamps and continues 48 rounds exactly", () => {
	expect(fixture.start.hf).toBe("2.6.0");
	expect(fixture.start.timber?.care).toBeUndefined();
	expect(fixture.start.player?.version).toBe(1);
	expect(fixture.start.player?.pledges[0]?.status).toBe("open");
	const r = restoreRuntime(structuredClone(fixture.start)) as Runtime;
	expect(r.s.hf).toBe(HF_VERSION);
	expect(r.s.people.every((p) => p.person.engine === ENGINE_VERSION)).toBe(
		true,
	);
	for (let i = 0; i < 48; i++) r.step();
	const after = r.export() as Save;
	// The open pledge lapsed inside the window and was reported through the version 1 path.
	expect(after.player?.pledges[0]?.status).toBe("lapsed");
	expect(after.timber?.care).toBeUndefined();
	// Records decided before the restore keep their historical "HF 2.6.0" source, so both sides are normalized.
	expect(stamps(after)).toEqual(stamps(fixture.after48));
}, 60_000);
