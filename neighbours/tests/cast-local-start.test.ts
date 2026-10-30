import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { CastSession } from "../src/cast-session.ts";
import { restoreRuntime } from "../src/core/restore.ts";

const receiving = vi.hoisted(() => ({
	persist: vi.fn(async () => {
		throw Error("Receiving preparation store unavailable");
	}),
	claim: vi.fn(),
}));
vi.mock("../src/prepared-town-store.ts", () => ({
	persistPreparedTown: receiving.persist,
}));
vi.mock("../src/ui/lab.tsx", () => ({ lab: { sendFeedback: vi.fn() } }));
vi.mock("@adam0white/lab-client", async (original) => ({
	...(await original<typeof import("@adam0white/lab-client")>()),
	personaChannel: () => ({ ready: Promise.resolve(), enabled: false }),
	claimCastChapterBatch: receiving.claim,
}));
beforeAll(() => {
	vi.stubGlobal("window", new EventTarget());
	vi.stubGlobal("location", { pathname: "/" });
});
afterAll(() => vi.unstubAllGlobals());

it("an explicitly authored local town remains available when unrelated incoming storage fails", async () => {
	const session = new CastSession(
		async () => null,
		() => {},
		false,
	);
	try {
		const packet = await session.fresh(71, 6, true);
		expect(packet.runtime.physical.seed).toBe(71);
		expect(packet.runtime.physical.people).toHaveLength(6);
		expect(packet.runtime.hf).toBe("4.15.0");
		expect(session.localOnly).toBe(true);
		expect(receiving.persist).not.toHaveBeenCalled();
		expect(receiving.claim).not.toHaveBeenCalled();
		expect(restoreRuntime(packet.runtime).export()).toEqual(packet.runtime);
	} finally {
		session.close();
	}
});
