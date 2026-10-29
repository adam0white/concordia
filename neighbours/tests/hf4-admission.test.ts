import {
	canonicalCast,
	createPersona,
	portablePersonRole,
	preparePersonaLife,
} from "@adam0white/lab-client";
import { expect, it } from "vitest";
import { prepareIncomingTownDurably } from "../src/core/cast-continuity.ts";
import { createRuntime } from "./current-town.ts";

it("refuses a structurally supported synthetic source passport before durable preparation when the exact published target role is absent", async () => {
	// Explicit portable-contract fixture. It asserts no played source chapter,
	// shelf custody, departure, cross-game learning or native actor clone.
	const actor = createRuntime(42, 6).s.owner.actor("elin"),
		cast = canonicalCast("hf.cast.derya.stairwell");
	const {
		satiety,
		hydration,
		sleepPressure,
		exertion,
		fitness,
		health,
		pain,
		sleepDebtHours,
	} = actor.body;
	const parent = await createPersona({
		format: "hf-persona/1",
		castId: cast.castId,
		castRevision: cast.revision,
		branchId: "engineering-portable-contract",
		parentRevision: null,
		source: {
			game: "stairwell",
			build: "engineering-fixture",
			engine: "4.8.0",
			rules: "portable-contract-fixture",
		},
		transfer: {
			castPassport: "hf-portable-person/1",
			portable: {
				format: "hf-portable-person",
				version: 1,
				castId: cast.castId,
				castRevision: cast.revision,
				source: { game: "stairwell", engine: "4.8.0", personId: "derya" },
				state: {
					traits: structuredClone(actor.traits),
					values: structuredClone(actor.values),
					body: {
						satiety,
						hydration,
						sleepPressure,
						exertion,
						fitness,
						health,
						pain,
						sleepDebtHours,
					},
					mood: { valence: 0, arousal: 0 },
				},
				history: [],
				omittedHistory: 0,
			},
		},
		limitations: ["Synthetic engineering fixture; no source custody."],
	});
	expect(portablePersonRole(parent, "stairwell")).toBe("derya");
	const before = JSON.stringify(parent);
	let writes = 0;
	await expect(
		prepareIncomingTownDurably(
			42,
			6,
			[preparePersonaLife(parent, 0)],
			async () => {
				writes++;
			},
			() => true,
		),
	).rejects.toThrow(/no matching authored role/);
	expect(writes).toBe(0);
	expect(JSON.stringify(parent)).toBe(before);
});

it("awaits complete host persistence and refuses a stale candidate after preparation", async () => {
	let persisted = false;
	let release!: () => void;
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	const preparing = prepareIncomingTownDurably(
		42,
		6,
		[],
		async (value) => {
			expect(
				Object.keys(value.candidate.owner.run.current.people),
			).toHaveLength(6);
			await held;
			persisted = true;
		},
		() => true,
	);
	expect(persisted).toBe(false);
	release();
	const native = await preparing;
	expect(persisted).toBe(true);
	expect(native.format).toBe("neighbours-native");
	let current = true;
	await expect(
		prepareIncomingTownDurably(
			42,
			6,
			[],
			async () => {
				current = false;
			},
			() => current,
		),
	).rejects.toThrow("Run changed during");
});
