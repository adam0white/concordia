import { expect, it } from "vitest";
import { activityLabel, canAct } from "../src/ui/person-status";

it("never presents a dead or downed person as doing a stale job", () => {
	expect(activityLabel({ lifeState: "dead", activity: "Rest at home" })).toBe(
		"Died",
	);
	expect(
		activityLabel({ lifeState: "downed", activity: "Repair the hall" }),
	).toBe("Unable to get up or act");
	expect(canAct({ lifeState: "dead" })).toBe(false);
	expect(canAct({ lifeState: "downed" })).toBe(false);
});
it("reads current state rather than inferring it from a previous condition event", () => {
	expect(
		activityLabel({ lifeState: "awake", activity: "Tend the garden" }),
	).toBe("Tend the garden");
	expect(canAct({ lifeState: "awake" })).toBe(true);
	expect(activityLabel({ lifeState: "asleep", activity: "Rest at home" })).toBe(
		"Asleep",
	);
});
