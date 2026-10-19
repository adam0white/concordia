import {
	type Affordance,
	begin,
	breakAllows,
	type DecisionRecord,
	decide,
	downedAllows,
	finish,
	inBreak,
	perceive,
	readPerson,
	reviewed,
	type Suggestion,
	snapshot,
	tick,
	vetoFor,
} from "@adam0white/human-framework";
import type {
	Intervention,
	Policy,
	TownEvent,
	TownRuntime,
	TownView,
} from "../contracts";
import {
	observeHallInspection,
	teachHallInspection,
} from "../experiments/inspection.ts";
import { reviewDue, reviewOffers } from "./activity-reviews.ts";
import {
	assistanceDecision,
	canReceiveInspectionRequest,
	finishAssistance,
	observeAssistance,
	requestInspection,
} from "./assistance.ts";
import { canProposeBench, proposeBenchWindow } from "./bench-opportunity.ts";
import {
	inspectionInstructor,
	inspectionInstructors,
	retainsInspectionMethod,
	taughtByNeighbour,
} from "./cast.ts";
import { townDiagnostics } from "./diagnostics.ts";
import {
	inspectionKey,
	locatedAt,
	overlapMinutes,
	presentAt,
	receivedRequest,
	receiveEvent,
} from "./encounters.ts";
import {
	allEvenings,
	beginEvening,
	canAdvertiseEvening,
	canOpenEveningSlot,
	eveningFor,
	eveningLabel,
	finishEvening,
	interruptEvening,
	interveneEvening,
	MAX_EVENING_CYCLES,
	roomBooking,
	updateEvenings,
	weeklySupportRemaining,
} from "./evenings.ts";
import { loosenHall, noticeLooseHall, settleHallGoals } from "./hall-care.ts";
import {
	cartSupplyBonus,
	finishHandcart,
	interruptHandcart,
	updateHandcart,
} from "./handcart.ts";
import { keyed } from "./hash.ts";
import { HF_SOURCE, isHfSource } from "./hf-version.ts";
import { moodRead } from "./impression.ts";
import { placeOf, required } from "./invariants.ts";
import {
	buildOffers,
	socialPreview,
	usesActivitySlot,
	workMinutesFor,
} from "./offers.ts";
import { realizedOutcome } from "./outcomes.ts";
import { personLessons } from "./person-learning.ts";
import {
	heldSuggestion,
	playerApplied,
	playerDecided,
	playerIntervene,
	playerJobEnded,
	playerRound,
	playerView,
	predictAnswers,
	predictSpeech,
} from "./player.ts";
import { botchedUnderProtest } from "./protest.ts";
import { recordSocialContacts } from "./social-contact.ts";
import { type Resident, type Save, SCHEMA } from "./state.ts";
import { townStories } from "./stories.ts";
import { scheduledFoodDelivery } from "./supply.ts";
import { repairHolds, timberMoisture, weatherTimber } from "./timber.ts";
import { recordTownEvent } from "./town-chronicle.ts";
import { jobLine } from "./voicing.ts";

function awakeHallNewsListener(r: Save["people"][number]): boolean {
	return (
		r.person.body.alive &&
		!r.person.body.asleep &&
		r.job?.offer.mode !== "sleep"
	);
}
export function canShareHallNews(s: Save): boolean {
	return s.hall < 12 && s.people.some(awakeHallNewsListener);
}
export class Runtime implements TownRuntime {
	s: Save;
	records = new Map<string, DecisionRecord>();
	offers = new Map<string, Affordance[]>();
	constructor(s: Save) {
		this.s = s;
	}
	actor(id: string) {
		const p = this.s.people.find((p) => p.person.id === id);
		if (!p) throw Error("Unknown resident");
		return p;
	}
	event(
		kind: string,
		text: string,
		actorId?: string,
		placeId?: string,
		causes: number[] = [],
	) {
		const e: TownEvent = {
			id: this.s.nextEvent++,
			at: this.s.now,
			kind,
			text,
			causes,
			importance: [
				"evening-ended",
				"evening-attended",
				"death",
				"incapacity",
				"hall-open",
				"hall-closed",
				"hall-repaired",
				"hall-loosened",
				"inspection-failed",
				"hall-explanation",
				"shared-meal",
			].includes(kind)
				? 0.95
				: kind === "lesson"
					? 0.5
					: kind === "completed"
						? 0.3
						: 0.15,
			...(actorId ? { actorId } : {}),
			...(placeId ? { placeId } : {}),
		};
		this.s.events.push(e);
		recordTownEvent(this.s, e);
		if (this.s.events.length > 400) {
			const landmarks = this.s.events
				.filter((e) =>
					[
						"hall-open",
						"hall-repaired",
						"shared-meal",
						"lesson",
						"hall-explanation",
						"question",
						"missed-encounter",
					].includes(e.kind),
				)
				.slice(-8);
			const landmarkIds = new Set(landmarks.map((e) => e.id));
			const familiarActors = new Set(
				this.s.people.filter((r) => r.known).map((r) => r.person.id),
			);
			const familiar = this.s.events
				.filter(
					(e) =>
						e.actorId &&
						familiarActors.has(e.actorId) &&
						!landmarkIds.has(e.id),
				)
				.slice(-152);
			const familiarIds = new Set(familiar.map((e) => e.id));
			const other = this.s.events
				.filter((e) => !landmarkIds.has(e.id) && !familiarIds.has(e.id))
				.slice(-240);
			this.s.events = [...landmarks, ...familiar, ...other].sort(
				(a, b) => a.id - b.id,
			);
		}
		return e.id;
	}
	postQuestion(id: string, cause: number) {
		const r = this.actor(id);
		if (!presentAt(r, "hall", this.s.now))
			throw Error("Question must be posted at the hall");
		const learnedDampness = r.person.methods?.rules.some((rule) =>
			rule.conditions.some((condition) => condition.cue === "hall-moisture"),
		);
		const question =
			learnedDampness && this.s.hall < 12
				? "I can compare dry and wet timber, but the loose supports need another opinion."
				: learnedDampness
					? "I want another opinion on this timber before we open."
					: "How can I tell whether the timber is safe?";
		const qid = this.event(
			"question",
			`${r.person.name} left a question on the hall noticeboard: “${question}”`,
			id,
			"hall",
			[cause],
		);
		const note = required(
			this.s.events.find((e) => e.id === qid),
			"Question event missing",
		);
		r.question = {
			event: qid,
			at: this.s.now,
			note: structuredClone(note),
			status: "waiting",
		};
		for (const instructor of inspectionInstructors(this.s))
			if (
				instructor.person.id !== id &&
				presentAt(instructor, "hall", this.s.now)
			)
				receiveEvent(instructor, note, "heard", `Heard ${note.text}`);
	}
	lifecycleEvent(kind: string, text: string, actorId: string, placeId: string) {
		const id = this.event(kind, text, actorId, placeId);
		return required(
			this.s.events.find((e) => e.id === id),
			"Missing lifecycle event",
		);
	}

