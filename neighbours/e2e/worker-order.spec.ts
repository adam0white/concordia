import { readdir } from "node:fs/promises";
import { expect, test } from "./clock-fixture";

test("worker rejects an invalid queued advance in command order and preserves the preceding step", async ({
	page,
}) => {
	await page.goto("/?lab=1");
	const asset = (await readdir("dist/assets")).find(
		(name) => name.startsWith("runtime.worker-") && name.endsWith(".js"),
	);
	if (!asset) throw Error("Built worker asset missing");
	const replies = await page.evaluate(async (path) => {
		const worker = new Worker(new URL(`/assets/${path}`, location.href), {
			type: "module",
		});
		const replies: { type: string; now?: number; message?: string }[] = [];
		try {
			return await new Promise<typeof replies>((resolve, reject) => {
				const timeout = setTimeout(
					() => reject(Error("Worker did not finish queued commands")),
					60000,
				);
				worker.onerror = (event) => {
					clearTimeout(timeout);
					reject(Error(event.message));
				};
				worker.onmessage = (event) => {
					const reply = event.data;
					if (reply.type === "progress") return;
					replies.push({
						type: reply.type,
						now: reply.view?.now ?? reply.save?.runtime?.now,
						message: reply.message,
					});
					if (reply.type === "save") {
						clearTimeout(timeout);
						resolve(replies);
					}
				};
				worker.postMessage({ type: "step", rounds: 1 });
				worker.postMessage({
					type: "advance",
					requestId: 0,
					until: "story",
					maxRounds: 1,
				});
				worker.postMessage({ type: "save", requestId: 1 });
			});
		} finally {
			worker.terminate();
		}
	}, asset);
	expect(replies.map((reply) => reply.type)).toEqual([
		"ready",
		"state",
		"error",
		"save",
	]);
	expect(replies[2]?.message).toContain("positive safe request ID");
	expect(replies[1]?.now).toBe(495);
	expect(replies[3]?.now).toBe(495);
});
