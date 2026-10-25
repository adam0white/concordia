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
	esteem: "unconfident",
	autonomy: "restricted",
	competence: "unsure of themselves",
	leisure: "restless",
	meaning: "unsure of their purpose",
};

function lowerFirst(text: string): string {
	return text.charAt(0).toLowerCase() + text.slice(1);
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
		? "happy"
		: valence >= 0.1
			? "content"
			: valence > -0.1
				? "calm"
				: valence > -0.3
					? "unhappy"
					: "sad";
}

/** What a look at this person shows now, as one or two short sentences. */
export function moodRead(s: Save, r: Resident): string {
	const p = r.person;
	if (!p.body.alive) return "They have died.";
	if (p.body.asleep) return "They are asleep.";
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
	const first = `They seem ${[feeling, ...body].join(", ")}.`;
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
			? "They promised to"
			: due.kind === "appointment"
				? "They are expected to"
				: due.kind === "job"
					? "They are due at work to"
					: "They have to";
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
	if (r.job)
		out.push(`They intend to continue ${ingWords(r.job.offer.label)}.`);
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
			out.push(`They seem to prefer ${ingWords(pick.label ?? pick.action)}.`);
	}
	if (p.activity?.protest) out.push("They are doing this under protest.");
	const voice = p.will.voices.find((v) => v.voiceId === PLAYER_VOICE);
	if (!voice) out.push("They do not know you well.");
	else {
		const recent = voice.history.filter((h) => s.now - h.at <= 2 * 1440);
		if (voice.pressure >= 0.3)
			out.push("They are annoyed because you pressured them.");
		// "pledge-*" reasons are version 1 saves; HF 2.8.0 noteVoicePromise records "promise-*".
		if (
			recent.some(
				(h) =>
					(h.reason === "pledge-broken" || h.reason === "promise-broken") &&
					h.delta < 0,
			)
		)
			out.push("They are still upset about a promise you broke.");
		else if (
			recent.some(
				(h) =>
					(h.reason === "pledge-kept" || h.reason === "promise-kept") &&
					h.delta > 0,
			)
		)
			out.push("They remember that you kept your promise.");
		else if (
			recent.some(
				(h) =>
					h.delta < 0 &&
					["pushed", "worn", "harm-under-protest", "went-badly"].includes(
						h.reason,
					),
			)
		)
			out.push("They are less friendly towards you than before.");
		out.push(
			voice.trust >= 0.75
				? "They trust your promises."
				: voice.trust >= 0.5
					? "They are willing to listen to you."
					: voice.trust >= 0.3
						? "They are cautious with you."
						: "They are wary of you.",
		);
	}
	return out;
}
