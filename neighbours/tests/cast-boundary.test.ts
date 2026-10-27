import { expect, it } from "vitest";
import { RuntimePort } from "../src/bridge-port.ts";
import { stateHash } from "../src/core/hash.ts";

it("observes an actual finished action without changing offers, choices or the town", () => {
	const observed = new RuntimePort(42, 6),
		control = new RuntimePort(42, 6);
	observed.wanted.add("noor");
	for (let round = 0; round < 24 && !observed.boundaries.has("noor"); round++) {
		const a = observed.dispatch({ op: "prepare" }) as string[],
			b = control.dispatch({ op: "prepare" }) as string[];
		expect(a).toEqual(b);
		for (const actorId of a) {
			expect(observed.dispatch({ op: "offers", actorId })).toEqual(
				control.dispatch({ op: "offers", actorId }),
			);
			const actionId = observed.dispatch({ op: "choose", actorId });
			expect(actionId).toEqual(control.dispatch({ op: "choose", actorId }));
			observed.dispatch({ op: "apply", actorId, actionId });
			control.dispatch({ op: "apply", actorId, actionId });
		}
	}
	const actual = observed.boundaries.get("noor");
	if (!actual) throw Error("No real completed-action boundary");
	expect(actual.activity).toBeFalsy();
	expect(actual.nextDecision).toBeGreaterThan(0);
	expect(actual.now).toBeGreaterThan(480);
	expect(stateHash(observed.runtime.export())).toBe(
		stateHash(control.runtime.export()),
	);
});

it("keeps a foreign source journal inert and refuses native fresh, checkpoint and fork", async () => {
	const { vi } = await import("vitest");
	vi.stubGlobal("window", new EventTarget());
	try {
		const { CastSession } = await import("../src/cast-session.ts");
		const { canonicalPersona } = await import("@adam0white/lab-client");
		const { createRuntime } = await import("../src/core/index.ts");
		const runtime = createRuntime(
			42,
			206,
		).export() as import("../src/core/state.ts").Save;
		const first = runtime.people[0];
		if (!first) throw Error("Missing control person");
		const person = first.person;
		const digest = Array.from(
			new Uint8Array(
				await crypto.subtle.digest(
					"SHA-256",
					new TextEncoder().encode(canonicalPersona(person)),
				),
			),
		)
			.map((x) => x.toString(16).padStart(2, "0"))
			.join("");
		const packet = {
			schema: "neighbours/concordia@1",
			rounds: runtime.round,
			runtime,
			castLocal: {
				heads: [],
				sources: { [digest]: structuredClone(person) },
				chapter: canonicalPersona([runtime.seed, runtime.chapter]),
				file: true,
				localOnly: true,
			},
		};
		const session = new CastSession(
			async () => packet,
			() => {},
			true,
		);
		await session.load(packet);
		session.commitLoad();
		expect(session.decorate(packet)).toEqual(packet);
		await expect(session.fresh(42, 206)).rejects.toThrow("file session");
		await expect(
			session.checkpoint(packet, "hf.cast.rafi.pass"),
		).rejects.toThrow("file session");
		await expect(
			session.checkpoint(packet, "hf.cast.rafi.pass", true),
		).rejects.toThrow("file session");
		const bad = structuredClone(packet);
		const source = bad.castLocal.sources[digest];
		if (!source) throw Error("Missing source");
		source.now++;
		await expect(session.load(bad)).rejects.toThrow(
			"Source journal digest differs",
		);
		session.close();
	} finally {
		vi.unstubAllGlobals();
	}
});

it("retains validated nonempty imported receipts and full source snapshots without granting ownership", async () => {
	const { vi } = await import("vitest");
	vi.stubGlobal("window", new EventTarget());
	try {
		const { readFileSync } = await import("node:fs");
		const sdk = await import("@adam0white/lab-client");
		const hf = await import("@adam0white/human-framework");
		const { CastSession } = await import("../src/cast-session.ts");
		const { prepareReceivingTownCast } = await import(
			"../src/received-town.ts"
		);
		const { HOST_CAST, CAST_EDITION, CAST_RULES } = await import(
			"../src/core/canonical-cast.ts"
		);
		const actual = JSON.parse(
			readFileSync(
				new URL("./fixtures/pass-rafi-453be903.json", import.meta.url),
				"utf8",
			),
		);
		const input = sdk.preparePersonaLife(
			actual.envelope,
			actual.envelope.transfer.life.clock.watermark,
		);
		const { revision, ...body } = input.parent;
		const claim = await sdk.createPersona({
			...body,
			parentRevision: revision,
			source: {
				game: "neighbours",
				build: "source-control",
				engine: hf.ENGINE_VERSION,
				rules: CAST_RULES,
			},
			transfer: { ...body.transfer, life: input.life },
		});
		const runtime = prepareReceivingTownCast(42, 206, [input]);
		const initial = Object.fromEntries(
			runtime.people
				.filter((r) => r.known)
				.map((r) => [
					HOST_CAST[r.person.id as keyof typeof HOST_CAST],
					hf.snapshot(r.person),
				]),
		);
		runtime.chapter = {
			edition: CAST_EDITION,
			inputs: [input],
			claims: [claim],
			initial,
			mapping: "neighbours-calendar/1",
		};
		const first = runtime.people[0];
		if (!first) throw Error("Missing source person");
		const source = hf.snapshot(first.person);
		const digest = Array.from(
			new Uint8Array(
				await crypto.subtle.digest(
					"SHA-256",
					new TextEncoder().encode(sdk.canonicalPersona(source)),
				),
			),
		)
			.map((x) => x.toString(16).padStart(2, "0"))
			.join("");
		const packet = {
			schema: "neighbours/concordia@1",
			rounds: runtime.round,
			runtime,
			castLocal: {
				heads: [claim],
				sources: { [digest]: source },
				chapter: sdk.canonicalPersona([runtime.seed, runtime.chapter]),
				file: false,
				localOnly: false,
			},
		};
		const session = new CastSession(
			async () => packet,
			() => {},
			true,
		);
		await session.load(packet);
		session.commitLoad();
		const exported = session.decorate(packet);
		expect(exported.runtime).toEqual(runtime);
		expect(exported.castLocal?.heads).toEqual([claim]);
		expect(exported.castLocal?.sources).toEqual(packet.castLocal.sources);
		expect(exported.castLocal?.file).toBe(true);
		await session.load(exported);
		session.commitLoad();
		expect(session.decorate(exported)).toEqual(exported);
		await expect(
			session.checkpoint(exported, claim.castId, true),
		).rejects.toThrow("file session");
		session.close();
	} finally {
		vi.unstubAllGlobals();
	}
});
