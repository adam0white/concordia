/**
 * SCOPE: presentation only. HF composes a resident's spoken answer from affordance labels, which are written
 * as menu items ("Leave a question for an inspector and wait up to two hours"), so a deferral reads
 * "Not now. After I Leave a question …". This module rewords the action named in an answer or counter-offer
 * into first-person speech, keyed by the offer kind recognised from its label. It never changes a verdict,
 * a reason, the recorded `says` or which action is meant; unknown labels fall back to the lowercased label
 * with menu details (" · Day 3 at 18:00", "(week 2)") removed. Covers every offer this town builds; does not
 * cover HF's own refusal lines, which name duties rather than offers.
 */

type Phrase = {
	/** Offer kind: the affordance id with any `annex-` prefix and `:target` suffix removed. */
	kind: string;
	match: RegExp;
	/** First-person reason to wait: "Not now — ___." */
	first: (m: RegExpMatchArray) => string;
	/** Verb phrase without a subject: "I'd rather ___", "offered to ___ instead". */
	act: (m: RegExpMatchArray) => string;
	/** Gerund without a subject: "do it after ___". */
	ing: (m: RegExpMatchArray) => string;
};

const g = (m: RegExpMatchArray, i = 1) => tidy(m[i] ?? "");
const fixed = (first: string, act: string, ing: string) => ({
	first: () => first,
	act: () => act,
	ing: () => ing,
});

