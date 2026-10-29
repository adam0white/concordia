import { expect, it } from "vitest";
import { buildOffers } from "../src/core/offers.ts";
import type { Runtime } from "../src/core/runtime.ts";
import {
	actionWords,
	counterWords,
	ingWords,
	jobLine,
	offerKind,
	PHRASES,
	phraseFor,
	refusalWhy,
	voicedLine,
} from "../src/core/voicing.ts";
import { createRuntime } from "./current-town.ts";

/** Labels that a short run does not reach: floor rest, the annex, later evenings and the handcart. */
const FIXTURES: [string, string][] = [
	["wait-inspector", "Wait for Nora beside the hall noticeboard"],
	["private-share", "Share something private about this matter"],
	["private-decline", "Keep the matter private"],
	["pray", "Keep the prayer appointment they received"],
	["tea", "Take a tea break"],
	["rest-here", "Rest on the floor here"],
	["sleep-here", "Sleep on the floor here"],
	["eat", "Eat a meal at the market"],
	["gather", "Share a meal in the reopened hall"],
	["teach", "Teach the evening class that moved after the flood"],
	["annex-visit", "Visit the hall annex to inspect its timber"],
	["annex-ask-inspector", "Ask an experienced inspector"],
	["annex-open-section", "Open this section"],
	["annex-keep-closed", "Keep this section closed"],
	[
		"post-structural-question",
		"Leave a note asking someone to check the supports",
	],
	["answer-inspection:ada", "Go over the timber checks with Ada"],
	[
		"propose:evening-0-meal",
		"Invite neighbours and promise to host Sam’s shared supper · Day 3 at 18:00",
	],
	["accept:weekly-1-class", "Accept Lea’s practical class · Day 6 at 18:00"],
	["decline:evening-0-meal", "Decline Sam’s shared supper"],
	["prepare:evening-0-class", "Prepare the hall for Lea’s practical class"],
	["host:evening-0-meal", "Host Sam’s shared supper at the hall"],
	["attend:evening-1-class", "Go to Lea’s practical class"],
	[
		"cart-ask",
		"Ask Ada for tomorrow’s 08:00–12:00 main bench; her paid work needs it too",
	],
	["cart-fast", "Restore one cart section on Ada’s main bench · one hour"],
	["cart-slow", "Restore one cart section on the side bench · two hours"],
	["cart-handover", "Return the restored handcart to Jo"],
];
const kindOf = (id: string) => {
	const kind = offerKind(id);
	return kind === "visit" ? "inspect" : kind;
};

/** Every offer the town builds over two days, menus included, plus the fixtures. */
function legalOffers(): [string, string][] {
	const r = createRuntime(42, 6) as Runtime;
	const seen = new Map<string, string>(FIXTURES);
	for (let round = 0; round < 1; round++) {
		r.step();
		for (const resident of r.s.people) {
			const job = resident.job;
			resident.job = undefined;
			try {
				for (const o of buildOffers(r.s, resident.id))
					seen.set(`${o.id}|${o.label}`, o.label ?? o.action);
			} finally {
				resident.job = job;
			}
		}
	}
	return [...seen].map(([key, label]) => [key.split("|")[0] ?? key, label]);
}

/** A capitalised menu word mid-sentence ("After I Leave …") is the failure this module removes. */
function soundsSpoken(line: string, label: string) {
	const menuWord = label.split(" ")[0] ?? "";
	expect(line).not.toMatch(/\bI [A-Z][a-z]/);
	expect(line.slice(1)).not.toContain(` ${menuWord} `);
	expect(line).not.toMatch(/·|\(|\)/);
	expect(line).toMatch(/[.]$/);
}

it("voices every legal offer kind as a person would say it", () => {
	const offers = legalOffers();
	const kinds = new Set(offers.map(([id]) => kindOf(id)));
	// Every kind seen has its own phrase, and the phrase table has no dead entries.
	expect([...kinds].sort()).toEqual(
		[...new Set(PHRASES.map((p) => p.kind))].sort(),
	);
	for (const [id, label] of offers) {
		expect(phraseFor(label)?.phrase.kind, `${id}: ${label}`).toBe(kindOf(id));
		const deferred = voicedLine({
			verdict: "deferred",
			says: `Not now. After I ${label}.`,
			counterOffer: { label: `after I ${label}` },
		});
		expect(deferred.startsWith("I cannot do that now. ")).toBe(true);
		soundsSpoken(deferred, label);
		soundsSpoken(
			voicedLine({
				verdict: "deferred",
				says: `After I ${label}, then I will.`,
				counterOffer: { label: `after I ${label}` },
			}),
			label,
		);
		soundsSpoken(
			voicedLine({
				verdict: "modified",
				says: `I'll ${label} instead.`,
				counterOffer: { label },
			}),
			label,
		);
		soundsSpoken(`They offered to ${counterWords({ label })}.`, label);
		soundsSpoken(
			`They offered to ${counterWords({ label: `after I ${label}` })}.`,
			label,
		);
		soundsSpoken(`Ada chose to ${actionWords(label)}.`, label);
	}
}, 120_000);

