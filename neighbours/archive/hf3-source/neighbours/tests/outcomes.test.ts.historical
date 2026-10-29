import {
	type Affordance,
	begin,
	createPerson,
	decide,
	finish,
	readPerson,
	tick,
} from "@adam0white/human-framework";
import { expect, it } from "vitest";
import { realizedOutcome } from "../src/core/outcomes.ts";

const evidence = {
	socialCompanions: 0,
	attendedLesson: false,
	material: 0,
	status: "completed" as const,
};
function offer(
	action: string,
	advertises: Affordance["advertises"],
): Affordance {
	return {
		id: action,
		action,
		label: action,
		duration: 120,
		effort: 0,
		advertises,
	};
}
it("lets HF measure actual sleep recovery instead of learning the advertised promise", () => {
	const p = createPerson({
		id: "sleeper",
		name: "Sleeper",
		sex: "female",
		seed: 42,
		now: 480,
		bornAt: -10000000,
	});
	const a = {
		...offer("sleep", { sleep: 0.6, rest: 0.4 }),
		mode: "sleep" as const,
	};
	const before = readPerson(p).needs.find((n) => n.id === "sleep")?.level ?? 0;
	begin(p, a, decide(p, [a]));
	tick(p, 600);
	const after = readPerson(p).needs.find((n) => n.id === "sleep")?.level ?? 0;
	const result = finish(p, {
		affordanceId: a.id,
		action: a.action,
		status: "completed",
		at: 600,
		...realizedOutcome(a, evidence),
	});
	expect(result?.realized.sleep).toBeCloseTo(after - before, 12);
	expect(result?.realized.sleep).not.toBe(0.6);
});
it("an empty hall gives no social relief while a shared meal still feeds its eater", () => {
	const a = offer("gather", { food: 0.65, belonging: 0.65, meaning: 0.3 });
	expect(realizedOutcome(a, { ...evidence, material: -1 })).toEqual({
		needs: { food: 0.65 },
		material: -1,
	});
	expect(
		realizedOutcome(a, { ...evidence, socialCompanions: 1, material: -1 })
			.needs,
	).toEqual(a.advertises);
});
it("classroom relief requires actual received teaching", () => {
	const a = offer("learn", { competence: 0.3, belonging: 0.2 });
	expect(
		realizedOutcome(a, { ...evidence, socialCompanions: 1 }).needs,
	).toEqual({});
	expect(
		realizedOutcome(a, {
			...evidence,
			socialCompanions: 1,
			attendedLesson: true,
		}).needs,
	).toEqual(a.advertises);
});
it("records actual host money, never the advertised payment", () => {
	const a = { ...offer("work", { competence: 0.3 }), material: 99 };
	expect(realizedOutcome(a, { ...evidence, material: 2 }).material).toBe(2);
	expect(realizedOutcome({ ...a, action: "grow" }, evidence).material).toBe(0);
});
it("failed inspection does not deliver promised psychological relief", () => {
	expect(
		realizedOutcome(offer("open-section", { competence: 0.4, meaning: 0.3 }), {
			...evidence,
			status: "failed",
		}).needs,
	).toEqual({});
});
