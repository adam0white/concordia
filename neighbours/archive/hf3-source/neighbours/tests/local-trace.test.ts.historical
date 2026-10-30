import { expect, it } from "vitest";
import { LocalTrace, TRACE_LIMIT } from "../src/ui/local-trace";

it("bounds memory, times a public command boundary and refuses retired callbacks", () => {
	let now = 0;
	const trace = new LocalTrace(() => now);
	const first = trace.begin();
	const command = trace.command(first, "step", 2);
	now = 25;
	trace.ack(first, command, "accepted", 0);
	expect(trace.read().entries.at(-1)).toMatchObject({
		event: "ack",
		command: "step",
		durationMs: 25,
		pending: 0,
	});
	trace.end(first);
	const second = trace.begin();
	const before = trace.read();
	trace.ack(first, command, "accepted", 0);
	trace.event(first, "menu-open", { pending: 0 });
	expect(trace.read()).toEqual(before);
	for (let i = 0; i < TRACE_LIMIT * 3; i++) {
		now++;
		trace.event(second, "resize", { pending: i, width: 360, height: 690 });
	}
	const result = trace.read();
	expect(result.entries).toHaveLength(TRACE_LIMIT);
	expect(result.dropped).toBeGreaterThan(TRACE_LIMIT);
	expect(result.entries.at(-1)?.pending).toBe(TRACE_LIMIT * 3 - 1);
	result.entries.length = 0;
	expect(trace.read().entries).toHaveLength(TRACE_LIMIT);
});

it("a held old async acknowledgement cannot enter a replacement trace session", async () => {
	const trace = new LocalTrace();
	const old = trace.begin();
	const command = trace.command(old, "step", 1);
	let release = () => {};
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const callback = gate.then(() => trace.ack(old, command, "accepted", 0));
	trace.end(old);
	const current = trace.begin();
	const next = trace.command(current, "new", 1);
	const before = trace.read();
	release();
	await callback;
	expect(trace.read()).toEqual(before);
	trace.ack(current, next, "accepted", 0);
	trace.ack(current, next, "accepted", 0);
	expect(trace.read().entries.filter((e) => e.event === "ack")).toHaveLength(1);
});
