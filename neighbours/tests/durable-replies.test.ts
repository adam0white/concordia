import { describe, expect, it } from "vitest";
import type { TownView, UiReply } from "../src/contracts";
import { createRuntime, restoreRuntime } from "../src/core/index.ts";
import type { Runtime } from "../src/core/runtime.ts";
import type { Save } from "../src/core/state.ts";
import { orderedReplies } from "../src/ui/durable-replies";

const T = 60_000;
const later = () => new Promise<void>((resolve) => setTimeout(resolve, 5));
const view = (now: number) => ({ now }) as unknown as TownView;
const state = (now: number, save?: unknown): UiReply => ({
	type: "state",
	view: view(now),
	...(save === undefined ? {} : { save }),
});

/** Walk the player to the flooded hall; at 585 Ada and Noor are there (as in player.test.ts). */
function atHall(): Runtime {
	const r = createRuntime(42, 208) as Runtime;
	for (let i = 0; i < 4; i++) r.step();
	r.intervene({ kind: "player-move", placeId: "hall" });
	while (r.view().player?.job) r.step();
	return r;
}

describe("a player's answer is shown only after its checkpoint is stored", () => {
	it(
		"after a speak resolves, the stored device save already holds the request and its booked costs",
		async () => {
			const r = atHall();
			const offer = r.predictSpeech("ada").offers[0];
			if (!offer) throw Error("No offer from Ada at the hall");
			r.intervene({
				kind: "player-speak",
				actorId: "ada",
				affordanceId: offer.affordanceId,
				mode: "urge",
			});
			const answered = r.view();
			const request = answered.player?.requests.at(-1);
			expect(request?.targetId).toBe("ada");
			// The worker's packet: the Concordia wrapper around the runtime export.
			const packet = {
				schema: "neighbours/concordia@1",
				rounds: 0,
				runtime: r.export(),
			};
			const device = new Map<string, unknown>();
			const shown: TownView[] = [];
			const receive = orderedReplies(
				(reply) => {
					if (reply.type !== "state") return;
					// The answer reaches the screen only with the request already on the device.
					const stored = device.get("latest") as typeof packet | undefined;
					expect(
						(stored?.runtime as Save | undefined)?.player?.requests.some(
							(q) => q.id === request?.id,
						),
					).toBe(true);
					shown.push(reply.view);
				},
				async (reply) => {
					await later();
					device.set("latest", structuredClone(reply.save));
				},
			);
			receive({ type: "state", view: answered, save: packet });
			expect(shown).toHaveLength(0);
			await later();
			await later();
			expect(shown).toEqual([answered]);

			// A reload restores the answered request and the person's booked will, not an earlier checkpoint.
			const stored = device.get("latest") as typeof packet;
			const reloaded = restoreRuntime(stored.runtime) as Runtime;
			expect(reloaded.view().player?.requests.at(-1)).toEqual(request);
			expect(reloaded.actor("ada").person.will).toEqual(
				r.actor("ada").person.will,
			);
		},
		T,
	);

	it("later replies wait behind a held checkpoint and keep worker order", async () => {
		const order: string[] = [];
		let release = () => {};
		const receive = orderedReplies(
			(reply) =>
				order.push(
					reply.type === "state" ? `state ${reply.view.now}` : reply.type,
				),
			() =>
				new Promise<void>((resolve) => {
					release = () => {
						order.push("stored");
						resolve();
					};
				}),
		);
		receive(state(1));
		receive(state(2, { runtime: { now: 2 } }));
		receive(state(3));
		receive({ type: "save", save: {}, requestId: 1 });
		expect(order).toEqual(["state 1"]);
		release();
		await later();
		expect(order).toEqual(["state 1", "stored", "state 2", "state 3", "save"]);
		// Once settled, replies are delivered synchronously again.
		receive(state(4));
		expect(order.at(-1)).toBe("state 4");
	});

	it("a failed device write still delivers the reply and later ones", async () => {
		const order: number[] = [];
		const errors: unknown[] = [];
		const receive = orderedReplies(
			(reply) => {
				if (reply.type === "state") order.push(reply.view.now);
			},
			() => Promise.reject(Error("quota")),
			(error) => errors.push(error),
		);
		receive(state(1, {}));
		receive(state(2));
		await later();
		expect(order).toEqual([1, 2]);
		expect(errors).toHaveLength(1);
	});

	it("a checkpoint the session declines to store is delivered at once", () => {
		const order: number[] = [];
		const receive = orderedReplies(
			(reply) => {
				if (reply.type === "state") order.push(reply.view.now);
			},
			() => undefined,
		);
		receive(state(1, {}));
		receive(state(2));
		expect(order).toEqual([1, 2]);
	});
});
