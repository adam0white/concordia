/** Isolated physical hall faculty. Synthetic damage/location, actual public
 * agenda inputs and native cold continuation. No natural repair scene claim. */
import { expect, it } from "vitest";
import {
	HALL_GOAL_LABEL,
	noticeLooseHall,
	settleHallGoals,
	validateHallCare,
} from "../src/core/hall-care.ts";
import { TownRunOwner } from "../src/core/hf4-owner.ts";
import { MINUTE } from "../src/core/hf4-run.ts";
import { Runtime } from "../src/core/runtime.ts";
import { createRuntime } from "./current-town.ts";

it("queues one seen physical repair purpose, cold continues it through the Run and abandons it only when repairs finish", () => {
	const live = createRuntime(42, 6),
		nora = live.actor("ada");
	nora.place = "hall";
	live.s.hall = 10;
	expect(noticeLooseHall(live.s, nora)).toBe(false);
	live.s.timber = { damp: 1, care: { loosened: 1 } };
	expect(live.s.owner.actor("ada").body.asleep).toBe(false);
	expect(noticeLooseHall(live.s, nora)).toBe(true);
	expect(noticeLooseHall(live.s, nora)).toBe(false);
	expect(
		live.s.owner
			.actor("ada")
			.agenda.goals.some((goal) => goal.label === HALL_GOAL_LABEL),
	).toBe(false);
	const packet = live.export(),
		cold = Runtime.hydrate(packet, TownRunOwner.restore(packet.owner));
	for (const runtime of [live, cold]) {
		runtime.s.owner.advance(runtime.s.owner.at + 1);
		runtime.s.now = runtime.s.owner.at / MINUTE;
	}
	expect(cold.export()).toEqual(live.export());
	const goals = live.s.owner
		.actor("ada")
		.agenda.goals.filter((goal) => goal.label === HALL_GOAL_LABEL);
	expect(goals).toHaveLength(1);
	expect(goals[0]?.serves).toEqual(["meaning", "belonging"]);
	const away = live.actor("sam");
	away.place = "homes";
	expect(noticeLooseHall(live.s, away)).toBe(false);
	live.s.hall = 12;
	settleHallGoals(live.s);
	live.s.owner.advance(live.s.owner.at + 1);
	expect(
		live.s.owner
			.actor("ada")
			.agenda.goals.filter(
				(goal) => goal.label === HALL_GOAL_LABEL && goal.status === "active",
			),
	).toEqual([]);
});
it("rejects malformed physical care counts", () => {
	for (const value of [
		{ loosened: -1 },
		{ loosened: 1.5 },
		{ loosened: 0, extra: 1 },
	])
		expect(() => validateHallCare(value)).toThrow();
	expect(() => validateHallCare({ loosened: 2 })).not.toThrow();
});