it("keeps the recorded line for other verdicts and reads unknown labels grammatically", () => {
	const refusal = { verdict: "refused", says: "No. Not today." };
	expect(voicedLine(refusal)).toBe("No. Not today.");
	expect(
		voicedLine({
			verdict: "deferred",
			says: "Not now. After I Leave a question for an inspector and wait up to two hours.",
			counterOffer: {
				label:
					"after I Leave a question for an inspector and wait up to two hours",
			},
		}),
	).toBe(
		"I cannot do that now. I have a question to leave for the inspector first.",
	);
	expect(
		voicedLine({
			verdict: "deferred",
			says: "Not now. After I Mend the fence · one hour.",
			counterOffer: { label: "after I Mend the fence · one hour" },
		}),
	).toBe("I cannot do that now. I need to mend the fence first.");
	expect(counterWords({ label: "Mend the fence (week 2)" })).toBe(
		"mend the fence instead",
	);
	expect(counterWords({ label: "later" })).toBe("do it later");
	expect(counterWords(undefined)).toBe("do it later");
	expect(
		voicedLine({
			verdict: "deferred",
			says: "Not now. Later.",
			counterOffer: { label: "later" },
		}),
	).toBe("Not now. Later.");
});

it("refusals say why only from the reason HF recorded", () => {
	expect(refusalWhy({ verdict: "refused", reason: "need:water" })).toBe(
		"This person refused because a drink comes first.",
	);
	expect(refusalWhy({ verdict: "refused", reason: "distrust" })).toMatch(
		/trust your promises/,
	);
	expect(refusalWhy({ verdict: "refused", reason: "norm:theft" })).toMatch(
		/refused on principle/,
	);
	expect(refusalWhy({ verdict: "refused", reason: "mystery" })).toBeUndefined();
	expect(
		refusalWhy({ verdict: "deferred", reason: "need:food" }),
	).toBeUndefined();
});

it("uses complete grammar for every current cast member's paid work", () => {
	const expected = [
		[
			"Make and repair workshop fittings",
			"making and repairing workshop fittings",
		],
		["Work the agreed relief shift", "working the agreed relief shift"],
		[
			"Help the kitchen within your training",
			"helping in the kitchen within the agreed training limits",
		],
		[
			"Move the supplies agreed for this visit",
			"moving the supplies agreed for this visit",
		],
		[
			"Practise repairs with workshop supervision",
			"practising repairs with workshop supervision",
		],
		["Run the supply route", "delivering supplies along the route"],
	];
	for (const [label, gerund] of expected) {
		if (!label || !gerund) throw Error("Missing work phrase");
		expect(ingWords(label)).toBe(gerund);
		expect(jobLine("Nora", label, false)).toBe(`Nora finished ${gerund}.`);
		const line = voicedLine({
			verdict: "deferred",
			says: `Not now. After I ${label}.`,
			counterOffer: { label: `after I ${label}` },
		});
		expect(line).not.toContain("your training");
		expect(line).toMatch(/^I cannot do that now\. I /);
	}
});

it("words every admitted prayer action and tea break without a broken gerund", () => {
	for (const action of ["pray", "pray-home", "pray-qada", "pray-eid", "tea"]) {
		const label =
			action === "tea"
				? "Take a tea break"
				: "Keep the prayer appointment they received";
		expect(ingWords(label)).toBe(
			action === "tea"
				? "taking a tea break"
				: "keeping the prayer appointment",
		);
		expect(jobLine("Derya", label, false)).not.toMatch(/finished (keep|take) /);
	}
});

it("reads punctuated task labels without broken verbs or doubled full stops", () => {
	for (const ending of ["", ".", "..", ".  "]) {
		const label = `Make and repair workshop fittings${ending}`;
		expect(ingWords(label)).toBe("making and repairing workshop fittings");
		expect(jobLine("Nora", label, false)).toBe(
			"Nora finished making and repairing workshop fittings.",
		);
	}
	expect(ingWords("Mend the fence.")).toBe("doing the task “Mend the fence”");
	expect(counterWords({ label: "after I Mend the fence." })).toBe(
		"do it after finishing the task “Mend the fence”",
	);
	expect(refusalWhy({ verdict: "refused", reason: "need:water" }, "Nora")).toBe(
		"Nora refused because a drink comes first.",
	);
});

it("names the actual task inside a published plain deferral", () => {
	expect(
		counterWords({
			label: "after I finish this task (Repair the flood-damaged hall)",
		}),
	).toBe("do it after working on the hall repairs");
});
