import {
	createPerson,
	createRun,
	DEFAULT_NORMS,
	type PersonAuthoring,
	type Result,
	type Run,
	type RunSpec,
} from "@adam0white/human-framework";
import { canonicalCast } from "@adam0white/lab-client";
import { HOST_CAST } from "./canonical-cast.ts";
import { keyed } from "./hash.ts";
import { neighbourNames } from "./neighbour-names.ts";
import { known, placeSpecs } from "./state.ts";

export const MINUTE = 60_000;
export const START_MINUTE = 480;
export const HOST_SOURCE = { type: "host", id: "neighbours" } as const;
export function need<T>(result: Result<T>): T {
	if (!result.ok)
		throw Error(
			`${result.error.code}: ${result.error.path}: ${result.error.message}`,
		);
	return result.value;
}
export function townTime(minute: number): number {
	if (!Number.isSafeInteger(minute) || !Number.isSafeInteger(minute * MINUTE))
		throw Error("Invalid town minute");
	return minute * MINUTE;
}
/** Convert host minute arithmetic back to the exact millisecond grid; reject meaningful fractions. */
export function nativeMilliseconds(minutes: number): number {
	const value = minutes * MINUTE;
	const integer = Math.round(value);
	if (!Number.isSafeInteger(integer) || Math.abs(value - integer) > 0.000001)
		throw Error("Host time is not an exact millisecond");
	return integer;
}
export function townMinute(at: number): number {
	if (!Number.isSafeInteger(at) || at % MINUTE !== 0)
		throw Error("Run boundary is not a town minute");
	return at / MINUTE;
}
const ACTION_IDS = [
	"rest",
	"pray",
	"pray-home",
	"pray-qada",
	"pray-eid",
	"tea",
	"sleep",
	"drink",
	"eat",
	"grow",
	"supply",
	"talk",
	"learn",
	"teach",
	"care",
	"work",
	"repair",
	"gather",
	"inspect",
	"open-section",
	"keep-closed",
	"ask-inspector",
	"wait-inspector",
	"answer-inspection",
	"propose-class",
	"propose-meal",
	"accept-evening",
	"decline-evening",
	"prepare-class",
	"prepare-meal",
	"host-class",
	"host-meal",
	"attend-class",
	"attend-meal",
	"repair-cart",
	"return-cart",
	"cart-ask",
	"cart-agree",
	"cart-refuse",
	"cart-later",
	"cart-fast",
	"cart-slow",
	"cart-handover",
];
// SCOPE: host premises only. All cognition, time, body evolution and randomness belong to this Run.
export function townSpec(seed: number): RunSpec {
	return {
		id: `neighbours:${seed}`,
		seed,
		start: townTime(START_MINUTE),
		host: {
			id: "neighbours",
			edition: "neighbours-hf48-1",
			schema: "neighbours-run/1",
		},
		definitions: {
			actions: ACTION_IDS.map((id) => ({
				id,
				label: id,
				demands: { effort: 0, focus: 0, mode: "awake", requires: {} },
				tags: [],
				norms: [],
			})),
			norms: DEFAULT_NORMS,
			marriageCustoms: [],
			skills: [{ id: "repair", label: "repair", domain: "motor" }],
			skillTransfers: [],
			methods: [
				{
					id: "hall-section-inspection",
					action: "open-section",
					conditions: [
						{ cue: "hall-moisture", value: "dry" },
						{ cue: "hall-support", value: "sound" },
					],
				},
			],
			sources: [HOST_SOURCE, { type: "voice", id: "player" }],
			routines: [],
			lexicon: {
				locale: "en",
				names: {},
				roles: {},
				prefer: "name",
				actions: Object.fromEntries(
					ACTION_IDS.map((id) => [
						id,
						{
							base: id.replaceAll("-", " "),
							past: id.replaceAll("-", " "),
							gerund: id.replaceAll("-", " "),
						},
					]),
				),
			},
			calendar: {
				id: "neighbours-local",
				epoch: {
					id: "neighbours-local",
					simulationAt: 0,
					dayIndex: 0,
					msOfDay: 0,
				},
				dayMs: 86400000,
				days: Array.from({ length: 32 }, (_, dayIndex) => ({
					dayIndex,
					start: dayIndex * 86400000,
					prayers: {
						fajrMs: townTime(300),
						sunriseMs: townTime(390),
						dhuhrMs: townTime(750),
						asrMs: townTime(960),
						maghribMs: townTime(1125),
						ishaMs: townTime(1215),
					},
					nextFajrMs: townTime(300),
					windows: [],
				})),
			},
		},
		lifecycle: { kinPremises: [], kinScopes: [] },
		world: {
			revision: 0,
			facts: placeSpecs.map(([id, name]) => ({
				id: `place:${id}`,
				subject: id,
				predicate: "place",
				value: name,
				at: townTime(START_MINUTE),
				provenance: { source: "neighbours", evidenceId: `opening:${id}` },
			})),
			hostState: {},
		},
	};
}
export function authorResidents(
	seed: number,
	population: number,
): readonly PersonAuthoring[] {
	const names = neighbourNames(seed);
	const start = townTime(START_MINUTE);
	return Array.from({ length: population }, (_, i) => {
		const k = known[i];
		const ordinal = k ? i : i + 2;
		const id = k?.[0] ?? `resident-${i - 5}`;
		const castId = HOST_CAST[id as keyof typeof HOST_CAST];
		const cast = castId ? canonicalCast(castId) : undefined;
		const name = cast?.name ?? names[i - 6];
		if (!name) throw Error("Missing resident name");
		const neutralTraits = {
			honesty: 0.5,
			emotionality: 0.5,
			extraversion: 0.5,
			agreeableness: 0.5,
			conscientiousness: 0.5,
			openness: 0.5,
		};
		const neutralValues = {
			benevolence: 0.35 + keyed(seed, 0, id) * 0.5,
			universalism: 0.5,
			tradition: 0.5,
			conformity: 0.5,
			security: 0.5,
			achievement: 0.5,
			power: 0.5,
			hedonism: 0.5,
			stimulation: 0.5,
			selfDirection: 0.5,
		};
		const person: PersonAuthoring = {
			id,
			identity: {
				name,
				birthAt: townTime(-1440 * 365 * (cast?.age ?? 23 + (ordinal % 47))),
				sex: ["ada", "elin", "noor"].includes(id)
					? "female"
					: k
						? "male"
						: ordinal % 2
							? "male"
							: "female",
				...(castId ? { castId } : {}),
			},
			biography: [
				{
					id: "e0",
					at: start,
					kind: "opening-context",
					valence: 0,
					salience: 0.5,
					summary:
						k?.[4] ??
						"This neighbour needs food, rest and time with other people.",
					tags: ["opening"],
					basis: { kind: "authored", author: "neighbours" },
					provenance: cast
						? [cast.castId, cast.revision]
						: ["neighbours-opening/1"],
				},
			],
			origin: {
				kind: "authored",
				basis: { kind: "evidence", id: `opening:${id}` },
				traits: {
					kind: "explicit-authoring",
					evidence: { kind: "evidence", id: `traits:${id}` },
				},
			},
			state: {
				traits: structuredClone(cast?.traits ?? neutralTraits),
				values: structuredClone(cast?.values ?? neutralValues),
				body: {
					satiety: 0.8,
					hydration: 0.85,
					sleepPressure: 0.2,
					exertion: 0,
					fitness: 0.5,
					health: 1,
					pain: 0,
					sleepDebtHours: 0,
					depletion: 0,
					circadianPeakMs: 16 * 60 * MINUTE,
					asleep: false,
					since: start,
					doze: {
						context: { posture: "upright", stimulation: 0.5 },
						basis: { kind: "authored", author: "neighbours", at: start },
					},
					bladder: { fill: 0, pending: 0 },
					injuries: [],
					illnesses: [],
					exposures: [],
				},
				needs: {
					safety: 0.8,
					belonging: 0.7,
					esteem: 0.6,
					autonomy: 0.7,
					competence: 0.6,
					leisure: 0.6,
					meaning: 0.6,
				},
				skills: [
					{
						id: "repair",
						level: id === "ada" ? 0.8 : 0.1,
						practicedMs: 0,
						lastPracticed: start,
					},
				],
				heldNorms: DEFAULT_NORMS.map((norm) => ({
					normId: norm.id,
					standing: norm.standing,
					conviction: cast?.values.tradition ?? neutralValues.tradition,
					provenance: norm.provenance,
				})),
				beliefs: [],
				consequences: [],
				sourceTrust: [],
				context: {
					scarcity: { kind: "prior", value: 0, basis: "authored opening" },
					smoking: { kind: "unobserved" },
				},
				relationships: [],
				voices: [{ voiceId: "player", trust: 0.5 }],
				agenda: {
					exemptions: {
						traveling: { kind: "unobserved" },
						illnessSeverity: { kind: "unobserved" },
					},
					commitments: [],
					goals: [],
					precommitments: [],
					owed: [],
				},
				family: { contactCovered: [], aptitudes: {} },
				groups: [],
				reserve: {},
				retention: { trace: 32, chronicleDays: 120 },
				habits: [],
				expectations: [],
				affect: {
					mood: { valence: 0, arousal: 0.3 },
					regulation: 0.3,
					emotions: [],
				},
				promptings: { reading: "none", responses: [] },
				review: { style: "accounting", atMsOfDay: 21 * 60 * MINUTE },
				bonds: { courtships: [], marriages: [] },
			},
		};
		if (k) {
			const action = ["repair", "care", "supply", "supply", "learn", "talk"][i];
			if (!action) throw Error("Missing promise");
			person.state.agenda.commitments = [
				{
					id: `opening-promise:${id}`,
					kind: "promise",
					toId: known[(i + 1) % 6]?.[0],
					label:
						[
							"Repair the hall doors before evening",
							"Keep the clinic open during the agreed shift",
							"Help prepare the shared meal with an experienced kitchen worker",
							"Carry supplies during the agreed visit",
							"Practise a repair without claiming expertise",
							"Check the supply route and meet neighbours",
						][i] ?? action,
					actions: [action],
					from: start,
					until: townTime(1080),
					importance: 0.6,
				},
			];
		}
		if (id === "ada")
			person.state.agenda.goals = [
				{
					id: "opening-hall-inspection",
					label: "Check the flood-damaged timber before reopening",
					serves: ["competence", "meaning"],
					importance: 0.7,
					baseImportance: 0.7,
					progress: 0,
					completionHalfLifeMs: 7200000,
					deadline: townTime(1200),
					advancedBy: [
						{ action: "inspect", amount: 0.1 },
						{ action: "open-section", amount: 0.75 },
						{ action: "keep-closed", amount: 0.75 },
					],
				},
			];
		if (id === "elin")
			person.state.agenda.commitments = [
				...person.state.agenda.commitments,
				{
					id: "night-worker-sleep",
					kind: "appointment",
					actions: ["sleep"],
					from: start,
					until: townTime(720),
					importance: 0.9,
					label: "Sleep in the morning after night work; cover shifts later",
				},
			];
		return person;
	});
}
export function createTownRun(seed = 42, population = 206): Run {
	if (
		!Number.isSafeInteger(seed) ||
		seed < 0 ||
		seed > 4294967295 ||
		!Number.isInteger(population) ||
		population < 6 ||
		population > 300
	)
		throw Error("Invalid seed or population");
	const authors = authorResidents(seed, population);
	const spec = townSpec(seed);
	spec.definitions.sources = [
		...spec.definitions.sources,
		...authors.map((person) => ({ type: "person" as const, id: person.id })),
		{ type: "voice", id: "prior-workshop-practice" },
	];
	spec.definitions.lexicon.names = Object.fromEntries(
		authors.map((person) => [person.id, person.identity.name]),
	);
	const run = need(createRun(spec));
	for (const person of authors) need(createPerson(run, person));
	return run;
}
