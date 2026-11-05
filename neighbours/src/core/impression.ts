import type { Affordance, Suggestion } from "./host-types.ts";
/** SCOPE: presentation of actual public HF4 condition/need readings and known commitments.
 * Speech reads describe current work and actual voice history, never an invented predicted answer.
 */
import type { Resident, Save } from "./state.ts";
import { ingWords } from "./voicing.ts";

const PLAYER_VOICE = "player";
/** A commitment is "coming up" this many minutes before its window opens. */
const AHEAD = 180;

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
	competence: "uncertain about personal ability",
	leisure: "restless",
	meaning: "uncertain about purpose",
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
	const p = r.owner.actor(r.id);
	if (!p.body.alive) return `${p.name} has died.`;
	if (p.body.asleep) return `${p.name} is asleep.`;
	const parts = r.owner.inspect(r.id, ["condition", "needs"]).people[0];
	if (parts?.kind !== "host") throw Error("Missing condition reading");
	const condition = parts.parts.find((part) => part.select === "condition");
	const needPart = parts.parts.find((part) => part.select === "needs");
	if (condition?.select !== "condition" || needPart?.select !== "needs")
		throw Error("Missing public readings");
	const signs = condition.value.outwardSigns;
	const feeling = moodWord(signs.mood ?? 0);
	const body = [
		graded(signs.fatigue, "tired", [0.3, 0.5, 0.75]),
		signs.pain >= 0.3 ? "in pain" : undefined,
		signs.fear >= 0.3 ? "frightened" : undefined,
		...needPart.value
			.filter((n) => n.urgency >= 0.25)
			.toSorted((a, b) => b.urgency - a.urgency || a.id.localeCompare(b.id))
			.slice(0, 2)
			.map((n) =>
				graded(n.urgency, NEED_WORDS[n.id] ?? n.id, [0.25, 0.5, 0.75]),
			),
	].filter((x): x is string => !!x);
	const first = `${p.name} seems ${[feeling, ...body].join(", ")}.`;
	const due = p.agenda.commitments
		.filter(
			(c) =>
				c.status === "pending" &&
				c.kind !== "worship" &&
				c.kind !== "abstain" &&
				c.label &&
				c.from <= (s.now + AHEAD) * 60000 &&
				c.until >= s.now * 60000,
		)
		.toSorted((a, b) => a.from - b.from || a.id.localeCompare(b.id))[0];
	if (!due?.label) return first;
	const what = lowerFirst(due.label.replace(/\.$/, ""));
	const lead =
		due.kind === "promise"
			? `${p.name} promised to`
			: due.kind === "appointment"
				? `${p.name} is expected to`
				: due.kind === "job"
					? `${p.name} is due at work to`
					: `${p.name} has to`;
	return `${first} ${lead} ${what}.`;
}

/**
 * Before speaking: what they are set on and how they stand toward your voice. `offers` are their actual legal
 * offers; the preference is HF's own choice with no suggestion pushing (strength 0), worded, never its verdict.
 */
export function speechRead(
	s: Save,
	r: Resident,
	_offers: readonly Affordance[],
	_others: readonly Suggestion[],
): string[] {
	const p = r.owner.actor(r.id);
	const out: string[] = [];
	if (r.job)
		out.push(`${p.name} plans to keep ${ingWords(r.job.offer.label)}.`);
	if (p.activity?.protest) out.push(`${p.name} is doing this under protest.`);
	const voice = p.will.voices.find((v) => v.voiceId === PLAYER_VOICE);
	if (!voice) out.push(`${p.name} does not know you well.`);
	else {
		const recent = voice.history.filter(
			(h) => s.now * 60000 - h.at <= 2 * 1440 * 60000,
		);
		if (voice.pressure >= 0.3)
			out.push(`${p.name} is annoyed by your pressure.`);
		// "pledge-*" reasons are version 1 saves; HF 2.8.0 noteVoicePromise records "promise-*".
		if (
			recent.some(
				(h) =>
					(h.reason === "pledge-broken" || h.reason === "promise-broken") &&
					h.delta < 0,
			)
		)
			out.push(`${p.name} is still upset about a promise you broke.`);
		else if (
			recent.some(
				(h) =>
					(h.reason === "pledge-kept" || h.reason === "promise-kept") &&
					h.delta > 0,
			)
		)
			out.push(`${p.name} remembers that you kept your promise.`);
		else if (
			recent.some(
				(h) =>
					h.delta < 0 &&
					["pushed", "worn", "harm-under-protest", "went-badly"].includes(
						h.reason,
					),
			)
		)
			out.push(`${p.name} is less friendly towards you than before.`);
		out.push(
			voice.trust >= 0.75
				? `${p.name} trusts your promises.`
				: voice.trust >= 0.5
					? `${p.name} is willing to listen to you.`
					: voice.trust >= 0.3
						? `${p.name} is cautious with you.`
						: `${p.name} is wary of you.`,
		);
	}
	return out;
}
