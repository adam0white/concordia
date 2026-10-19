/**
 * SCOPE: the player's vague read of a resident, worded from HF state. `moodRead` words what a look at someone
 * shows: their strongest current emotion (or their mood when no emotion stands out), visible tiredness or pain,
 * needs HF reads as at least noticeable, and a pending commitment (not worship) that falls due within three
 * hours. `speechRead` adds, when the player is about to speak to them, what they are set on (their current
 * activity, or the offer HF would pick with no voice pushing) and how they stand toward the player's voice
 * (trust, recent pressure, a recent broken pledge, work done under protest). Both are presentation only: they
 * never change HF state, consume no RNG and never show a verdict, a likelihood or an answer line. Not covered:
 * what other residents think of the person, or anything the player has not had a chance to see.
 */
import {
	type Affordance,
	outwardSigns,
	predict,
	readAffect,
	readPerson,
	type Suggestion,
} from "@adam0white/human-framework";
import type { Resident, Save } from "./state.ts";
import { ingWords } from "./voicing.ts";

const PLAYER_VOICE = "player";
/** A commitment is "coming up" this many minutes before its window opens. */
const AHEAD = 180;

const EMOTION_WORDS: Record<string, string> = {
	joy: "cheerful",
	distress: "upset",
	hope: "hopeful",
	fear: "afraid",
	relief: "relieved",
	disappointment: "disappointed",
	pride: "proud",
	shame: "ashamed",
	gratitude: "grateful",
	anger: "angry",
	guilt: "guilty",
	love: "warm",
	grief: "grieving",
	awe: "full of wonder",
	boredom: "bored",
	loneliness: "lonely",
};
const NEED_WORDS: Record<string, string> = {
	food: "hungry",
	water: "thirsty",
	sleep: "sleepy",
	rest: "worn out",
	relief: "uncomfortable",
	safety: "uneasy",
	belonging: "lonely",
	esteem: "low in themselves",
	autonomy: "hemmed in",
	competence: "unsure of themselves",
	leisure: "restless",
	meaning: "adrift",
};

function lowerFirst(text: string): string {
	return text.charAt(0).toLowerCase() + text.slice(1);
}
function upperFirst(text: string): string {
	return text.charAt(0).toUpperCase() + text.slice(1);
}
function graded(level: number, word: string, at: [number, number, number]) {
	return level >= at[2]
		? `very ${word}`
		: level >= at[1]
			? word
			: level >= at[0]
				? `a little ${word}`
				: undefined;
}
function moodWord(valence: number): string {
	return valence >= 0.3
		? "in good spirits"
		: valence >= 0.1
			? "content"
			: valence > -0.1
				? "even-tempered"
				: valence > -0.3
					? "out of sorts"
					: "low";
}

/** What a look at this person shows now, as one or two short sentences. */
export function moodRead(s: Save, r: Resident): string {
	const p = r.person;
	if (!p.body.alive) return "Gone.";
	if (p.body.asleep) return "Asleep.";
	const signs = outwardSigns(p);
	const affect = readAffect(p);
	const top = affect.dominant.find((e) => e.intensity >= 0.15);
	const feeling = top
		? `${top.intensity >= 0.5 ? "very " : ""}${EMOTION_WORDS[top.id] ?? top.id}${top.targetId === PLAYER_VOICE && top.id === "anger" ? " with you" : ""}`
		: moodWord(signs.mood ?? affect.valence);
	const body = [
		graded(signs.fatigue, "tired", [0.3, 0.5, 0.75]),
		signs.pain >= 0.3 ? "in pain" : undefined,
		signs.fear >= 0.3 && top?.id !== "fear" ? "frightened" : undefined,
		...readPerson(p)
			.needs.filter((n) => n.urgency >= 0.25)
			.toSorted((a, b) => b.urgency - a.urgency || a.id.localeCompare(b.id))
			.slice(0, 2)
			.map((n) =>
				graded(n.urgency, NEED_WORDS[n.id] ?? n.id, [0.25, 0.5, 0.75]),
			),
	].filter((x): x is string => !!x);
	const first = `${upperFirst([feeling, ...body].join(", "))}.`;
	const due = p.agenda.commitments
		.filter(
			(c) =>
				c.status === "pending" &&
				c.kind !== "worship" &&
				c.kind !== "abstain" &&
				c.label &&
				c.from <= s.now + AHEAD &&
				c.until >= s.now,
		)
		.toSorted((a, b) => a.from - b.from || a.id.localeCompare(b.id))[0];
	if (!due?.label) return first;
	const what = lowerFirst(due.label.replace(/\.$/, ""));
	const lead =
		due.kind === "promise"
			? "Promised to"
			: due.kind === "appointment"
				? "Expected to"
				: due.kind === "job"
					? "Due at work to"
					: "Has to";
	return `${first} ${lead} ${what}.`;
}

/**
 * Before speaking: what they are set on and how they stand toward your voice. `offers` are their actual legal
 * offers; the preference is HF's own choice with no suggestion pushing (strength 0), worded, never its verdict.
 */
export function speechRead(
	s: Save,
	r: Resident,
	offers: readonly Affordance[],
	others: readonly Suggestion[],
): string[] {
	const p = r.person;
	const out: string[] = [];
	if (r.job) out.push(`Set on ${ingWords(r.job.offer.label)}`);
	else if (offers[0]) {
		const own = predict(
			p,
			offers,
			{
				voiceId: PLAYER_VOICE,
				affordanceId: offers[0].id,
				strength: 0,
				since: s.now,
			},
			{ scarcity: Math.max(0, 1 - r.wealth / 8), others },
		);
		const pick =
			offers.find((o) => o.id === own.insteadAffordanceId) ??
			(own.verdict === "assented" ? offers[0] : undefined);
		if (pick)
			out.push(`Leaning towards ${ingWords(pick.label ?? pick.action)}`);
	}
	if (p.activity?.protest) out.push("Doing it under protest");
	const voice = p.will.voices.find((v) => v.voiceId === PLAYER_VOICE);
	if (!voice) out.push("Does not know you well");
	else {
		const recent = voice.history.filter((h) => s.now - h.at <= 2 * 1440);
		if (voice.pressure >= 0.3) out.push("Bristling at being pushed");
		// "pledge-*" reasons are version 1 saves; HF 2.8.0 noteVoicePromise records "promise-*".
		if (
			recent.some(
				(h) =>
					(h.reason === "pledge-broken" || h.reason === "promise-broken") &&
					h.delta < 0,
			)
		)
			out.push("Still sore about a promise you broke");
		else if (
			recent.some(
				(h) =>
					(h.reason === "pledge-kept" || h.reason === "promise-kept") &&
					h.delta > 0,
			)
		)
			out.push("Remembers you kept your word");
		else if (
			recent.some(
				(h) =>
					h.delta < 0 &&
					["pushed", "worn", "harm-under-protest", "went-badly"].includes(
						h.reason,
					),
			)
		)
			out.push("Cooler towards you than before");
		out.push(
			voice.trust >= 0.75
				? "Trusts your word"
				: voice.trust >= 0.5
					? "Willing to hear you out"
					: voice.trust >= 0.3
						? "Cautious with you"
						: "Wary of you",
		);
	}
	return out;
}
