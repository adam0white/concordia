import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { TownView, UiReply } from "../src/contracts.ts";

const fake = vi.hoisted(() => ({
	fresh: vi.fn(async () => ({ runtime: {} })),
	load: vi.fn(async () => {}),
	commitFresh: vi.fn(),
	commitLoad: vi.fn(),
	abortLoad: vi.fn(),
	suspend: vi.fn(),
	recording: vi.fn(async () => {}),
	close: vi.fn(),
	checkpointAll: vi.fn(async () => {}),
	decorate: vi.fn((x: unknown) => x),
	postMessage: vi.fn(),
}));
vi.mock("../src/cast-session.ts", () => ({
	CastSession: class {
		constructor() {
			Object.assign(this, fake);
		}
	},
}));

import { RuntimeClient } from "../src/runtime-client.ts";

let worker: {
	onmessage: ((e: { data: UiReply }) => void) | null;
	postMessage: typeof fake.postMessage;
	terminate: () => void;
};
beforeEach(() => {
	vi.clearAllMocks();
	vi.stubGlobal(
		"Worker",
		class {
			onmessage: ((e: { data: UiReply }) => void) | null = null;
			postMessage = fake.postMessage;
			terminate() {}
			constructor() {
				worker = this;
			}
		},
	);
});
afterEach(() => vi.unstubAllGlobals());
const view = { day: 1, people: [], seed: 42 } as unknown as TownView;
it("opens recording only after UI accepts the exact fresh or restored worker view", async () => {
	const client = new RuntimeClient(() => {});
	worker.onmessage?.({ data: { type: "ready", view } });
	await vi.waitFor(() => expect(fake.postMessage).toHaveBeenCalled());
	const fresh = fake.postMessage.mock.calls.at(-1)?.[0] as {
		newRequestId: number;
	};
	const wrong = {
		type: "ready",
		view,
		newRequestId: fresh.newRequestId + 1,
	} as const;
	worker.onmessage?.({ data: wrong });
	client.acceptView(wrong);
	expect(fake.commitFresh).not.toHaveBeenCalled();
	const ready = {
		type: "ready",
		view,
		newRequestId: fresh.newRequestId,
	} as const;
	worker.onmessage?.({ data: ready });
	expect(fake.commitFresh).not.toHaveBeenCalled();
	client.acceptView(ready);
	expect(fake.commitFresh).toHaveBeenCalledTimes(1);
	client.send({ type: "restore", save: {} });
	await vi.waitFor(() => expect(fake.load).toHaveBeenCalled());
	await vi.waitFor(() =>
		expect(fake.postMessage.mock.calls.at(-1)?.[0]).toMatchObject({
			type: "restore",
		}),
	);
	const restore = fake.postMessage.mock.calls.at(-1)?.[0] as {
		restoreRequestId: number;
	};
	client.acceptView({ type: "state", view });
	expect(fake.commitLoad).not.toHaveBeenCalled();
	const restored = {
		type: "state",
		view,
		restoreRequestId: restore.restoreRequestId,
	} as const;
	worker.onmessage?.({ data: restored });
	expect(fake.commitLoad).not.toHaveBeenCalled();
	client.acceptView(restored);
	expect(fake.commitLoad).toHaveBeenCalledTimes(1);
	client.send({ type: "new", seed: 73 });
	client.acceptView(restored);
	expect(fake.commitLoad).toHaveBeenCalledTimes(1);
	client.close();
});

it("keeps explicit local seeds local across new towns and preserves automatic admission by default", async () => {
	const local = new RuntimeClient(
		() => {},
		false,
		() => {},
		true,
		false,
		73,
	);
	worker.onmessage?.({ data: { type: "ready", view } });
	await vi.waitFor(() =>
		expect(fake.fresh).toHaveBeenCalledWith(73, 206, true),
	);
	expect(fake.postMessage.mock.calls.at(-1)?.[0]).toMatchObject({
		type: "new",
		seed: 73,
	});
	local.send({ type: "new", seed: 99 });
	await vi.waitFor(() =>
		expect(fake.fresh).toHaveBeenCalledWith(99, 206, true),
	);
	local.close();
	fake.fresh.mockClear();
	const automatic = new RuntimeClient(() => {});
	worker.onmessage?.({ data: { type: "ready", view } });
	await vi.waitFor(() =>
		expect(fake.fresh).toHaveBeenCalledWith(42, 206, false),
	);
	automatic.send({ type: "new", seed: 71 });
	await vi.waitFor(() =>
		expect(fake.fresh).toHaveBeenCalledWith(71, 206, false),
	);
	automatic.close();
});

it("retains the same-reply journal for a captured native checkpoint without requesting a later world", async () => {
	const client = new RuntimeClient(() => {}, true);
	const pending = client.capture();
	await vi.waitFor(() => expect(fake.postMessage).toHaveBeenCalled());
	const request = fake.postMessage.mock.calls.at(-1)?.[0] as {
		requestId: number;
	};
	const native = { schema: "native", at: 495 };
	const journal = { schema: "journal", at: 495 };
	worker.onmessage?.({
		data: {
			type: "save",
			requestId: request.requestId,
			save: native,
			recording: journal,
		} as UiReply,
	});
	expect(await pending).toBe(native);
	expect(client.recordingFor(native)).toBe(journal);
	expect(client.recordingFor({ ...native })).toBeUndefined();
	expect(fake.postMessage).toHaveBeenCalledTimes(1);
	client.close();
});
