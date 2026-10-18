/**
 * SCOPE: the visitor as a resident ("you"). The host owns the player's place, travel, two working hours a day,
 * pledges and the bounded record of what the player said and did. HF owns how residents hear and answer:
 * `predict` is a pure telegraph, `answerNow` books an immediate refusal, and any other verdict becomes a
 * standing suggestion resolved by `decide` at that person's next decision, brought forward with an HF
 * interrupt (an activity review, never a cancel). Pledge outcomes reach HF through `learnFromVoice`.
 * Only awake people at the player's place hear. There is no host speech credit, no synthetic reward for
 * asking, no inferred consent and no scripted cooperation. A save without `player` is byte-identical to a
 * town where the visitor never acted; the first player input creates this state and seeds the three
 * family/neighbour voices. Not covered: bringing named things, group speech, speech while travelling,
 * persuasion beyond HF's suggestion strength, or remembering what the player said beyond HF's own memory.
 */
import {
	type Affordance,
	adoptVoiceTrust,
	answerNow,
	type DecisionRecord,
	interrupt,
	learnFromVoice,
	perceive,
	predict,
	readPerson,
	resolutionsOf,
	type Suggestion,
	type SuggestionResolution,
	vetoFor,
} from "@adam0white/human-framework";
import type {
	Intervention,
	PlayerView,
	SpeechPrediction,
	TownEvent,
} from "../contracts.ts";
import { reviewOffers } from "./activity-reviews.ts";
import { presentAt } from "./encounters.ts";
import { allEvenings } from "./evenings.ts";
import { placeOf, required } from "./invariants.ts";
import { journalEntries } from "./journal.ts";
import { buildOffers, socialPreview, WORKPLACE } from "./offers.ts";
import type { PLAYER_EVENT_KINDS } from "./player-events.ts";
import type { Resident, Save } from "./state.ts";
import { validateEvent } from "./validation.ts";
import { actionWords, counterWords, voicedLine } from "./voicing.ts";

export const PLAYER_VOICE = "player";
export const PLAYER_HOME = "homes";
export const PLAYER_WORK_HOURS = 2;
/** Seeded once when the player first acts (engineering values; HF's default for an unknown voice is 0.5). */
export const PLAYER_VOICES: readonly [string, number][] = [
	["lea", 0.8],
	["sam", 0.6],
	["jo", 0.4],
];
export const SPEECH = {
	ask: { strength: 0.35 },
	urge: { strength: 0.7, insist: true },
	promise: { strength: 0.5 },
} as const;
/** How a kept or broken pledge felt to the person it was made to (engineering defaults). */
export const PLEDGE_FELT = { kept: 0.6, lapsed: -0.6 } as const;
const LIMITS = { requests: 24, pledges: 16, log: 160 } as const;
export type PlayerMode = keyof typeof SPEECH;
export type PlayerWork = "carry-meals" | "help-repair" | "cover-shift";
export const PLAYER_WORK: Record<
	PlayerWork,
	{ label: string; placeId?: string }
> = {
	"carry-meals": { label: "carry food up from the quay", placeId: "quay" },
	"help-repair": { label: "help repair the hall", placeId: "hall" },
	"cover-shift": { label: "cover their paid shift" },
};
type Answer = Pick<
	SuggestionResolution,
	| "voiceId"
	| "verdict"
	| "kind"
	| "reason"
	| "says"
	| "counterOffer"
	| "insteadAffordanceId"
	| "likelihood"
	| "insisted"
>;
export type PlayerRequest = {
	id: number;
	at: number;
	placeId: string;
	targetId: string;
	affordanceId: string;
	label: string;
	mode: PlayerMode;
	pledgeId?: string;
	/** The earlier request whose counter-offer this one took up. */
	accepts?: number;
	/** Held until the person's next own decision instead of an immediate review. */
	waits?: true;
	answer: Answer;
	answerEvent: number;
	status:
		| "refused"
		| "held"
		| "replaced"
		| "dropped"
		| "decided"
		| "continued"
		| "started"
		| "completed"
		| "failed"
		| "interrupted";
	decision?: {
		at: number;
		event: number;
		answer: Answer;
		chosenAffordanceId: string;
		chosenLabel: string;
	};
	startedEvent?: number;
	resultEvent?: number;
};
export type Pledge = {
	id: string;
	requestId: number;
	toId: string;
	work: PlayerWork;
	madeAt: number;
	dueBy: number;
	event: number;
	status: "open" | "kept" | "lapsed";
	dueNoticed?: boolean;
	resolvedEvent?: number;
	hfReported?: boolean;
};
export type PlayerJob = {
	kind: "travel" | "work";
	from: string;
	to: string;
	departedAt: number;
	arriveAt: number;
	endsAt: number;
	event: number;
	work?: PlayerWork;
	pledgeId?: string;
	forId?: string;
};
export type PlayerState = {
	version: 1;
	place: string;
	job?: PlayerJob;
	work: { day: number; starts: number };
	requests: PlayerRequest[];
	pledges: Pledge[];
	log: TownEvent[];
	notices: number;
	latestNotice?: { at: number; text: string; eventId: number };
	goals: { id: string; doneAt: number; eventIds: number[] }[];
};
export interface PlayerHost {
	s: Save;
	event(
		kind: string,
		text: string,
		actorId?: string,
		placeId?: string,
		causes?: number[],
	): number;
}