	interruptJob(id: string, reason = "stopped") {
		const r = this.actor(id);
		if (!r.job) return;
		const j = r.job;
		interruptEvening(this.s, r);
		interruptHandcart(this.s, r);
		if (usesActivitySlot(j.offer)) placeOf(this.s, j.offer.placeId).reserved--;
		this.s.tools += j.tools;
		placeOf(this.s, "market").stock += j.food;
		r.wealth += j.food;
		if ((!r.person.body.alive ? this.s.now - 15 : this.s.now) >= j.arrive)
			r.place = required(j.offer.placeId, "Missing destination");
		if (r.person.activity)
			finish(r.person, {
				at: this.s.now,
				status: "interrupted",
				affordanceId: j.offer.id,
				action: j.offer.action,
				needs: {},
				material: 0,
			});
		const stopped = this.event(
			"interrupted",
			`${r.person.name}'s ${j.offer.label.toLowerCase()} ${reason} ${(!r.person.body.alive ? this.s.now - 15 : this.s.now) < j.arrive ? `before arrival was confirmed, last known at ${j.from} while travelling toward ${j.offer.placeId}` : `at ${r.place}`}; reserved resources were returned.`,
			r.person.id,
			r.place,
			[j.event],
		);
		playerJobEnded(this.s, j.event, stopped, "interrupted");
		delete r.job;
		r.idleSince = this.s.now;
	}
	/** An inspection instructor hears waiting questions as standing competence suggestions. */
	instructorSuggestions(r: Resident): Suggestion[] {
		if (!inspectionInstructor(r)) return [];
		return this.s.people
			.filter(
				(o) =>
					o.person.id !== r.person.id &&
					o.question?.status === "waiting" &&
					receivedRequest(r, o) &&
					presentAt(o, "hall", this.s.now),
			)
			.map((o) => ({
				voiceId: o.person.id,
				affordanceId: `answer-inspection:${o.person.id}`,
				strength: 0.5,
				appeal: "competence" as const,
				since: o.question?.at,
			}));
	}
	prepareRound() {
		if (this.s.pending.length) throw Error("Round has unresolved actors");
		this.s.now += 15;
		this.s.round++;
		weatherTimber(this.s, this.weather(), 15);
		if (loosenHall(this.s))
			this.event(
				"hall-loosened",
				"A repaired section of the hall worked loose as the wet timber moved.",
				undefined,
				"hall",
			);
		this.records.clear();
		this.offers.clear();
		for (const r of this.s.people) {
			tick(r.person, this.s.now);
			const dead = !r.person.body.alive;
			const downed = !!r.person.body.downed;
			const interrupted =
				r.job &&
				(dead ||
					!r.person.activity ||
					(downed && !downedAllows(r.job.offer)) ||
					(!breakAllows(r.person, r.job.offer) &&
						vetoFor(r.person, r.job.offer, {
							now: this.s.now,
							affordances: [r.job.offer],
							...readPerson(r.person),
						})?.reason === "break"));
			if (interrupted && r.job) this.interruptJob(r.person.id);
			if (dead && r.lifeEvent?.kind !== "death")
				r.lifeEvent = this.lifecycleEvent(
					"death",
					`${r.person.name} was found dead at this round boundary.`,
					r.person.id,
					r.place,
				);
			else if (downed && r.lifeEvent?.kind !== "incapacity" && !dead)
				r.lifeEvent = this.lifecycleEvent(
					"incapacity",
					`${r.person.name} is down and can only rest where they are.`,
					r.person.id,
					r.place,
				);
		}
		recordSocialContacts(this);
		updateEvenings(this);
		updateHandcart(this);
		const boundary = this.s.people.map((r) => ({
			...r,
			job: r.job ? { ...r.job, offer: { ...r.job.offer } } : undefined,
		}));
		for (const r of this.s.people) {
			if (r.job && r.job.end <= this.s.now) {
				const j = r.job,
					p = placeOf(this.s, j.offer.placeId);
				// Before finish(): HF still holds the protested activity.
				const botched = botchedUnderProtest(this.s, r, j);
				let attendedLesson = false;
				let socialCompanions = 0;
				let inspectionEvent: number | undefined;
				if (usesActivitySlot(j.offer)) p.reserved--;
				r.place = p.id;
				const classOrganiser =
					j.offer.action === "attend-class"
						? eveningFor(this.s, j.offer)?.organiserId
						: undefined;
				const evening = finishEvening(this, r);
				const cart = finishHandcart(this, r);
				const assistance = finishAssistance(this, r);
				this.s.tools += j.tools;
				if (j.food) {
					if (evening.handled && !evening.delivered) {
						placeOf(this.s, "market").stock += j.food;
						r.wealth += j.food;
					} else this.s.consumed += j.food;
				}
				if (evening.delivered && j.offer.action === "attend-class") {
					// A lesson passes on only what its organiser actually retains.
					const organiser = classOrganiser
						? this.s.people.find((o) => o.person.id === classOrganiser)
						: undefined;
					if (organiser && retainsInspectionMethod(organiser.person))
						teachHallInspection(
							r.person,
							organiser.person.id,
							`evening-lesson-${j.event}`,
						);
					attendedLesson = true;
				}
				if (evening.handled) socialCompanions = evening.companions.length;
				if (cart.handled) socialCompanions = cart.companions.length;
				if (j.offer.action === "grow" && !botched) {
					placeOf(this.s, "market").stock += 3;
					this.s.produced += 3;
				}
				if (j.offer.action === "supply" && !botched) {
					const m = placeOf(this.s, "market");
					const supplied = 5 + cartSupplyBonus(this.s, r.person.id, "supply");
					m.stock += supplied;
					this.s.produced += supplied;
				}
				if (botched) {
					// A botched job does nothing to the world.
				} else if (j.offer.action === "repair" && !repairHolds(this.s, j.event))
					this.event(
						"repair-slipped",
						`${r.person.name}’s repair on the damp timber did not hold.`,
						r.person.id,
						"hall",
						[j.event],
					);
				else if (j.offer.action === "repair") {
					this.s.hall += 1;
					settleHallGoals(this.s);
					if (this.s.hall === 12)
						this.event(
							"hall-repaired",
							"Twelve repairs are complete. Timber inspection is still needed before reopening.",
							r.person.id,
							"hall",
							[j.event],
						);
				}

				if (j.offer.action === "open-section" && !assistance) {
					const safe = this.moisture() === "dry" && this.s.hall >= 12;
					this.s.hallSafe = safe;
					inspectionEvent = this.event(
						safe ? "hall-open" : "inspection-failed",
						safe
							? `${r.person.name} checked dry, sound timber and opened the hall.`
							: `${r.person.name} found ${this.moisture()} timber and ${this.s.hall >= 12 ? "sound" : "loose"} supports. The hall stayed closed.`,
						r.person.id,
						"hall",
						[j.event],
					);
				}
				if (j.offer.action === "keep-closed" && !assistance) {
					this.s.hallSafe = false;
					inspectionEvent = this.event(
						"hall-closed",
						`${r.person.name} kept the hall closed after seeing ${this.moisture()} timber and ${this.s.hall >= 12 ? "sound" : "loose"} supports.`,
						r.person.id,
						"hall",
						[j.event],
					);
				}
				if (j.offer.action === "answer-inspection") {
					const learner = this.s.people.find(
						(o) => o.person.id === j.offer.targetId,
					);
					if (
						learner?.question?.status === "waiting" &&
						presentAt(learner, "hall", this.s.now) &&
						overlapMinutes(
							j,
							required(
								boundary.find((o) => o.person.id === learner.person.id),
								"Learner boundary missing",
							),
							this.s.now,
						) >= 15 &&
						presentAt(r, "hall", this.s.now) &&
						receivedRequest(r, learner)
					) {
						socialCompanions = 1;
						const questionId = learner.question.event;
						teachHallInspection(
							learner.person,
							r.person.id,
							`hall-explanation-${j.event}`,
						);
						const lessonId = this.event(
							"hall-explanation",
							`${r.person.name} showed ${learner.person.name} how dry, sound timber differs from wet timber, and when another opinion is needed. ${learner.person.name} can use that method on the next inspection.`,
							r.person.id,
							"hall",
							[questionId, j.event],
						);
						const lesson = required(
							this.s.events.find((e) => e.id === lessonId),
							"Explanation event missing",
						);
						lesson.targetId = learner.person.id;
						receiveEvent(
							learner,
							lesson,
							"social",
							`${r.person.name} explained the timber check to me beside the hall.`,
						);
						learner.question = {
							...learner.question,
							status: "answered",
							answeredBy: r.person.id,
							lessonEvent: lessonId,
						};
					} else
						this.event(
							"missed-encounter",
							`${r.person.name} went to explain the timber check, but the person who asked was no longer there.`,
							r.person.id,
							"hall",
							[j.event],
						);
				}
				if (
					(j.offer.action === "open-section" ||
						j.offer.action === "keep-closed") &&
					inspectionEvent !== undefined
				) {
					const event = required(
						this.s.events.find((e) => e.id === inspectionEvent),
						"Inspection event missing",
					);
					const record = r.person.trace.find(
						(t) => t.id === r.person.activity?.decisionId,
					);
					const source = r.decision?.source ?? "Host control";
					const methodTerms = isHfSource(source)
						? (record?.considered
								.find((c) => c.affordanceId === j.offer.id)
								?.terms.filter((t) => t.source.startsWith("method:"))
								.map((t) => ({ source: t.source, value: t.value })) ?? [])
						: [];
					r.inspection = {
						key: inspectionKey(this.s),
						action: j.offer.action,
						at: this.s.now,
						event: structuredClone(event),
						observations: j.inspectionCues ?? {
							moisture: this.moisture(),
							support: this.s.hall >= 12 ? "sound" : "loose",
						},
						result: event.text,
						source,
						methodTerms,
					};
				}

				if (j.offer.action === "learn") {
					// The practical class is held by whoever is actually teaching at school.
					const teacher = boundary.find(
						(o) =>
							o.person.id !== r.person.id &&
							o.job?.offer.action === "teach" &&
							overlapMinutes(j, o, this.s.now) >= 15,
					);
					if (teacher?.job) {
						attendedLesson = true;
						socialCompanions = 1;
					}
					// The class passes on only what its teacher actually retains.
					if (teacher?.job && retainsInspectionMethod(teacher.person)) {
						teachHallInspection(
							r.person,
							teacher.person.id,
							`lesson-${j.event}`,
						);
						const eid = this.event(
							"lesson",
							`${r.person.name} watched ${teacher.person.name} explain when flood-soaked timber is safe.`,
							r.person.id,
							"school",
							[j.event, teacher.job.event],
						);
						const lesson = required(
							this.s.events.find((e) => e.id === eid),
							"Lesson event missing",
						);
						receiveEvent(
							r,
							{ ...lesson, actorId: teacher.person.id, targetId: r.person.id },
							"heard",
							`${teacher.person.name} explained timber inspection during the practical class.`,
						);
					}
				}
				if (j.offer.action === "work") {
					// A botched shift is still a shift served, but it earns nothing.
					if (!botched) r.wealth += 2;
					const work = required(r.paidWork, "Missing paid shift ledger");
					work.minutes += 60;
					work.totalMinutes += 60;
				}
				if (j.offer.action === "talk" || j.offer.action === "gather") {
					const companions = boundary.filter(
						(o) =>
							o.person.id !== r.person.id &&
							o.job &&
							(o.job.offer.action === "talk" ||
								o.job.offer.action === "gather") &&
							overlapMinutes(j, o, this.s.now) >= 15,
					);

					socialCompanions = j.socialContacts?.length ?? 0;
					// Preview company never enters the physical activity. HF finish must not count it again.
					if (r.person.activity) delete r.person.activity.affordance.with;
					if (
						j.offer.action === "gather" &&
						this.s.firstMealAt === null &&
						companions.some((o) => o.job?.offer.action === "gather")
					) {
						this.s.firstMealAt = this.s.now;
						this.event(
							"shared-meal",
							`${r.person.name} shared the first meal in the reopened hall.`,
							r.person.id,
							"hall",
							[
								j.event,
								...this.s.events
									.filter((e) => e.kind === "hall-open")
									.map((e) => e.id),
							],
						);
					}
				}

				if (j.offer.action === "teach")
					socialCompanions = boundary.filter(
						(o) =>
							o.job?.offer.action === "learn" &&
							overlapMinutes(j, o, this.s.now) >= 15,
					).length;
				const status =
					botched ||
					(j.offer.action === "open-section" &&
						!(assistance ? this.s.assistance?.opened : this.s.hallSafe)) ||
					(evening.handled && !evening.delivered) ||
					(cart.handled && !cart.delivered)
						? ("failed" as const)
						: ("completed" as const);
				const actual = realizedOutcome(j.offer, {
					socialCompanions,
					attendedLesson,
					material:
						j.offer.action === "work"
							? botched
								? 0
								: 2
							: (j.offer.action === "eat" ||
										j.offer.action === "gather" ||
										j.offer.action === "attend-meal") &&
									(!evening.handled || evening.delivered)
								? -1
								: 0,
					status,
				});
				finish(r.person, {
					affordanceId: j.offer.id,
					action: j.offer.action,
					status,
					at: this.s.now,
					needs: actual.needs,
					material: actual.material,
					summary: `${status === "failed" ? "Could not complete" : "Finished"} ${j.offer.label}`,
				});

				const eid = this.event(
					status === "failed" ? "attempt-failed" : "completed",
					botched
						? `${jobLine(r.person.name, j.offer.label, true)} The work, done under protest, went wrong.`
						: jobLine(r.person.name, j.offer.label, status === "failed"),
					r.person.id,
					p.id,
					[j.event],
				);
				playerJobEnded(this.s, j.event, eid, status);
				for (const other of boundary
					.filter(
						(o) =>
							o.person.id !== r.person.id && presentAt(o, p.id, this.s.now),
					)
					.sort((a, b) =>
						a.person.id < b.person.id ? -1 : a.person.id > b.person.id ? 1 : 0,
					)
					.slice(0, 12))
					perceive(other.person, [
						{
							at: this.s.now,
							channel: "saw",
							kind: "neighbour-completed",
							actorId: r.person.id,
							placeId: p.id,
							salience: 0.6,
							summary: required(
								this.s.events.find((e) => e.id === eid),
								"Completion event missing",
							).text,
						},
					]);
				delete r.job;
				r.idleSince = this.s.now;
			}
		}
		for (const requester of this.s.people.filter(
			(o) => o.question?.status === "waiting",
		)) {
			const question = requester.question;
			// An instructor's own note waits for an outside opinion and never lapses here.
			if (!question || inspectionInstructor(requester)) continue;
			if (this.s.now - question.at > 120) {
				question.status = "missed";
				continue;
			}
			for (const instructor of inspectionInstructors(this.s))
				if (
					presentAt(instructor, "hall", this.s.now) &&
					!receivedRequest(instructor, requester)
				)
					receiveEvent(
						instructor,
						question.note,
						"saw",
						`Read the hall noticeboard: ${question.note.text}`,
					);
		}
		playerRound(this);
		if (this.s.round % 16 === 0) {
			const delivery = scheduledFoodDelivery(
				this.s.seed,
				this.s.round,
				this.s.people.length,
				placeOf(this.s, "market").stock,
			);
			placeOf(this.s, "market").stock += delivery;
			this.s.produced += delivery;
			this.event(
				"delivery",
				`${delivery} meals arrived by ${this.s.bus ? "bus" : "handcart"}.`,
				undefined,
				"market",
			);
		}
		for (const r of this.s.people.filter(
			(r) => !r.job && r.person.body.alive,
		)) {
			perceive(r.person, [
				{
					at: this.s.now,
					channel: "saw",
					kind: "local-situation",
					placeId: r.place,
					salience: 0.35,
					summary: `At ${r.place}. ${r.place === "hall" ? `${this.s.hall} hall repairs completed.` : r.place === "market" ? `${this.s.places.find((p) => p.id === "market")?.stock} meals available.` : "Neighbours are going about their day."}`,
				},
			]);
		}
		this.s.pending = this.s.people
			.filter(
				(r) => r.person.body.alive && (!r.job || reviewDue(r, this.s.now)),
			)
			.map((r) => r.person.id)
			.sort(
				(a, b) =>
					keyed(this.s.seed, this.s.round, `ready-priority:${a}`) -
						keyed(this.s.seed, this.s.round, `ready-priority:${b}`) ||
					a.localeCompare(b),
			);
		return [...this.s.pending];
	}
	affordances(id: string) {
		const r = this.actor(id);
		const offers =
			r.job && this.s.pending.includes(id) && reviewDue(r, this.s.now)
				? reviewOffers(this.s, r)
				: buildOffers(this.s, id);
		const readout = readPerson(r.person);
		return offers.filter(
			(offer) =>
				vetoFor(r.person, offer, {
					now: this.s.now,
					affordances: offers,
					...readout,
				})?.kind !== "cannot",
		);
	}
	getChoices(id: string) {
		const list = this.affordances(id);
		this.offers.set(id, list);
		return list.map((a) => ({ id: a.id, label: a.label }));
	}
	getObservation(id: string) {
		const r = this.actor(id);
		const location =
			r.job && r.job.arrive <= this.s.now
				? (r.job.offer.placeId ?? r.place)
				: r.place;
		return JSON.stringify({
			at: this.s.now,
			name: r.person.name,
			place: location,
			activity: r.job?.offer.label ?? "Free",
			weather: this.weather(),
			...(location === "hall"
				? { hallRepairs: this.s.hall, hallSafe: this.s.hallSafe }
				: {}),
			...(location === "market"
				? { marketMeals: placeOf(this.s, "market").stock }
				: {}),
			nearby: this.s.people
				.filter((o) => presentAt(o, location, this.s.now) && !o.job)
				.map((o) => o.person.name)
				.slice(0, 16),
		});
	}
	choose(id: string, policy?: Policy) {
		policy ??= this.actor(id).policy;
		if (policy === "llm")
			throw Error("LLM requires an external model decision");
		const r = this.actor(id);
		if (presentAt(r, "hall", this.s.now)) noticeLooseHall(this.s, r);
		if (presentAt(r, "hall", this.s.now))
			observeHallInspection(r.person, {
				contextId: "hall-inspection",
				sectionId: "hall-floor",
				moisture: this.moisture(),
				support: this.s.hall >= 12 ? "sound" : "loose",
			});
		observeAssistance(this.s, r);
		const choices = this.affordances(id).map((offer) =>
			socialPreview(this.s, id, offer),
		);
		if (!choices.length) throw Error("No legal choices");
		this.offers.set(id, choices);
		const held = heldSuggestion(this.s, id);
		const hfRecord =
			policy === "hf"
				? decide(r.person, choices, {
						scarcity: Math.max(0, 1 - r.wealth / 8),
						suggestions: [
							...this.instructorSuggestions(r),
							...(held ? [held] : []),
						],
						// HF 2.8.0: a player's request that interrupts a running activity is weighed on its merits,
						// without the activity's inertia bonus (promise inertia stays). Version 1 player saves keep
						// the earlier decision exactly.
						...(held && this.s.player?.version === 2
							? { reconsider: true }
							: {}),
					})
				: undefined;
		if (policy === "hf" && !hfRecord?.chosenAffordanceId)
			throw Error("HF could not choose a legal action");
		let chosen = hfRecord?.chosenAffordanceId ?? "rest";
		if (policy === "random")
			chosen = required(
				choices[
					Math.floor(keyed(this.s.seed, this.s.round, id) * choices.length)
				],
				"Random choice outside legal offers",
			).id;
		if (policy === "table") {
			const needs = readPerson(r.person).needs;
			const urgent = ["drink", "eat"].find(
				(action) =>
					needs.some(
						(n) =>
							n.id === (action === "drink" ? "water" : "food") &&
							n.urgency > 0.4,
					) && choices.some((a) => a.id === action),
			);
			chosen =
				urgent ??
				(r.job && choices.some((a) => a.id === r.job?.offer.id)
					? r.job.offer.id
					: (choices.find(
							(a) => a.id === (this.s.round % 4 === 0 ? "rest" : "grow"),
						)?.id ??
						required(choices[0], "Table policy has no legal default").id));
		}
		if (!choices.some((a) => a.id === chosen))
			throw Error(`${policy} selected an unavailable action`);

		const selectedOffer = required(
			choices.find((a) => a.id === chosen),
			"Chosen offer missing",
		);
		const reason = `${policy} comparison controller selected ${selectedOffer.label.toLowerCase()}.`;
		const record: DecisionRecord = hfRecord ?? {
			id: `${policy}-${id}-${this.s.round}`,
			at: this.s.now,
			chosenAffordanceId: chosen,
			chosenAction: selectedOffer.action,
			considered: [],
			intention: reason,
			narration: reason,
		};
		this.records.set(id, record);
		r.record = record;
		r.policy = policy;
		r.decision = {
			chosen,
			decidedAt: this.s.now,
			round: this.s.round,
			label: choices.find((a) => a.id === chosen)?.label ?? chosen,
			reason:
				policy === "hf" ? record.narration : `${policy} comparison controller`,
			options: record.considered.map((c) => ({
				id: c.affordanceId,
				label: c.label ?? c.action,
				utility: c.utility,
			})),
			source: policy === "hf" ? HF_SOURCE : policy,
			...(hfRecord
				? {
						offeredCount: choices.length,
						recordedCount: hfRecord.considered.length,
					}
				: {}),
		};
		playerDecided(this, r, hfRecord, choices);
		return chosen;
	}
	acceptExternalChoice(
		id: string,
		actionId: string,
		reason: string,
		source: string,
	) {
		if (!this.s.pending.includes(id)) throw Error("Actor is not ready");
		const r = this.actor(id);
		const offer = this.affordances(id).find((a) => a.id === actionId);
		if (
			!offer ||
			typeof reason !== "string" ||
			!reason.trim() ||
			reason.length > 2000 ||
			typeof source !== "string" ||
			!source.trim() ||
			source.length > 200
		)
			throw Error("Invalid external choice");
		const record: DecisionRecord = {
			id: `external-${id}-${this.s.round}`,
			at: this.s.now,
			chosenAffordanceId: offer.id,
			chosenAction: offer.action,
			considered: [],
			intention: reason,
			narration: reason,
		};
		r.record = record;
		r.policy = "llm";
		r.decision = {
			chosen: offer.id,
			decidedAt: this.s.now,
			round: this.s.round,
			label: offer.label,
			reason,
			options: [],
			source: `LLM policy with HF person state: ${source}`,
		};
	}
	apply(id: string, actionId: string) {
		if (!this.s.pending.includes(id)) throw Error("Actor is not ready");
		const r = this.actor(id);
		const feasible = this.affordances(id).find((a) => a.id === actionId);
		if (!feasible) throw Error("Action is not currently legal");
		if (r.job) {
			if (r.job.offer.id === actionId) {
				if (r.record?.chosenAffordanceId !== actionId)
					r.decision = {
						chosen: actionId,
						label: r.job.offer.label,
						reason: "Host continued the current physical activity.",
						options: [],
						source: "Host control",
						decidedAt: this.s.now,
						round: this.s.round,
					};
				reviewed(r.person);
				playerApplied(this.s, r, true);
				delete r.record;
				this.s.pending = this.s.pending.filter((actor) => actor !== id);
				return;
			}
			this.interruptJob(id, "changed plan at an HF review");
		}
		const offer = feasible;
		const proposed = r.record ?? this.records.get(id);
		const selected: DecisionRecord =
			proposed?.chosenAffordanceId === offer.id
				? proposed
				: {
						id: `host-${id}-${this.s.round}`,
						at: this.s.now,
						chosenAffordanceId: offer.id,
						chosenAction: offer.action,
						considered: [],
						intention: "Host selected a legal action.",
						narration: "Host selected a legal action.",
					};
		if (selected !== proposed)
			r.decision = {
				chosen: offer.id,
				label: offer.label,
				reason: selected.narration,
				options: [],
				source: "Host control",
				decidedAt: this.s.now,
				round: this.s.round,
			};
		if (!begin(r.person, offer, selected))
			throw Error("The person cannot begin this action");
		const p = placeOf(this.s, offer.placeId);
		const food = ["eat", "gather", "attend-meal"].includes(offer.action)
			? 1
			: 0;
		const tools = offer.action === "repair" ? 1 : 0;
		placeOf(this.s, "market").stock -= food;
		r.wealth -= food;
		this.s.tools -= tools;
		if (usesActivitySlot(offer)) p.reserved++;
		if (offer.action === "work") {
			const day = Math.floor(this.s.now / 1440);
			const previous = r.paidWork;
			r.paidWork =
				previous?.day === day
					? previous
					: {
							day,
							starts: 0,
							minutes: 0,
							totalMinutes: previous?.totalMinutes ?? 0,
						};
			r.paidWork.starts++;
		}

		delete r.record;
		const travel = offer.duration - workMinutesFor(offer);
		r.job = {
			offer,
			end: this.s.now + offer.duration,
			arrive: this.s.now + travel,
			from: r.place,
			event: this.event(
				"started",
				`${r.person.name}: ${offer.label}.`,
				id,
				p.id,
			),
			food,
			tools,
			...(offer.targetId === "hall-annex" && offer.id !== "annex-visit"
				? { assistanceDecision: assistanceDecision(r, selected) }
				: {}),
			...(offer.targetId !== "hall-annex" &&
			["open-section", "keep-closed", "ask-inspector"].includes(offer.action)
				? {
						inspectionCues: {
							moisture: this.moisture(),
							support: this.s.hall >= 12 ? "sound" : "loose",
						},
					}
				: {}),
		};
		beginEvening(this.s, r);
		playerApplied(this.s, r, false);
		if (offer.action === "ask-inspector" && offer.targetId !== "hall-annex")
			this.postQuestion(id, r.job.event);
		this.s.pending = this.s.pending.filter((a) => a !== id);
	}
	/** The hall timber's moisture cue: damp-based with timber physics, else today's weather (timber.ts). */
	moisture() {
		return timberMoisture(this.s, this.weather());
	}
	weather() {
		return keyed(this.s.seed, Math.floor(this.s.now / 1440), "weather") < 0.35
			? "Rain"
			: "Clear";
	}
	intervene(input: Intervention) {
		if (
			input.kind === "player-move" ||
			input.kind === "player-speak" ||
			input.kind === "player-work"
		) {
			if (this.s.pending.length) throw Error("Round has unresolved actors");
			playerIntervene(this, input, (r) => this.instructorSuggestions(r));
			return;
		}
		if (input.kind === "propose-bench-window") {
			proposeBenchWindow(this, input.proposal, input.proposalOrigin);
			return;
		}
		if (input.kind === "request-inspection") {
			requestInspection(
				this,
				input.actorId,
				input.proposal,
				input.proposalOrigin,
			);
			return;
		}
		if (
			input.kind === "open-evening-slot" ||
			input.kind === "advertise-evening"
		) {
			interveneEvening(this, input.kind, input.eventId);
			return;
		}
		if (!this.s.controls) throw Error("No intervention allowance remains");
		if (!["restore-bus", "lend-tools", "share-news"].includes(input.kind))
			throw Error("Unknown intervention");
		if (input.kind === "restore-bus" && this.s.bus)
			throw Error("Bus already restored");
		if (["share-news", "lend-tools"].includes(input.kind) && this.s.hall >= 12)
			throw Error(
				"Hall repairs are complete; repair news and extra tools are no longer needed",
			);
		if (input.kind === "share-news" && !canShareHallNews(this.s))
			throw Error("No awake neighbours can hear the hall news");
		this.s.controls--;
		if (input.kind === "restore-bus") this.s.bus = true;
		if (input.kind === "lend-tools") this.s.tools += 3;
		const eventId = this.event(
			"intervention",
			input.kind === "share-news"
				? "Town bulletin: Neighbours are repairing the flood-damaged hall."
				: input.kind.replaceAll("-", " "),
		);
		if (input.kind === "share-news") {
			const event = required(
				this.s.events.find((e) => e.id === eventId),
				"Missing bulletin event",
			);
			event.source = "town-bulletin";
			for (const r of this.s.people) {
				// This spoken bulletin is delivered to waking listeners; HF owns attention.
				if (!awakeHallNewsListener(r)) continue;
				const attended = perceive(r.person, [
					{
						at: this.s.now,
						channel: "told",
						kind: "hall-news",
						salience: 0.8,
						actorId: "town-bulletin",
						advice: [{ action: "repair", strength: 0.7 }],
						summary: "Neighbours are repairing the flood-damaged hall.",
						claims: [{ prop: "hall-needs-help", value: true, confidence: 0.9 }],
					},
				]);
				if (attended.length && !r.received?.some((e) => e.id === eventId))
					r.received = [
						...(r.received ?? []),
						{ ...event, targetId: r.person.id },
					].slice(-12);
			}
		}
	}
	step() {
		if (this.s.people.some((r) => r.person.body.alive && r.policy === "llm"))
			throw Error(
				"LLM people require an external controller; the town has not advanced.",
			);
		for (const id of this.prepareRound()) {
			const chosen = this.choose(id, this.actor(id).policy);
			this.apply(id, chosen);
		}
	}
	inspect(id: string) {
		const r = this.actor(id);
		return {
			person: snapshot(r.person),
			job: r.job,
			observation: JSON.parse(this.getObservation(id)),
			controller: r.policy,
		};
	}
	predictSpeech(id: string) {
		if (this.s.pending.length) throw Error("Round has unresolved actors");
		return predictSpeech(this.s, id, (r) => this.instructorSuggestions(r));
	}
	/** HF's predicted answers per mode: tests and probes only, never part of the UI contract. */
	predictAnswers(id: string) {
		if (this.s.pending.length) throw Error("Round has unresolved actors");
		return predictAnswers(this.s, id, (r) => this.instructorSuggestions(r));
	}
	export() {
		return structuredClone(this.s);
	}
	view(): TownView {
		return {
			schema: SCHEMA,
			seed: this.s.seed,
			now: this.s.now,
			day: Math.floor(this.s.now / 1440) + 1,
			people: this.s.people.map((r) => ({
				id: r.person.id,
				name: r.person.name,
				known: r.known,
				role: r.role,
				description: r.description,
				color: r.known ? "#bf784c" : "#82998e",
				canReceiveInspectionRequest: canReceiveInspectionRequest(r),
				policy: r.policy,
				placeId:
					r.job && this.s.now >= r.job.arrive
						? required(r.job.offer.placeId, "Activity destination missing")
						: r.place,
				...(r.job ? { destination: r.job.offer.placeId } : {}),
				...(r.job && this.s.now < r.job.arrive
					? {
							journey: {
								fromId: r.job.from,
								toId: required(r.job.offer.placeId, "Missing destination"),
								departedAt: r.job.end - r.job.offer.duration,
								arriveAt: r.job.arrive,
							},
						}
					: {}),
				lifeState: !r.person.body.alive
					? "dead"
					: r.person.body.downed
						? "downed"
						: inBreak(r.person)
							? "break"
							: r.person.body.asleep
								? "asleep"
								: "awake",
				lifeEvent: r.lifeEvent,
				activity: !r.person.body.alive
					? "Dead"
					: r.job
						? r.job.offer.label
						: "Free to choose",
				until: r.job?.end ?? this.s.now,
				needs: Object.fromEntries(
					readPerson(r.person).needs.map((n) => [n.id, n.urgency]),
				),
				mood: r.person.affect.mood.valence,
				read: moodRead(this.s, r),
				wealth: r.wealth,
				history: this.s.events
					.filter((e) => e.actorId === r.person.id)
					.slice(-8),
				observations: r.received ?? [],
				lessons: personLessons(r.person),
				...(r.inspection?.event &&
				r.inspection.observations &&
				r.inspection.result &&
				r.inspection.source
					? {
							inspection: {
								at: r.inspection.at,
								action: r.inspection.action,
								event: r.inspection.event,
								observations: r.inspection.observations,
								result: r.inspection.result,
								source: r.inspection.source,
								methodTerms: r.inspection.methodTerms ?? [],
							},
						}
					: {}),
				paidWork: {
					day: Math.floor(this.s.now / 1440),
					starts:
						r.paidWork?.day === Math.floor(this.s.now / 1440)
							? r.paidWork.starts
							: 0,
					minutes:
						r.paidWork?.day === Math.floor(this.s.now / 1440)
							? r.paidWork.minutes
							: 0,
					remaining:
						2 -
						(r.paidWork?.day === Math.floor(this.s.now / 1440)
							? r.paidWork.starts
							: 0),
				},
				relationships: r.person.social.relationships.map((rel) => ({
					id: rel.otherId,
					name:
						rel.otherId === "player"
							? "You"
							: (this.s.people.find((o) => o.person.id === rel.otherId)?.person
									.name ?? rel.otherId),
					trust: rel.trust,
					summary: rel.roles.join(", "),
					// Seeded ties carry an authored role; ties HF forms from encounters start without one.
					origin: (rel.roles.some((role) => role !== "deceased")
						? "initial"
						: "observed") as "initial" | "observed",
				})),
				invitations: allEvenings(this.s)
					.filter(
						(e) => e.replies[r.person.id] && e.organiserId !== r.person.id,
					)
					.map((e) => {
						const reply = required(
							e.replies[r.person.id],
							"Missing received invitation",
						);
						return {
							eventId: e.id,
							title: eveningLabel(e, this.s),
							startsAt: e.startsAt,
							status: reply.delivered
								? ("attended" as const)
								: reply.reply === "declined"
									? ("declined" as const)
									: e.stage === "closed" && reply.reply === "accepted"
										? ("missed" as const)
										: reply.reply === "accepted"
											? ("accepted" as const)
											: ("heard" as const),
						};
					}),
				purposes: r.person.agenda.goals.map((g) => ({
					id: g.id,
					label: g.label,
					progress: g.progress,
					status: g.status,
				})),
				commitments: r.person.agenda.commitments.map((c) => ({
					label: c.label ?? c.actions.join(", "),
					at: c.until,
					status: c.status,
				})),
				...(r.decision ? { decision: r.decision } : {}),
			})),
			places: this.s.places.map((p) => ({
				...p,
				open: p.id !== "hall" || this.s.hallSafe,
				occupants: this.s.people.filter((r) => locatedAt(r, p.id, this.s.now))
					.length,
				reserved: p.reserved,
				description:
					p.id === "hall"
						? `${this.s.hall}/12 repairs; ${this.s.hallSafe ? "open after inspection" : "closed pending safe inspection"}`
						: p.id === "market"
							? "Meals reserved when an activity starts."
							: "Shared town space.",
			})),
			events: this.s.events.slice(-100),
			stories: townStories(this.s),
			evenings: allEvenings(this.s)
				.filter(
					(e) =>
						e.notice ||
						(e.cycle !== undefined &&
							e.stage === "candidate" &&
							e.startsAt > this.s.now),
				)
				.map((e) => ({
					id: e.id,
					recurring: e.cycle !== undefined,
					...(e.cycle === undefined
						? {}
						: { supportRemaining: weeklySupportRemaining(this.s, e) }),
					canOpenSlot: canOpenEveningSlot(this.s, e),
					canAdvertise: canAdvertiseEvening(this.s, e),
					advertised: !!e.advertisement,
					advertisementReceipt: e.advertisement,
					roomReserved: ["preparing", "prepared"].includes(e.stage),
					roomReservedBy: roomBooking(this.s, e)?.organiserId,
					...(this.s.socialEvenings?.recurrence?.cycles.find(
						(c) => c.openedSlot?.eventId === e.id,
					)?.openedSlot
						? {
								originalStartsAt: this.s.socialEvenings.recurrence.cycles.find(
									(c) => c.openedSlot?.eventId === e.id,
								)?.openedSlot?.from,
								slotReceipt: this.s.socialEvenings.recurrence.cycles.find(
									(c) => c.openedSlot?.eventId === e.id,
								)?.openedSlot?.receipt,
							}
						: {}),
					kind: e.kind,
					organiserId: e.organiserId,
					title: eveningLabel(e, this.s),
					startsAt: e.startsAt,
					endsAt: e.endsAt,
					stage: e.stage,
					heard: Object.keys(e.replies).filter((id) => id !== e.organiserId)
						.length,
					accepted: Object.values(e.replies).filter(
						(r) => r.reply === "accepted",
					).length,
					attended: Object.entries(e.replies).filter(
						([id, r]) => id !== e.organiserId && r.delivered,
					).length,
					result: e.result?.text,
					participantIds: Object.entries(e.replies)
						.filter(([id, r]) => id !== e.organiserId && r.delivered)
						.map(([id]) => id),
				})),
			...(this.s.socialEvenings?.recurrence
				? {
						eveningSchedule: {
							cyclesGenerated: this.s.socialEvenings.recurrence.cycles.length,
							cyclesCompleted: this.s.socialEvenings.recurrence.cycles.filter(
								(c) => c.events.every((e) => e.stage === "closed"),
							).length,
							weeklyDeliveredClasses: allEvenings(this.s)
								.filter((e) => e.cycle !== undefined && e.kind === "class")
								.reduce(
									(sum, e) =>
										sum +
										Object.entries(e.replies).filter(
											([id, reply]) => id !== e.organiserId && reply.delivered,
										).length,
									0,
								),
							weeklyDeliveredMeals: allEvenings(this.s)
								.filter((e) => e.cycle !== undefined && e.kind === "meal")
								.reduce(
									(sum, e) =>
										sum +
										Object.entries(e.replies).filter(
											([id, reply]) => id !== e.organiserId && reply.delivered,
										).length,
									0,
								),
							cyclesLimit: MAX_EVENING_CYCLES,
							finished:
								this.s.socialEvenings.recurrence.cycles.length ===
									MAX_EVENING_CYCLES &&
								this.s.socialEvenings.recurrence.cycles.every((c) =>
									c.events.every((e) => e.stage === "closed"),
								),
							...(this.s.socialEvenings.recurrence.cycles.length <
							MAX_EVENING_CYCLES
								? {
										nextStartsAt:
											this.s.socialEvenings.recurrence.firstStartsAt +
											this.s.socialEvenings.recurrence.cycles.length * 7 * 1440,
									}
								: {}),
						},
					}
				: {}),
			...(this.s.handcart?.observation
				? {
						handcart: {
							canProposeBench: canProposeBench(this.s),
							premiseCount: this.s.handcart.premise ? 1 : 0,
							valuationMode: this.s.handcart.premise
								? "received-consequences@1"
								: "legacy",
							...(this.s.handcart.premise
								? {
										opportunity: {
											from: this.s.handcart.premise.from,
											until: this.s.handcart.premise.until,
											received: this.s.handcart.premise.received,
											origin: structuredClone(this.s.handcart.premise.origin),
										},
									}
								: {}),
							progress: this.s.handcart.progress,
							total: 3,
							returned: !!this.s.handcart.handover,
							completedAt:
								this.s.handcart.progress === 3
									? this.s.handcart.work.at(-1)?.endedAt
									: undefined,
							returnedAt: this.s.handcart.handover?.at,
							bench: this.s.handcart.bench
								? {
										from: this.s.handcart.bench.from,
										until: this.s.handcart.bench.until,
									}
								: undefined,
							latest: [
								this.s.handcart.premise?.event,
								this.s.handcart.observation,
								this.s.handcart.handover,
								...this.s.handcart.work.map((w) => w.event),
								...this.s.handcart.requests.flatMap((q) => [
									q.event,
									q.replyEvent,
								]),
							]
								.filter((e): e is TownEvent => !!e)
								.sort((a, b) => b.at - a.at || b.id - a.id)[0],
							requests: this.s.handcart.requests.length,
						},
					}
				: {}),
			stats: {
				interventionsSpent:
					3 -
					this.s.controls +
					(this.s.socialEvenings?.recurrence?.cycles.filter(
						(c) => c.supportSpent,
					).length ?? 0),
				cartSections: this.s.handcart?.progress ?? 0,
				cartReturned: this.s.handcart?.handover ? 1 : 0,
				benchRequests: this.s.handcart?.requests.length ?? 0,
				hallRepairs: this.s.hall,
				hallSafe: this.s.hallSafe ? 1 : 0,
				tools: this.s.tools,
				totalTools:
					this.s.tools +
					this.s.people.reduce((sum, r) => sum + (r.job?.tools ?? 0), 0),
				methodLearners: this.s.people.filter(
					(r) => (r.person.methods?.rules.length ?? 0) > 0,
				).length,
				taughtNeighbours: this.s.people.filter((r) =>
					taughtByNeighbour(this.s, r),
				).length,
				foodProduced: this.s.produced,
				foodConsumed: this.s.consumed,
				alive: this.s.people.filter((r) => r.person.body.alive).length,
				dead: this.s.people.filter((r) => !r.person.body.alive).length,
				underfed: this.s.people.filter(
					(r) => r.person.body.alive && r.person.body.satiety < 0.1,
				).length,
				lowHealth: this.s.people.filter(
					(r) => r.person.body.alive && r.person.body.health < 0.5,
				).length,
				penniless: this.s.people.filter(
					(r) => r.person.body.alive && r.wealth === 0,
				).length,
				population: this.s.people.length,
				background: this.s.people.length - 8,
			},
			diagnostics: townDiagnostics(this.s),
			weather: this.weather(),
			...(this.s.assistance
				? {
						assistance: {
							actorId: this.s.assistance.actorId,
							origin: this.s.assistance.origin,
							decisionSource: this.s.assistance.decisionSource,
							methodTerms: this.s.assistance.methodTerms,
							decisionId: this.s.assistance.decisionId,
							expiresAt: this.s.assistance.expiresAt,
							received: this.s.assistance.received,
							visitedAt: this.s.assistance.visit?.at,
							opened: this.s.assistance.opened,
							action: this.s.assistance.action,
							result: this.s.assistance.result,
							request: this.s.assistance.request,
							cue: this.s.assistance.proposal.cue,
						},
					}
				: {}),
			player: playerView(this.s),
			controlsRemaining: this.s.controls,
			canShareNews: canShareHallNews(this.s),
			canLendTools: this.s.hall < 12,
			canRestoreBus: !this.s.bus,
			metrics: {
				active: this.s.people.filter((r) => r.job).length,
				hfPeople: this.s.people.filter((r) => r.policy === "hf").length,
				persistentPeople: this.s.people.length,
			},
		};
	}
}
