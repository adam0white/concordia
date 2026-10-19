import { expect, it } from "vitest";
import { createRuntime } from "../src/core/index.ts";
import { buildOffers } from "../src/core/offers.ts";
import type { Runtime } from "../src/core/runtime.ts";
import {
	actionWords,
	counterWords,
	offerKind,
	PHRASES,
	phraseFor,
	refusalWhy,
	voicedLine,
} from "../src/core/voicing.ts";

/** Labels that a short run does not reach: floor rest, the annex, later evenings and the handcart. */
const FIXTURES: [string, string][] = [
	["rest-here", "Rest on the floor here"],
	["sleep-here", "Sleep on the floor here"],
	["eat", "Eat a meal at the market"],
	["gather", "Share a meal in the reopened hall"],
	["teach", "Teach the displaced evening class"],
	["annex-visit", "Visit the hall annex to inspect its timber"],
	["annex-ask-inspector", "Ask an experienced inspector"],
	["annex-open-section", "Open this section"],
	["annex-keep-closed", "Keep this section closed"],
	["post-structural-question", "Leave a note requesting a structural opinion"],
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
	const r = createRuntime(42, 208) as Runtime;
	const seen = new Map<string, string>(FIXTURES);
	for (let round = 0; round < 192; round++) {
		r.step();
		for (const resident of r.s.people) {
			const job = resident.job;
			resident.job = undefined;
			try {
				for (const o of buildOffers(r.s, resident.person.id))
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
		expect(deferred.startsWith("Not now — ")).toBe(true);
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
	).toBe("Not now — I’ve a question to leave for the inspector first.");
	expect(
		voicedLine({
			verdict: "deferred",
			says: "Not now. After I Mend the fence · one hour.",
			counterOffer: { label: "after I Mend the fence · one hour" },
		}),
	).toBe("Not now — I need to mend the fence first.");
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
		"Why: they need a drink first.",
	);
	expect(refusalWhy({ verdict: "refused", reason: "distrust" })).toMatch(
		/trust your word/,
	);
	expect(refusalWhy({ verdict: "refused", reason: "norm:theft" })).toMatch(
		/something they hold to/,
	);
	expect(refusalWhy({ verdict: "refused", reason: "mystery" })).toBeUndefined();
	expect(
		refusalWhy({ verdict: "deferred", reason: "need:food" }),
	).toBeUndefined();
});