export function clock(at: number): string {
	const minute = ((at % 1440) + 1440) % 1440;
	return `Day ${Math.floor(at / 1440) + 1}, ${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}
function nameOf(s: Save, id: string): string {
	return s.people.find((r) => r.person.id === id)?.person.name ?? id;
}
function placeName(s: Save, id: string): string {
	return s.places.find((p) => p.id === id)?.name ?? id;
}
export function travelMinutes(s: Save, from: string, to: string): number {
	if (from === to) return 0;
	const a = placeOf(s, from),
		b = placeOf(s, to);
	return Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (s.bus ? 35 : 20)) * 15;
}
/** Where the player is now; undefined while travelling. */
export function playerLocation(s: Save): string | undefined {
	const p = s.player;
	if (!p) return PLAYER_HOME;
	if (p.job && s.now < p.job.arriveAt) return undefined;
	return p.job ? p.job.to : p.place;
}
export function hearers(s: Save): Resident[] {
	const at = playerLocation(s);
	if (!at) return [];
	return s.people.filter((r) => presentAt(r, at, s.now));
}
function playerEvent(
	host: PlayerHost,
	kind: (typeof PLAYER_EVENT_KINDS)[number],
	text: string,
	placeId: string | undefined,
	causes: number[] = [],
	targetId?: string,
): TownEvent {
	const id = host.event(kind, text, undefined, placeId, causes);
	const e = required(
		host.s.events.find((event) => event.id === id),
		"Player event missing",
	);
	e.source = "player";
	if (targetId) e.targetId = targetId;
	keep(host.s, e);
	return e;
}
function keep(s: Save, e: TownEvent): void {
	const p = required(s.player, "Player state missing");
	if (p.log.some((x) => x.id === e.id)) return;
	p.log.push(structuredClone(e));
	p.log.sort((a, b) => a.id - b.id);
	if (p.log.length > LIMITS.log) p.log.splice(0, p.log.length - LIMITS.log);
}
function keepById(s: Save, id: number): void {
	const e = s.events.find((event) => event.id === id);
	if (e) keep(s, e);
}
function notify(s: Save, text: string, eventId: number): void {
	const p = required(s.player, "Player state missing");
	p.notices++;
	p.latestNotice = { at: s.now, text, eventId };
}
function bound<T>(list: T[], limit: number): void {
	if (list.length > limit) list.splice(0, list.length - limit);
}

/** First player input: create the state, seed HF voices and record the return. */
function activate(host: PlayerHost): PlayerState {
	const s = host.s;
	if (s.player) return s.player;
	s.player = {
		version: 1,
		place: PLAYER_HOME,
		work: { day: Math.floor(s.now / 1440), starts: 0 },
		requests: [],
		pledges: [],
		log: [],
		notices: 0,
		goals: [],
	};
	for (const [id, trust] of PLAYER_VOICES) {
		const r = s.people.find((o) => o.person.id === id);
		if (r) adoptVoiceTrust(r.person, PLAYER_VOICE, trust, 1);
	}
	playerEvent(
		host,
		"player-returned",
		"You were back in Alder Quay after the flood, lodging with your cousin Lea’s family in the riverside homes.",
		PLAYER_HOME,
	);
	return s.player;
}

/** The person's actual legal offers now (their review set when busy), as `decide` would see them. */
export function speechOffers(s: Save, r: Resident): Affordance[] {
	const offers = r.job ? reviewOffers(s, r) : buildOffers(s, r.person.id);
	const readout = readPerson(r.person);
	return offers
		.filter(
			(offer) =>
				vetoFor(r.person, offer, {
					now: s.now,
					affordances: offers,
					...readout,
				})?.kind !== "cannot",
		)
		.map((offer) => socialPreview(s, r.person.id, offer));
}
/** The player's standing suggestion for this decision; one taken up "after" waits until they are free. */
export function heldSuggestion(s: Save, id: string): Suggestion | undefined {
	const q = s.player?.requests.find(
		(x) => x.targetId === id && x.status === "held",
	);
	if (!q) return undefined;
	if (q.waits && s.people.find((r) => r.person.id === id)?.job)
		return undefined;
	return {
		voiceId: PLAYER_VOICE,
		affordanceId: q.affordanceId,
		strength: SPEECH[q.mode].strength,
		...(q.mode === "urge" ? { insist: true } : {}),
		since: q.at,
	};
}
function suggestionFor(mode: PlayerMode, affordanceId: string, at: number) {
	return {
		voiceId: PLAYER_VOICE,
		affordanceId,
		strength: SPEECH[mode].strength,
		...(mode === "urge" ? { insist: true } : {}),
		since: at,
	} satisfies Suggestion;
}
function answerOf(r: SuggestionResolution): Answer {
	return JSON.parse(
		JSON.stringify({
			voiceId: r.voiceId,
			verdict: r.verdict,
			kind: r.kind,
			reason: r.reason,
			says: r.says,
			counterOffer: r.counterOffer,
			insteadAffordanceId: r.insteadAffordanceId,
			likelihood: r.likelihood,
			insisted: r.insisted,
		}),
	);
}
function hearable(s: Save, targetId: unknown): Resident {
	if (typeof targetId !== "string") throw Error("Choose someone to speak to");
	const r = s.people.find((o) => o.person.id === targetId);
	if (!r) throw Error("Unknown resident");
	const at = playerLocation(s);
	if (!at) throw Error("You are still on your way; nobody can hear you yet");
	if (!presentAt(r, at, s.now))
		throw Error(`${r.person.name} is not here and awake to hear you`);
	if (r.policy !== "hf")
		throw Error(`${r.person.name} is not controlled by HF in this town`);
	return r;
}

/** Pure telegraph: how this person would probably answer each mode for each legal offer. */
export function predictSpeech(
	s: Save,
	targetId: string,
	others: (r: Resident) => Suggestion[],
): SpeechPrediction {
	const r = hearable(s, targetId);
	const offers = speechOffers(s, r);
	const opts = {
		scarcity: Math.max(0, 1 - r.wealth / 8),
		others: others(r),
	};
	return {
		targetId,
		at: s.now,
		offers: offers
			.filter((offer) => offer.id !== r.job?.offer.id)
			.slice(0, 40)
			.map((offer) => ({
				affordanceId: offer.id,
				label: offer.label ?? offer.action,
				ask: answerOf(
					predict(
						r.person,
						offers,
						suggestionFor("ask", offer.id, s.now),
						opts,
					),
				),
				urge: answerOf(
					predict(
						r.person,
						offers,
						suggestionFor("urge", offer.id, s.now),
						opts,
					),
				),
				promise: answerOf(
					predict(
						r.person,
						offers,
						suggestionFor("promise", offer.id, s.now),
						opts,
					),
				),
			})),
	};
}

function dueByFor(now: number): number {
	const day = Math.floor(now / 1440);
	return now % 1440 <= 1020 ? day * 1440 + 1080 : (day + 1) * 1440 + 1080;
}
function workPlace(s: Save, work: PlayerWork, forId: string): string {
	if (work !== "cover-shift") return required(PLAYER_WORK[work].placeId, "");
	const r = required(
		s.people.find((o) => o.person.id === forId),
		"Unknown resident",
	);
	return required(WORKPLACE[r.role], "Unknown workplace role")[0];
}
function hoursUsed(p: PlayerState | undefined, day: number): number {
	return p?.work.day === day ? p.work.starts : 0;
}
function openOnDay(p: PlayerState | undefined, day: number): number {
	return (
		p?.pledges.filter(
			(x) => x.status === "open" && Math.floor(x.dueBy / 1440) === day,
		).length ?? 0
	);
}
function shiftsLeft(r: Resident, day: number): number {
	return 2 - (r.paidWork?.day === day ? r.paidWork.starts : 0);
}
function checkPledgeable(s: Save, work: unknown, toId: string): PlayerWork {
	if (
		typeof work !== "string" ||
		!Object.hasOwn(PLAYER_WORK, work) ||
		!["carry-meals", "help-repair", "cover-shift"].includes(work)
	)
		throw Error("Choose one hour of your own work to promise");
	const dueBy = dueByFor(s.now);
	const day = Math.floor(dueBy / 1440);
	if (hoursUsed(s.player, day) + openOnDay(s.player, day) >= PLAYER_WORK_HOURS)
		throw Error("Your working hours for that day are already promised or used");
	if (work === "help-repair" && s.hall >= 12)
		throw Error("The hall repairs are already complete");
	if (work === "cover-shift") {
		const r = required(
			s.people.find((o) => o.person.id === toId),
			"Unknown resident",
		);
		if (shiftsLeft(r, day) <= 0)
			throw Error(`${r.person.name} has no paid shift left to cover that day`);
	}
	return work as PlayerWork;
}

export function playerIntervene(
	host: PlayerHost,
	input: Intervention,
	others: (r: Resident) => Suggestion[],
): void {
	if (input.kind === "player-move") move(host, input.placeId);
	else if (input.kind === "player-speak") speak(host, input, others);
	else if (input.kind === "player-work")
		startWork(host, input.pledgeId, input.work, input.actorId);
	else throw Error("Unknown player action");
}

function move(host: PlayerHost, placeId: unknown): void {
	const s = host.s;
	if (typeof placeId !== "string" || !s.places.some((p) => p.id === placeId))
		throw Error("Choose a place in town");
	if (s.player?.job) throw Error("Finish what you are doing first");
	const from = s.player?.place ?? PLAYER_HOME;
	if (from === placeId) throw Error("You are already there");
	const p = activate(host);
	const minutes = travelMinutes(s, from, placeId);
	const e = playerEvent(
		host,
		"player-moved",
		`You set off from ${placeName(s, from)} for ${placeName(s, placeId)}, about ${minutes} minutes on foot.`,
		from,
	);
	p.job = {
		kind: "travel",
		from,
		to: placeId,
		departedAt: s.now,
		arriveAt: s.now + minutes,
		endsAt: s.now + minutes,
		event: e.id,
	};
}

function speak(
	host: PlayerHost,
	input: Intervention,
	others: (r: Resident) => Suggestion[],
): void {
	const s = host.s;
	const mode = input.mode;
	if (mode !== "ask" && mode !== "urge" && mode !== "promise")
		throw Error("Choose how to put it: ask, urge or promise");
	const r = hearable(s, input.actorId);
	const offers = speechOffers(s, r);
	// Asking for the current activity is not a request, except to accept a counter-offer to carry on with it.
	const offer = offers.find(
		(o) =>
			o.id === input.affordanceId &&
			(o.id !== r.job?.offer.id || input.acceptCounter === true),
	);
	if (!offer)
		throw Error(`That is not something ${r.person.name} can do right now`);
	const previous = s.player?.requests.findLast(
		(x) => x.targetId === r.person.id,
	);
	if (
		input.acceptCounter !== undefined &&
		(input.acceptCounter !== true ||
			mode !== "ask" ||
			previous?.answer.counterOffer?.affordanceId !== offer.id ||
			!["deferred", "modified"].includes(previous.answer.verdict))
	)
		throw Error(`There is no counter-offer from ${r.person.name} to accept`);
	const accepted = input.acceptCounter ? previous : undefined;
	const work =
		mode === "promise"
			? checkPledgeable(s, input.pledge?.work, r.person.id)
			: undefined;
	if (mode !== "promise" && input.pledge !== undefined)
		throw Error("Only a promise carries a pledge");
	const at = required(playerLocation(s), "Player location missing");
	const p = activate(host);
	const suggestion = suggestionFor(mode, offer.id, s.now);
	const { resolution } = answerNow(r.person, offers, suggestion, {
		scarcity: Math.max(0, 1 - r.wealth / 8),
		others: others(r),
	});
	const label = offer.label ?? offer.action;
	const verb = mode === "urge" ? "urged" : "asked";
	const request = playerEvent(
		host,
		"player-request",
		accepted?.answer.counterOffer
			? `You took up ${r.person.name}’s offer to ${counterWords(accepted.answer.counterOffer)}.`
			: mode === "promise" && work
				? `You promised ${r.person.name} you would ${work === "cover-shift" ? `cover one of ${r.person.name}’s paid shifts` : PLAYER_WORK[work].label} and asked them to ${label.toLowerCase()}.`
				: `You ${verb} ${r.person.name} to ${label.toLowerCase()}.`,
		at,
		[],
		r.person.id,
	);
	const answer = answerOf(resolution);
	// "After I …" (theirs now, or one taken up) waits for their next own decision instead of bringing it forward.
	const waits =
		answer.verdict === "deferred" ||
		(answer.verdict !== "refused" && accepted?.answer.verdict === "deferred");
	const answerEvent = playerEvent(
		host,
		"player-answer",
		`${r.person.name} answered: “${voicedLine(answer)}”`,
		at,
		[request.id],
		r.person.id,
	);
	for (const old of p.requests)
		if (old.targetId === r.person.id && old.status === "held")
			old.status = "replaced";
	const q: PlayerRequest = {
		id: request.id,
		at: s.now,
		placeId: at,
		targetId: r.person.id,
		affordanceId: offer.id,
		label,
		mode,
		answer,
		answerEvent: answerEvent.id,
		status: answer.verdict === "refused" ? "refused" : "held",
		...(accepted ? { accepts: accepted.id } : {}),
		...(waits ? { waits: true as const } : {}),
	};
	if (work && answer.verdict !== "refused") {
		const dueBy = dueByFor(s.now);
		const pledgeId = `pledge-${request.id}`;
		const made = playerEvent(
			host,
			"player-pledge",
			`Your promise to ${r.person.name} stood: one hour to ${work === "cover-shift" ? `cover a paid shift for ${r.person.name}` : PLAYER_WORK[work].label}, by ${clock(dueBy)}.`,
			at,
			[request.id, answerEvent.id],
			r.person.id,
		);
		p.pledges.push({
			id: pledgeId,
			requestId: request.id,
			toId: r.person.id,
			work,
			madeAt: s.now,
			dueBy,
			event: made.id,
			status: "open",
			...(dueBy - 120 <= s.now ? { dueNoticed: true } : {}),
		});
		bound(p.pledges, LIMITS.pledges);
		q.pledgeId = pledgeId;
		perceive(r.person, [
			{
				at: s.now,
				channel: "told",
				kind: "player-pledge",
				actorId: PLAYER_VOICE,
				targetId: r.person.id,
				placeId: at,
				salience: 0.7,
				summary: `They promised to give an hour of their own work by ${clock(dueBy)}.`,
				claims: [{ prop: `pledge:${pledgeId}`, value: true, confidence: 0.8 }],
			},
		]);
	}
	p.requests.push(q);
	bound(p.requests, LIMITS.requests);
	// A non-refusal means switching activity: HF resolves it at the next decision, brought forward now.
	if (q.status === "held" && !waits && r.job && r.person.activity)
		interrupt(r.person, s.now, "player-request");
	advanceGoals(s);
}

function startWork(
	host: PlayerHost,
	pledgeId: unknown,
	requested: unknown,
	actorId: unknown,
): void {
	const s = host.s;
	const p = s.player;
	if (p?.job) throw Error("Finish what you are doing first");
	const pledge =
		pledgeId === undefined
			? undefined
			: p?.pledges.find((x) => x.id === pledgeId && x.status === "open");
	if (pledgeId !== undefined && !pledge)
		throw Error("That promise is not open");
	const work = pledge?.work ?? requested;
	if (
		typeof work !== "string" ||
		!["carry-meals", "help-repair", "cover-shift"].includes(work)
	)
		throw Error("Choose one hour of work");
	const kind = work as PlayerWork;
	const forId = pledge?.toId ?? (typeof actorId === "string" ? actorId : "");
	if (kind === "cover-shift" && !s.people.some((r) => r.person.id === forId))
		throw Error("Choose whose shift to cover");
	const from = p?.place ?? PLAYER_HOME;
	const to = workPlace(s, kind, forId);
	const travel = travelMinutes(s, from, to);
	const day = Math.floor(s.now / 1440);
	const minute = s.now - day * 1440;
	const end = s.now + travel + 60;
	if (minute < 480 || end > day * 1440 + 1080)
		throw Error("Work hours are 08:00–18:00, including the walk there");
	if (hoursUsed(p, day) >= PLAYER_WORK_HOURS)
		throw Error("You have already worked two hours today");
	if (pledge && end > pledge.dueBy)
		throw Error("That hour would end after the promised time");
	if (
		kind === "help-repair" &&
		(s.hall + s.people.filter((r) => r.job?.offer.action === "repair").length >=
			12 ||
			s.tools <= 0)
	)
		throw Error("No repair is available: no free tools or nothing left to fix");
	const target = s.people.find((r) => r.person.id === forId);
	if (kind === "cover-shift") {
		if (!target || shiftsLeft(target, day) <= 0)
			throw Error(`${target?.person.name ?? "They"} has no shift left today`);
	}
	const state = activate(host);
	if (state.work.day !== day) state.work = { day, starts: 0 };
	state.work.starts++;
	if (kind === "cover-shift" && target) {
		const previous = target.paidWork;
		target.paidWork =
			previous?.day === day
				? previous
				: {
						day,
						starts: 0,
						minutes: 0,
						totalMinutes: previous?.totalMinutes ?? 0,
					};
		target.paidWork.starts++;
	}
	const e = playerEvent(
		host,
		"player-work-started",
		`You set off to ${kind === "cover-shift" ? `cover a paid shift for ${nameOf(s, forId)} at ${placeName(s, to)}` : `${PLAYER_WORK[kind].label} (${placeName(s, to)})`}, working until ${clock(end)}.`,
		from,
		pledge ? [pledge.event] : [],
		forId || undefined,
	);
	state.job = {
		kind: "work",
		from,
		to,
		departedAt: s.now,
		arriveAt: s.now + travel,
		endsAt: end,
		event: e.id,
		work: kind,
		...(pledge ? { pledgeId: pledge.id } : {}),
		...(forId ? { forId } : {}),
	};
}

function reportPledge(s: Save, pledge: Pledge, kept: boolean): void {
	const r = s.people.find((o) => o.person.id === pledge.toId);
	const q = s.player?.requests.find((x) => x.id === pledge.requestId);
	const accepted = [q?.decision?.answer, q?.answer].find(
		(a) => a?.verdict === "assented" || a?.verdict === "complied",
	);
	// learnFromVoice only learns from assented/complied/commanded resolutions; a deferred answer reports nothing.
	if (!r || !accepted || !r.person.body.alive) {
		pledge.hfReported = false;
		return;
	}
	learnFromVoice(
		r.person,
		{ ...accepted, voiceId: PLAYER_VOICE } as SuggestionResolution,
		kept ? PLEDGE_FELT.kept : PLEDGE_FELT.lapsed,
		{
			at: s.now,
			action: `pledge:${pledge.work}`,
			reason: kept ? "pledge-kept" : "pledge-broken",
		},
	);
	pledge.hfReported = true;
}

/** Round boundary: arrivals, finished work, falling-due and lapsed pledges, goals. */
export function playerRound(host: PlayerHost): void {
	const s = host.s;
	const p = s.player;
	if (!p) return;
	const job = p.job;
	if (job && job.kind === "travel" && job.arriveAt <= s.now) {
		p.place = job.to;
		delete p.job;
		arrived(host, job);
	} else if (job && job.kind === "work" && job.endsAt <= s.now) {
		p.place = job.to;
		delete p.job;
		finishWork(host, job);
	}
	for (const pledge of p.pledges.filter((x) => x.status === "open")) {
		if (s.now >= pledge.dueBy) {
			pledge.status = "lapsed";
			const e = playerEvent(
				host,
				"player-pledge-lapsed",
				`${clock(pledge.dueBy)} passed with no hour recorded for your promise to ${nameOf(s, pledge.toId)} (${pledge.work === "cover-shift" ? "covering a paid shift" : PLAYER_WORK[pledge.work].label}).`,
				undefined,
				[pledge.event],
				pledge.toId,
			);
			pledge.resolvedEvent = e.id;
			reportPledge(s, pledge, false);
			notify(s, e.text, e.id);
		} else if (!pledge.dueNoticed && s.now >= pledge.dueBy - 120) {
			pledge.dueNoticed = true;
			notify(
				s,
				`Your promise to ${nameOf(s, pledge.toId)} falls due at ${clock(pledge.dueBy)}.`,
				pledge.event,
			);
		}
	}
	for (const q of p.requests)
		if (
			q.status === "held" &&
			!s.people.find((r) => r.person.id === q.targetId)?.person.body.alive
		)
			q.status = "dropped";
	advanceGoals(s);
}
function arrived(host: PlayerHost, job: PlayerJob): void {
	const s = host.s;
	const here = hearers(s)
		.filter((r) => r.known)
		.map((r) => r.person.name);
	const seen =
		job.to === "hall"
			? s.hallSafe
				? " The hall was open."
				: ` ${s.hall} of 12 hall repairs were done; it was still closed.`
			: job.to === "market"
				? ` ${placeOf(s, "market").stock} meals were left at the market kitchen.`
				: "";
	playerEvent(
		host,
		"player-arrived",
		`You reached ${placeName(s, job.to)}.${seen}${here.length ? ` ${here.join(", ")} ${here.length === 1 ? "was" : "were"} there.` : ""}`,
		job.to,
		[job.event],
	);
}
function finishWork(host: PlayerHost, job: PlayerJob): void {
	const s = host.s;
	const kind = required(job.work, "Player work kind missing");
	let result: string;
	const causes = [job.event];
	if (kind === "carry-meals") {
		placeOf(s, "market").stock += 5;
		s.produced += 5;
		result = "You carried food up from the quay; 5 meals reached the market.";
	} else if (kind === "help-repair") {
		if (s.hall < 12) {
			s.hall += 1;
			result = `You helped repair the hall; ${s.hall} of 12 repairs were done.`;
			if (s.hall === 12)
				host.event(
					"hall-repaired",
					"Twelve repairs are complete. Timber inspection is still needed before reopening.",
					undefined,
					"hall",
					[job.event],
				);
		} else
			result = "The hall repairs were already complete; your hour added none.";
	} else {
		const target = required(
			s.people.find((r) => r.person.id === job.forId),
			"Covered resident missing",
		);
		const ledger = required(target.paidWork, "Covered shift ledger missing");
		ledger.minutes += 60;
		ledger.totalMinutes += 60;
		target.wealth += 2;
		result = `You covered a paid shift for ${target.person.name} at ${placeName(s, job.to)}; ${target.person.name} received the 2-coin wage.`;
	}
	const pledge = s.player?.pledges.find(
		(x) => x.id === job.pledgeId && x.status === "open",
	);
	const done = playerEvent(
		host,
		"player-work-done",
		pledge
			? `${result} That kept your promise to ${nameOf(s, pledge.toId)}.`
			: result,
		job.to,
		pledge ? [...causes, pledge.event] : causes,
		job.forId,
	);
	if (pledge) {
		pledge.status = "kept";
		pledge.resolvedEvent = done.id;
		reportPledge(s, pledge, true);
	}
}

/** Called after an HF decision: the standing suggestion is resolved here and dropped. */
export function playerDecided(
	host: PlayerHost,
	r: Resident,
	record: DecisionRecord | undefined,
	choices: readonly Affordance[],
): void {
	const s = host.s;
	const q = s.player?.requests.find(
		(x) => x.targetId === r.person.id && x.status === "held",
	);
	if (!q || (q.waits && r.job)) return;
	const resolution = record
		? resolutionsOf(record).find((x) => x.voiceId === PLAYER_VOICE)
		: undefined;
	if (!record || !resolution) {
		q.status = "dropped";
		return;
	}
	const chosen = record.chosenAffordanceId ?? "";
	const chosenLabel =
		choices.find((a) => a.id === chosen)?.label ??
		record.chosenAction ??
		chosen;
	const answer = answerOf(resolution);
	const followed = chosen === q.affordanceId;
	const e = playerEvent(
		host,
		"player-decided",
		followed
			? `${r.person.name} took up your request and chose to ${actionWords(chosenLabel)}.`
			: `${r.person.name} weighed your request and chose to ${actionWords(chosenLabel)} instead.`,
		r.job?.offer.placeId ?? r.place,
		[q.id, q.answerEvent],
		r.person.id,
	);
	q.status = "decided";
	q.decision = {
		at: s.now,
		event: e.id,
		answer,
		chosenAffordanceId: chosen,
		chosenLabel,
	};
	notify(s, e.text, e.id);
}
/** Called after apply: link the person's actual action to the decided request. */
export function playerApplied(s: Save, r: Resident, continued: boolean): void {
	const q = s.player?.requests.find(
		(x) =>
			x.targetId === r.person.id &&
			x.status === "decided" &&
			x.decision?.at === s.now,
	);
	if (!q || !r.job || q.decision?.chosenAffordanceId !== r.job.offer.id) return;
	if (continued) {
		q.status = "continued";
		return;
	}
	q.status = "started";
	q.startedEvent = r.job.event;
	keepById(s, r.job.event);
}
/** Called when a linked job completes or stops: the delivered result. */
export function playerJobEnded(
	s: Save,
	jobEvent: number,
	resultEvent: number,
	status: "completed" | "failed" | "interrupted",
): void {
	const q = s.player?.requests.find(
		(x) => x.status === "started" && x.startedEvent === jobEvent,
	);
	if (!q) return;
	q.status = status;
	q.resultEvent = resultEvent;
	keepById(s, resultEvent);
	const e = s.events.find((event) => event.id === resultEvent);
	if (e) notify(s, e.text, e.id);
}

export const PLAYER_GOALS = [
	{
		id: "arrive",
		title: "Find your feet",
		hint: "Choose a place to walk there. Travel takes time, and only people at the same place can hear you.",
	},
	{
		id: "answer",
		title: "Get an answer",
		hint: "Pick someone here and ask for one of the things they could actually do now. Their likely answer is shown first.",
	},
	{
		id: "objection",
		title: "Work through an objection",
		hint: "When someone says “not now” or offers something else, take their counter-offer or promise an hour of your own work, then ask again.",
	},
	{
		id: "pledge",
		title: "Keep your word",
		hint: "Do the hour of work you promised before its deadline.",
	},
	{
		id: "evening",
		title: "Help a hall evening happen",
		hint: "Lea’s class and Sam’s supper compete for the reopened hall. Get someone to act on your word for an evening, and see whether it goes ahead with guests.",
	},
] as const;
/** Each goal is checked only against recorded outcomes after the previous goal was reached. */
function goalEvidence(
	s: Save,
	id: string,
	since: number,
): number[] | undefined {
	const p = required(s.player, "Player state missing");
	const after = (e: TownEvent) => e.at >= since;
	if (id === "arrive") {
		const e = p.log.find((x) => x.kind === "player-arrived" && after(x));
		return e ? [e.id] : undefined;
	}
	if (id === "answer") {
		const e = p.log.find((x) => x.kind === "player-answer" && after(x));
		return e ? [e.id] : undefined;
	}
	if (id === "objection") {
		for (const a of p.requests)
			if (
				a.at >= since &&
				a.answer.counterOffer &&
				["deferred", "modified"].includes(a.answer.verdict)
			) {
				for (const b of p.requests) {
					if (b.targetId !== a.targetId || b.id <= a.id) continue;
					if (["assented", "complied"].includes(b.answer.verdict))
						return [a.answerEvent, b.answerEvent];
					if (b.decision && b.decision.chosenAffordanceId === b.affordanceId)
						return [a.answerEvent, b.decision.event];
				}
			}
		return undefined;
	}
	if (id === "pledge") {
		const pledge = p.pledges.find(
			(x) => x.status === "kept" && x.madeAt >= since,
		);
		return pledge?.resolvedEvent
			? [pledge.event, pledge.resolvedEvent]
			: undefined;
	}
	if (id === "evening") {
		for (const e of allEvenings(s)) {
			const result = e.result;
			if (!result || result.at < since) continue;
			const guests = Object.entries(e.replies).filter(
				([who, reply]) => who !== e.organiserId && reply.delivered,
			).length;
			if (!guests) continue;
			const q = p.requests.find(
				(x) =>
					x.startedEvent !== undefined &&
					x.decision?.chosenAffordanceId.endsWith(`:${e.id}`) &&
					x.decision.at <= result.at,
			);
			if (q?.startedEvent !== undefined)
				return [q.id, q.startedEvent, result.id];
		}
		return undefined;
	}
	return undefined;
}
export function advanceGoals(s: Save): void {
	const p = s.player;
	if (!p) return;
	for (const goal of PLAYER_GOALS) {
		if (p.goals.some((g) => g.id === goal.id)) continue;
		const since = p.goals.at(-1)?.doneAt ?? 480;
		const evidence = goalEvidence(s, goal.id, since);
		if (!evidence) return;
		p.goals.push({ id: goal.id, doneAt: s.now, eventIds: evidence });
	}
}

export function playerView(s: Save): PlayerView {
	const p = s.player;
	const at = playerLocation(s);
	const day = Math.floor(s.now / 1440);
	const present = hearers(s).sort(
		(a, b) =>
			Number(b.known) - Number(a.known) ||
			a.person.name.localeCompare(b.person.name),
	);
	const from = p?.place ?? PLAYER_HOME;
	const minute = s.now - day * 1440;
	const reached = p?.goals ?? [];
	const current = PLAYER_GOALS.find((g) => !reached.some((d) => d.id === g.id));
	return {
		active: !!p,
		...(at ? { placeId: at } : {}),
		...(p?.job
			? {
					job: {
						kind: p.job.kind,
						fromId: p.job.from,
						toId: p.job.to,
						departedAt: p.job.departedAt,
						arriveAt: p.job.arriveAt,
						endsAt: p.job.endsAt,
						...(p.job.work ? { work: p.job.work } : {}),
						...(p.job.pledgeId ? { pledgeId: p.job.pledgeId } : {}),
					},
				}
			: {}),
		workHoursLeft: PLAYER_WORK_HOURS - hoursUsed(p, day),
		canMove: !p?.job,
		present: present.slice(0, 16).map((r) => ({
			id: r.person.id,
			name: r.person.name,
			known: r.known,
			activity: r.job?.offer.label ?? "Free to choose",
			...(r.person.will.voices.some((v) => v.voiceId === PLAYER_VOICE)
				? {
						trust: required(
							r.person.will.voices.find((v) => v.voiceId === PLAYER_VOICE),
							"",
						).trust,
					}
				: {}),
		})),
		presentCount: present.length,
		destinations: s.places
			.filter((place) => place.id !== from)
			.map((place) => ({
				id: place.id,
				name: place.name,
				minutes: travelMinutes(s, from, place.id),
			})),
		requests: (p?.requests ?? []).slice(-8).map((q) => ({
			id: q.id,
			at: q.at,
			targetId: q.targetId,
			targetName: nameOf(s, q.targetId),
			affordanceId: q.affordanceId,
			label: q.label,
			mode: q.mode,
			verdict: q.answer.verdict,
			says: q.answer.says,
			...(q.answer.counterOffer ? { counterOffer: q.answer.counterOffer } : {}),
			status: q.status,
			...(q.decision
				? {
						decision: {
							at: q.decision.at,
							verdict: q.decision.answer.verdict,
							says: q.decision.answer.says,
							chosenAffordanceId: q.decision.chosenAffordanceId,
							chosenLabel: q.decision.chosenLabel,
						},
					}
				: {}),
			...(q.resultEvent !== undefined
				? {
						result: p?.log.find((e) => e.id === q.resultEvent)?.text,
					}
				: {}),
			...(q.pledgeId ? { pledgeId: q.pledgeId } : {}),
		})),
		pledges: (p?.pledges ?? []).map((x) => {
			const to = workPlace(s, x.work, x.toId);
			const end = s.now + travelMinutes(s, from, to) + 60;
			const reason =
				x.status !== "open"
					? undefined
					: p?.job
						? "You are busy"
						: minute < 480 || end > day * 1440 + 1080
							? "Work hours are 08:00–18:00, including the walk"
							: end > x.dueBy
								? "Too late to finish before the promised time"
								: hoursUsed(p, day) >= PLAYER_WORK_HOURS
									? "No working hours left today"
									: undefined;
			return {
				id: x.id,
				toId: x.toId,
				toName: nameOf(s, x.toId),
				work: x.work,
				label:
					x.work === "cover-shift"
						? `cover a paid shift for ${nameOf(s, x.toId)}`
						: PLAYER_WORK[x.work].label,
				placeId: to,
				dueBy: x.dueBy,
				status: x.status,
				...(x.status === "open"
					? { canStart: !reason, ...(reason ? { blocked: reason } : {}) }
					: {}),
			};
		}),
		journal: journalEntries(s),
		goals: [
			...PLAYER_GOALS.filter((g) => reached.some((d) => d.id === g.id)).map(
				(g) => ({
					id: g.id,
					title: g.title,
					hint: g.hint,
					status: "done" as const,
					doneAt: reached.find((d) => d.id === g.id)?.doneAt,
					eventIds: reached.find((d) => d.id === g.id)?.eventIds ?? [],
				}),
			),
			...(current
				? [
						{
							id: current.id,
							title: current.title,
							hint: current.hint,
							status: "current" as const,
							eventIds: [],
						},
					]
				: []),
		],
		notices: p?.notices ?? 0,
		...(p?.latestNotice ? { latestNotice: p.latestNotice } : {}),
	};
}

function int(value: unknown, min = 0): value is number {
	return Number.isSafeInteger(value) && Number(value) >= min;
}
function only(value: unknown, allowed: string[]): void {
	if (
		!value ||
		typeof value !== "object" ||
		Array.isArray(value) ||
		Object.keys(value).some((k) => !allowed.includes(k))
	)
		throw Error("Invalid player state");
}
function validAnswer(a: Answer): boolean {
	only(a, [
		"voiceId",
		"verdict",
		"kind",
		"reason",
		"says",
		"counterOffer",
		"insteadAffordanceId",
		"likelihood",
		"insisted",
	]);
	return (
		a.voiceId === PLAYER_VOICE &&
		["assented", "complied", "deferred", "modified", "refused"].includes(
			a.verdict,
		) &&
		typeof a.says === "string" &&
		a.says.length <= 2000 &&
		typeof a.reason === "string" &&
		a.reason.length <= 300 &&
		(a.counterOffer === undefined ||
			(typeof a.counterOffer === "object" &&
				typeof a.counterOffer.label === "string"))
	);
}
/** Strict import check: a malformed player record rejects the save without partial mutation. */
export function validatePlayer(s: Save, ids: Set<string>): void {
	const p = s.player;
	if (p === undefined) return;
	only(p, [
		"version",
		"place",
		"job",
		"work",
		"requests",
		"pledges",
		"log",
		"notices",
		"latestNotice",
		"goals",
	]);
	const bad = () => {
		throw Error("Invalid player state");
	};
	const place = (id: unknown) =>
		typeof id === "string" && s.places.some((x) => x.id === id);
	if (
		p.version !== 1 ||
		!place(p.place) ||
		!int(p.notices) ||
		!Array.isArray(p.requests) ||
		p.requests.length > LIMITS.requests ||
		!Array.isArray(p.pledges) ||
		p.pledges.length > LIMITS.pledges ||
		!Array.isArray(p.log) ||
		p.log.length > LIMITS.log ||
		!Array.isArray(p.goals) ||
		p.goals.length > PLAYER_GOALS.length
	)
		bad();
	only(p.work, ["day", "starts"]);
	if (
		!int(p.work.day) ||
		p.work.day > Math.floor(s.now / 1440) ||
		!int(p.work.starts) ||
		p.work.starts > PLAYER_WORK_HOURS
	)
		bad();
	let last = 0;
	for (const e of p.log) {
		validateEvent(e, s, ids);
		if (e.id <= last) bad();
		last = e.id;
	}
	if (p.job) {
		const j = p.job;
		only(j, [
			"kind",
			"from",
			"to",
			"departedAt",
			"arriveAt",
			"endsAt",
			"event",
			"work",
			"pledgeId",
			"forId",
		]);
		if (
			!["travel", "work"].includes(j.kind) ||
			j.from !== p.place ||
			!place(j.to) ||
			!int(j.departedAt, 480) ||
			j.departedAt > s.now ||
			j.arriveAt !== j.departedAt + travelMinutes(s, j.from, j.to) ||
			j.endsAt !== j.arriveAt + (j.kind === "work" ? 60 : 0) ||
			j.endsAt <= s.now ||
			!int(j.event, 1) ||
			j.event >= s.nextEvent ||
			(j.kind === "travel" &&
				(j.work !== undefined ||
					j.pledgeId !== undefined ||
					j.forId !== undefined)) ||
			(j.kind === "work" &&
				(!j.work ||
					!Object.hasOwn(PLAYER_WORK, j.work) ||
					(j.forId !== undefined && !ids.has(j.forId)) ||
					(j.work === "cover-shift" && !j.forId) ||
					j.to !== workPlace(s, j.work, j.forId ?? "") ||
					p.work.day !== Math.floor(j.departedAt / 1440) ||
					p.work.starts < 1 ||
					(j.pledgeId !== undefined &&
						!p.pledges.some(
							(x) => x.id === j.pledgeId && x.status === "open",
						)) ||
					(j.work === "cover-shift" &&
						(() => {
							const w = s.people.find((r) => r.person.id === j.forId)?.paidWork;
							return !w || w.day !== p.work.day || w.minutes >= w.starts * 60;
						})())))
		)
			bad();
	}
	for (const q of p.requests) {
		only(q, [
			"id",
			"at",
			"placeId",
			"targetId",
			"affordanceId",
			"label",
			"mode",
			"pledgeId",
			"accepts",
			"waits",
			"answer",
			"answerEvent",
			"status",
			"decision",
			"startedEvent",
			"resultEvent",
		]);
		if (
			!int(q.id, 1) ||
			q.id >= s.nextEvent ||
			!int(q.at, 480) ||
			q.at > s.now ||
			!place(q.placeId) ||
			!ids.has(q.targetId) ||
			typeof q.affordanceId !== "string" ||
			q.affordanceId.length > 200 ||
			typeof q.label !== "string" ||
			q.label.length > 300 ||
			!Object.hasOwn(SPEECH, q.mode) ||
			!validAnswer(q.answer) ||
			!int(q.answerEvent, q.id + 1) ||
			q.answerEvent >= s.nextEvent ||
			![
				"refused",
				"held",
				"replaced",
				"dropped",
				"decided",
				"continued",
				"started",
				"completed",
				"failed",
				"interrupted",
			].includes(q.status) ||
			(q.status === "refused") !== (q.answer.verdict === "refused") ||
			(q.pledgeId !== undefined &&
				!p.pledges.some((x) => x.id === q.pledgeId && x.requestId === q.id)) ||
			(q.accepts !== undefined && (!int(q.accepts, 1) || q.accepts >= q.id)) ||
			(q.waits !== undefined &&
				(q.waits !== true ||
					(q.answer.verdict !== "deferred" && q.accepts === undefined))) ||
			(q.startedEvent !== undefined &&
				(!int(q.startedEvent, 1) || q.startedEvent >= s.nextEvent)) ||
			(q.resultEvent !== undefined &&
				(!int(q.resultEvent, 1) || q.resultEvent >= s.nextEvent))
		)
			bad();
		if (q.decision) {
			only(q.decision, [
				"at",
				"event",
				"answer",
				"chosenAffordanceId",
				"chosenLabel",
			]);
			if (
				!int(q.decision.at, q.at) ||
				q.decision.at > s.now ||
				!int(q.decision.event, 1) ||
				q.decision.event >= s.nextEvent ||
				!validAnswer(q.decision.answer) ||
				typeof q.decision.chosenAffordanceId !== "string" ||
				typeof q.decision.chosenLabel !== "string"
			)
				bad();
		} else if (
			[
				"decided",
				"continued",
				"started",
				"completed",
				"failed",
				"interrupted",
			].includes(q.status)
		)
			bad();
	}
	if (
		new Set(
			p.requests.filter((q) => q.status === "held").map((q) => q.targetId),
		).size !== p.requests.filter((q) => q.status === "held").length
	)
		bad();
	for (const x of p.pledges) {
		only(x, [
			"id",
			"requestId",
			"toId",
			"work",
			"madeAt",
			"dueBy",
			"event",
			"status",
			"dueNoticed",
			"resolvedEvent",
			"hfReported",
		]);
		if (
			x.id !== `pledge-${x.requestId}` ||
			!int(x.requestId, 1) ||
			!ids.has(x.toId) ||
			!Object.hasOwn(PLAYER_WORK, x.work) ||
			!int(x.madeAt, 480) ||
			x.madeAt > s.now ||
			x.dueBy !== dueByFor(x.madeAt) ||
			!int(x.event, 1) ||
			x.event >= s.nextEvent ||
			!["open", "kept", "lapsed"].includes(x.status) ||
			(x.status === "open" && s.now >= x.dueBy) ||
			(x.status === "open") !== (x.resolvedEvent === undefined) ||
			(x.resolvedEvent !== undefined &&
				(!int(x.resolvedEvent, 1) || x.resolvedEvent >= s.nextEvent)) ||
			(x.dueNoticed !== undefined && x.dueNoticed !== true) ||
			(x.hfReported !== undefined && typeof x.hfReported !== "boolean")
		)
			bad();
	}
	if (p.latestNotice !== undefined) {
		only(p.latestNotice, ["at", "text", "eventId"]);
		if (
			!int(p.latestNotice.at, 480) ||
			p.latestNotice.at > s.now ||
			typeof p.latestNotice.text !== "string" ||
			p.latestNotice.text.length > 4000 ||
			!int(p.latestNotice.eventId, 1) ||
			p.latestNotice.eventId >= s.nextEvent ||
			p.notices < 1
		)
			bad();
	}
	for (const [i, g] of p.goals.entries()) {
		only(g, ["id", "doneAt", "eventIds"]);
		if (
			g.id !== PLAYER_GOALS[i]?.id ||
			!int(g.doneAt, 480) ||
			g.doneAt > s.now ||
			(i > 0 && g.doneAt < (p.goals[i - 1]?.doneAt ?? 0)) ||
			!Array.isArray(g.eventIds) ||
			g.eventIds.length > 8 ||
			g.eventIds.some((id) => !int(id, 1) || id >= s.nextEvent)
		)
			bad();
	}
}
