/** The transport answers a refusal that changed nothing as `rejected`, so the engine can stay usable. */
import { expect, it } from "vitest";
import { RuntimePort } from "../src/bridge-port.ts";

it("a refused physical request is answered as rejected and leaves the town byte-identical", () => {
	const port = new RuntimePort(42, 6);
	const save = port.runtime.export();
	const reply = JSON.parse(
		port.call(
			JSON.stringify({
				op: "intervene",
				intervention: { kind: "player-move", placeId: "homes" },
			}),
		),
	);
	expect(reply).toEqual({ rejected: "You are already there" });
	expect(port.runtime.export()).toEqual(save);
	const boundary = port.dispatch({ op: "prepare" }) as {
		requests: { id: string; person?: string }[];
	};
	expect(boundary.requests.length).toBeGreaterThan(0);
	for (const request of boundary.requests) {
		const actionId = port.dispatch({
			op: "choose",
			actorId: request.person,
			requestId: request.id,
		});
		expect(() =>
			port.dispatch({
				op: "apply",
				actorId: request.person,
				requestId: request.id,
				actionId,
			}),
		).not.toThrow();
	}
});

it("captures the exact206-person current start boundary without taking a complete archive", async () => {
	const { exportRun } = await import("@adam0white/human-framework");
	const port = new RuntimePort(42, 206);
	port.wanted.add("ada");
	const original = port.runtime.export.bind(port.runtime);
	port.runtime.export = () => {
		throw Error("Unexpected complete capture for current-only boundary");
	};
	for (let i = 0; i < 8 && !port.boundaries.has("ada"); i++) {
		const boundary = port.dispatch({ op: "prepare" }) as ReturnType<
			typeof port.runtime.prepareBoundary
		>;
		if (port.boundaries.has("ada")) break;
		for (const request of boundary.requests) {
			const actionId = port.runtime.choose(request.id);
			port.runtime.apply(request.id, actionId);
		}
	}
	port.runtime.export = original;
	const runtime = port.runtime as import("../src/core/runtime.ts").Runtime;
	expect(Object.keys(runtime.currentActors())).toHaveLength(206);
	expect(port.boundaries.get("ada")).toStrictEqual(
		exportRun(runtime.s.owner.run).current.people.ada,
	);
	expect(port.boundaries.has("ada")).toBe(true);
}, 15000);