/** Ordered: more specific labels first. */
export const PHRASES: readonly Phrase[] = [
	{
		kind: "rest-here",
		match: /^Rest on the floor here/,
		...fixed(
			"I need to rest a while first",
			"rest here a while",
			"resting a while",
		),
	},
	{
		kind: "rest",
		match: /^Rest at home/,
		...fixed("I need a rest at home first", "rest at home", "resting at home"),
	},
	{
		kind: "sleep-here",
		match: /^Sleep on the floor here/,
		...fixed("I need to sleep first", "get some sleep here", "sleeping"),
	},
	{
		kind: "sleep",
		match: /^Sleep at home/,
		...fixed("I need to sleep first", "sleep at home", "sleeping"),
	},
	{
		kind: "drink",
		match: /^Drink water/,
		...fixed(
			"I need a drink of water first",
			"get a drink of water",
			"having a drink of water",
		),
	},
	{
		kind: "eat",
		match: /^Eat a meal/,
		...fixed("I need to eat first", "eat at the market", "eating"),
	},
	{
		kind: "grow",
		match: /^Tend and harvest the garden/,
		...fixed(
			"the garden needs me first",
			"tend the garden",
			"tending the garden",
		),
	},
	{
		kind: "supply",
		match: /^Carry food from the quay/,
		...fixed(
			"I’ve food to carry up from the quay first",
			"carry food up from the quay",
			"carrying food up from the quay",
		),
	},
	{
		kind: "talk",
		match: /^Visit neighbours at the hall/,
		...fixed(
			"I’m going to see the neighbours at the hall first",
			"visit the neighbours at the hall",
			"visiting the neighbours at the hall",
		),
	},
	{
		kind: "learn",
		match: /^Attend a practical class/,
		...fixed(
			"I’ve a class at the school first",
			"go to the class at the school",
			"the class at the school",
		),
	},
	{
		kind: "teach",
		match: /^Teach the displaced evening class/,
		...fixed(
			"I’ve the evening class to teach first",
			"teach the evening class",
			"teaching the evening class",
		),
	},
	{
		kind: "care",
		match: /^Help neighbours at the clinic/,
		...fixed(
			"I’m needed at the clinic first",
			"help out at the clinic",
			"helping out at the clinic",
		),
	},
	{
		kind: "work",
		match: /^(Work|Help with) a paid .*shift/,
		...fixed(
			"I’ve a paid shift to work first",
			"work a paid shift",
			"working a paid shift",
		),
	},
	{
		kind: "repair",
		match: /^Repair the flood-damaged hall/,
		...fixed(
			"I’ve repairs to do on the hall first",
			"work on the hall repairs",
			"working on the hall repairs",
		),
	},
	{
		kind: "gather",
		match: /^Share a meal in the reopened hall/,
		...fixed(
			"I’m eating with everyone at the hall first",
			"share a meal at the hall",
			"sharing a meal at the hall",
		),
	},
	{
		kind: "inspect",
		match: /^(Go and inspect the hall timber|Visit the hall annex)/,
		...fixed(
			"I want a look at the timber first",
			"look over the timber",
			"looking over the timber",
		),
	},
	{
		kind: "ask-inspector",
		match: /^(Leave a question for an inspector|Ask an experienced inspector)/,
		...fixed(
			"I’ve a question to leave for the inspector first",
			"leave the inspector a question",
			"leaving a question for the inspector",
		),
	},
	{
		kind: "post-structural-question",
		match: /^Leave a note requesting a structural opinion/,
		...fixed(
			"I’ve a note to leave asking for a structural opinion first",
			"leave a note asking for a structural opinion",
			"leaving a note asking for a structural opinion",
		),
	},
	{
		kind: "wait-inspector",
		match: /^Wait for (.+?) beside the hall noticeboard/,
		first: (m) => `I’m waiting for ${g(m)} by the noticeboard first`,
		act: (m) => `wait for ${g(m)} by the noticeboard`,
		ing: (m) => `waiting for ${g(m)} by the noticeboard`,
	},
	{
		kind: "answer-inspection",
		match: /^Go over the timber checks with (.+)/,
		first: (m) => `I’ve the timber checks to go over with ${g(m)} first`,
		act: (m) => `go over the timber checks with ${g(m)}`,
		ing: (m) => `going over the timber checks with ${g(m)}`,
	},
	{
		kind: "open-section",
		match: /^Open this section/,
		...fixed(
			"I mean to open this section first",
			"open this section",
			"opening this section",
		),
	},
	{
		kind: "keep-closed",
		match: /^Keep this section closed/,
		...fixed(
			"I’m keeping this section closed for now",
			"keep this section closed",
			"keeping this section closed",
		),
	},
	{
		kind: "propose",
		match: /^Invite neighbours and promise to host (.+)/,
		first: (m) => `I’ve neighbours to invite to ${g(m)} first`,
		act: (m) => `invite neighbours to ${g(m)}`,
		ing: (m) => `inviting neighbours to ${g(m)}`,
	},
	{
		kind: "accept",
		match: /^Accept (.+)/,
		first: (m) => `I want to say yes to ${g(m)} first`,
		act: (m) => `say yes to ${g(m)}`,
		ing: (m) => `saying yes to ${g(m)}`,
	},
	{
		kind: "decline",
		match: /^Decline (.+)/,
		first: (m) => `I need to send word I can’t come to ${g(m)} first`,
		act: (m) => `turn down ${g(m)}`,
		ing: (m) => `turning down ${g(m)}`,
	},
	{
		kind: "prepare",
		match: /^Prepare the hall for (.+)/,
		first: (m) => `I’ve the hall to get ready for ${g(m)} first`,
		act: (m) => `get the hall ready for ${g(m)}`,
		ing: (m) => `getting the hall ready for ${g(m)}`,
	},
	{
		kind: "host",
		match: /^Host (.+?)( at the hall)?$/,
		first: (m) => `I’m hosting ${g(m)} first`,
		act: (m) => `host ${g(m)}`,
		ing: (m) => `hosting ${g(m)}`,
	},
	{
		kind: "attend",
		match: /^Go to (.+)/,
		first: (m) => `I’m going to ${g(m)} first`,
		act: (m) => `go to ${g(m)}`,
		ing: (m) => `going to ${g(m)}`,
	},
	{
		kind: "cart-ask",
		match: /^Ask (\S+) for tomorrow’s .*bench/,
		first: (m) => `I need to ask ${g(m)} about the main bench first`,
		act: (m) => `ask ${g(m)} about the main bench`,
		ing: (m) => `asking ${g(m)} about the main bench`,
	},
	{
		kind: "cart-fast",
		match: /^Restore one cart section on (\S+) main bench/,
		first: (m) => `I’ve a cart section to restore on ${g(m)} bench first`,
		act: (m) => `restore a cart section on ${g(m)} bench`,
		ing: (m) => `restoring a cart section on ${g(m)} bench`,
	},
	{
		kind: "cart-slow",
		match: /^Restore one cart section on the side bench/,
		...fixed(
			"I’ve a cart section to restore first",
			"restore a cart section on the side bench",
			"restoring a cart section on the side bench",
		),
	},
	{
		kind: "cart-handover",
		match: /^Return the restored handcart to (.+)/,
		first: (m) => `I’ve the handcart to take back to ${g(m)} first`,
		act: (m) => `take the handcart back to ${g(m)}`,
		ing: (m) => `taking the handcart back to ${g(m)}`,
	},
];

