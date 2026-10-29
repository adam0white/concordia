import { expect, it } from "vitest";
import { proseFree } from "./prose-free.ts";

it("blanks named prose without erasing semantic string identities or numbers", () => {
	const state = {
		text: "The old wording.",
		person: { label: "An action label", summary: "A remembered event." },
		usedLines: ["person:line with spaces"],
		id: "action with spaces",
		reason: "promise-kept",
		action: "repair",
		causes: [17],
		wealth: 3,
	};
	const blanked = proseFree(state);
	expect(blanked).toEqual({
		...state,
		text: "",
		person: { label: "An action label", summary: "" },
	});
	expect(proseFree({ ...state, text: "The new wording." })).toEqual(blanked);
	for (const change of [
		{ usedLines: ["person:different line with spaces"] },
		{ id: "another action with spaces" },
		{ reason: "promise-broken" },
		{ action: "rest" },
		{ causes: [18] },
		{ wealth: 4 },
		{
			person: {
				label: "A different semantic goal",
				summary: "A remembered event.",
			},
		},
	])
		expect(proseFree({ ...state, ...change })).not.toEqual(blanked);
});

it("keeps rewritten label identities distinct instead of blanking semantic goals", () => {
	expect(
		proseFree({
			label: "Teach a practical repair class that moved after the flood",
		}),
	).toEqual({ label: "Teach a displaced practical repair class" });
	expect(
		proseFree({ label: "Check the flood-damaged timber before reopening" }),
	).not.toEqual(proseFree({ label: "A different goal" }));
});
