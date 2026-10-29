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