/** The offer kind of an affordance id, e.g. `accept:evening-0-meal` → `accept`. */
export function offerKind(id: string): string {
	return id.replace(/^annex-/, "").replace(/:.*$/, "");
}

/** Strip menu details: " · one hour", " · Day 3 at 18:00", " (week 2)", a trailing full stop. */
function tidy(text: string): string {
	return text
		.replace(/\s*·.*$/, "")
		.replace(/\s*\([^)]*\)/g, "")
		.replace(/\.$/, "")
		.trim();
}
function lowerFirst(text: string): string {
	return text.charAt(0).toLowerCase() + text.slice(1);
}
function upperFirst(text: string): string {
	return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The phrase for a label, or undefined when no offer kind matches. */
export function phraseFor(
	label: string,
): { phrase: Phrase; m: RegExpMatchArray } | undefined {
	const clean = label.trim();
	for (const phrase of PHRASES) {
		const m = clean.match(phrase.match);
		if (m) return { phrase, m };
	}
	return undefined;
}

/** A verb phrase for an action label: "leave the inspector a question". */
export function actionWords(label: string): string {
	const hit = phraseFor(label);
	return hit ? hit.phrase.act(hit.m) : lowerFirst(tidy(label));
}

type CounterLike = { label: string } | undefined;
type AnswerLike = {
	verdict: string;
	says: string;
	counterOffer?: CounterLike;
};

/** What "after I …" names, or undefined for a plain alternative. */
function afterAction(label: string): string | undefined {
	const m = label.match(/^after I (.+)$/i);
	return m?.[1];
}

/**
 * The counter-offer as a verb phrase after "offered to": "do it after leaving a question for the inspector"
 * or "look over the timber instead".
 */
export function counterWords(counter: CounterLike): string {
	if (!counter) return "do it later";
	const label = counter.label.trim();
	if (/^later$/i.test(label) || /^after my duty$/i.test(label))
		return "do it later";
	if (/^after I pray\b/i.test(label)) return "do it after praying";
	const after = afterAction(label);
	if (after !== undefined) {
		const hit = phraseFor(after);
		return hit
			? `do it after ${hit.phrase.ing(hit.m)}`
			: `do it once they ${lowerFirst(tidy(after))}`;
	}
	return `${actionWords(label)} instead`;
}

/**
 * The resident's answer as speech. Deferrals and alternatives are reworded from the offer they name;
 * every other verdict keeps HF's own line. `says` itself is never changed.
 */
export function voicedLine(answer: AnswerLike): string {
	const counter = answer.counterOffer?.label?.trim();
	const notNowForm = !/, then I will\.?$/.test(answer.says);
	if (answer.verdict === "deferred" && counter) {
		if (/^later$/i.test(counter) || /^after my duty$/i.test(counter))
			return answer.says;
		if (/^after I pray\b/i.test(counter))
			return notNowForm
				? "Not now — after I pray."
				: "After I pray, then I will.";
		const after = afterAction(counter);
		if (after === undefined) return answer.says;
		const hit = phraseFor(after);
		const first = hit
			? hit.phrase.first(hit.m)
			: `I need to ${lowerFirst(tidy(after))} first`;
		return notNowForm
			? `Not now — ${first}.`
			: `${upperFirst(first)}, then I will.`;
	}
	if (answer.verdict === "modified" && counter) {
		const act = actionWords(counter);
		return answer.says.startsWith("Not that")
			? `Not that — I’d rather ${act}.`
			: `I’d rather ${act} instead.`;
	}
	return answer.says;
}
