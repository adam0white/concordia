import { expect, it } from "vitest";
import type { PersonView } from "../src/contracts.ts";
import { personOutcome, personOutcomeNotice } from "../src/person-outcome.ts";

const person = (id = "musa"): PersonView =>
	({
		id,
		name: id === "musa" ? "Musa" : "Ada",
		commitments: [],
		invitations: [],
	}) as unknown as PersonView;
const promise = { label: "Harvest food for Sam", at: 1200, status: "pending" };
const view = (p: PersonView) => ({ people: [p] });
it("reports an actual newly kept promise, not a pending deadline alone", () => {
	const start = person();
	start.commitments = [promise];
	const current = structuredClone(start);
	expect(personOutcome(view(start), view(current), "musa")).toBeUndefined();
	current.commitments[0] = { ...promise, status: "kept" };
	const result = personOutcome(view(start), view(current), "musa");
	expect(result?.kind).toBe("commitment");
	expect(personOutcomeNotice(result)).toBe(
		"Musa kept a promise: Harvest food for Sam.",
	);
});
it.each(["broken", "released"])(
	"reports a real %s status without inferring a reason",
	(status) => {
		const start = person(),
			current = person();
		start.commitments = [promise];
		current.commitments = [{ ...promise, status }];
		const result = personOutcome(view(start), view(current), "musa");
		expect(result?.status).toBe(status);
		expect(personOutcomeNotice(result)).not.toContain("because");
	},
);
it("does not report old resolutions or another person's outcomes", () => {
	const start = person();
	start.commitments = [{ ...promise, status: "kept" }];
	const current = structuredClone(start);
	expect(personOutcome(view(start), view(current), "musa")).toBeUndefined();
	const ada = person("ada");
	ada.commitments = [{ ...promise, status: "broken" }];
	expect(
		personOutcome(
			{ people: [start, person("ada")] },
			{ people: [current, ada] },
			"musa",
		),
	).toBeUndefined();
});
it("counts duplicate commitment records separately using label, deadline and status", () => {
	const start = person();
	start.commitments = [{ ...promise, status: "kept" }, { ...promise }];
	const current = structuredClone(start);
	current.commitments = [
		{ ...promise, status: "kept" },
		{ ...promise, status: "kept" },
	];
	expect(personOutcome(view(start), view(current), "musa")?.status).toBe(
		"kept",
	);
	current.commitments = [{ ...promise, status: "kept" }];
	expect(personOutcome(view(start), view(current), "musa")).toBeUndefined();
});
it.each(["attended", "missed", "declined"] as const)(
	"reports actual invitation %s by event ID and status",
	(status) => {
		const start = person();
		start.invitations = [
			{
				eventId: "class-1",
				title: "Lea’s class",
				startsAt: 1500,
				status: "accepted",
			},
		];
		const current = structuredClone(start);
		current.invitations = [
			{ eventId: "class-1", title: "Lea’s class", startsAt: 1500, status },
		];
		const result = personOutcome(view(start), view(current), "musa");
		expect(result?.kind).toBe("invitation");
		expect(result?.status).toBe(status);
		if (status === "missed")
			expect(personOutcomeNotice(result)).toBe(
				"Musa did not attend Lea’s class.",
			);
		expect(personOutcome(view(current), view(current), "musa")).toBeUndefined();
	},
);
it("keeps actual heard and accepted invitations pending and reads without mutation", () => {
	const start = person();
	const current = person();
	current.invitations = [
		{ eventId: "class-1", title: "Class", startsAt: 1500, status: "accepted" },
	];
	const before = structuredClone(current);
	expect(personOutcome(view(start), view(current), "musa")).toBeUndefined();
	expect(current).toEqual(before);
	expect(personOutcome(view(start), view(current), "unknown")).toBeUndefined();
});
