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
	beginEvening,
	eveningLabel,
	finishEvening,
	interruptEvening,
	updateEvenings,
} from "./evenings.ts";
import {
	cartSupplyBonus,
	finishHandcart,
	interruptHandcart,
	updateHandcart,
} from "./handcart.ts";
import { keyed } from "./hash.ts";
import { placeOf, required } from "./invariants.ts";
import {
	buildOffers,
	socialPreview,
	usesActivitySlot,
	workMinutesFor,
} from "./offers.ts";
import { realizedOutcome } from "./outcomes.ts";
import { personLessons } from "./person-learning.ts";
import { recordSocialContacts } from "./social-contact.ts";
import { known, type Save, SCHEMA } from "./state.ts";
import { townStories } from "./stories.ts";
import { scheduledFoodDelivery } from "./supply.ts";
import { recordTownEvent } from "./town-chronicle.ts";
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
			const familiar = this.s.events
				.filter(
					(e) =>
						e.actorId &&
						known.some((k) => k[0] === e.actorId) &&
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
		const lea = this.actor("lea");
		if (id !== "lea" && presentAt(lea, "hall", this.s.now))
			receiveEvent(lea, note, "heard", `Heard ${note.text}`);
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
		this.event(
			"interrupted",
			`${r.person.name}'s ${j.offer.label.toLowerCase()} ${reason} ${(!r.person.body.alive ? this.s.now - 15 : this.s.now) < j.arrive ? `before arrival was confirmed, last known at ${j.from} while travelling toward ${j.offer.placeId}` : `at ${r.place}`}; reserved resources were returned.`,
			r.person.id,
			r.place,
			[j.event],
		);
		delete r.job;
		r.idleSince = this.s.now;
	}
	prepareRound() {
		if (this.s.pending.length) throw Error("Round has unresolved actors");
		this.s.now += 15;
		this.s.round++;
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
				let attendedLesson = false;
				let socialCompanions = 0;
				let inspectionEvent: number | undefined;
				if (usesActivitySlot(j.offer)) p.reserved--;
				r.place = p.id;
				const evening = finishEvening(this, r);
				const cart = finishHandcart(this, r);
				this.s.tools += j.tools;
				if (j.food) {
					if (evening.handled && !evening.delivered) {
						placeOf(this.s, "market").stock += j.food;
						r.wealth += j.food;
					} else this.s.consumed += j.food;
				}
				if (evening.delivered && j.offer.action === "attend-class") {
					teachHallInspection(r.person, "lea", `evening-lesson-${j.event}`);
					attendedLesson = true;
				}
				if (evening.handled) socialCompanions = evening.companions.length;
				if (cart.handled) socialCompanions = cart.companions.length;
				if (j.offer.action === "grow") {
					placeOf(this.s, "market").stock += 3;
					this.s.produced += 3;
				}
				if (j.offer.action === "supply") {
					const m = placeOf(this.s, "market");
					const supplied = 5 + cartSupplyBonus(this.s, r.person.id, "supply");
					m.stock += supplied;
					this.s.produced += supplied;
				}
				if (j.offer.action === "repair") {
					this.s.hall += 1;
					if (this.s.hall === 12)
						this.event(
							"hall-repaired",
							"Twelve repairs are complete. Timber inspection is still needed before reopening.",
							r.person.id,
							"hall",
							[j.event],
						);
				}

				if (j.offer.action === "open-section") {
					const safe = this.weather() === "Clear" && this.s.hall >= 12;
					this.s.hallSafe = safe;
					inspectionEvent = this.event(
						safe ? "hall-open" : "inspection-failed",
						safe
							? `${r.person.name} checked dry, sound timber and opened the hall.`
							: `${r.person.name} found ${this.weather() === "Clear" ? "dry" : "wet"} timber and ${this.s.hall >= 12 ? "sound" : "loose"} supports. The hall stayed closed.`,
						r.person.id,
						"hall",
						[j.event],
					);
				}
				if (j.offer.action === "keep-closed") {
					this.s.hallSafe = false;
					inspectionEvent = this.event(
						"hall-closed",
						`${r.person.name} kept the hall closed after seeing ${this.weather() === "Clear" ? "dry" : "wet"} timber and ${this.s.hall >= 12 ? "sound" : "loose"} supports.`,
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
					const methodTerms =
						source === "HF 2.2.1"
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
							moisture: this.weather() === "Clear" ? "dry" : "wet",
							support: this.s.hall >= 12 ? "sound" : "loose",
						},
						result: event.text,
						source,
						methodTerms,
					};
				}

				if (j.offer.action === "learn") {
					const teacher = boundary.find((o) => o.person.id === "lea");
					if (
						teacher?.job?.offer.action === "teach" &&
						teacher.person.id !== r.person.id &&
						overlapMinutes(j, teacher, this.s.now) >= 15
					) {
						attendedLesson = true;
						socialCompanions = 1;
						teachHallInspection(r.person, "lea", `lesson-${j.event}`);
						const eid = this.event(
							"lesson",
							`${r.person.name} watched Lea explain when flood-soaked timber is safe.`,
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
							{ ...lesson, actorId: "lea", targetId: r.person.id },
							"heard",
							`Lea explained timber inspection during the practical class.`,
						);
					}
				}
				if (j.offer.action === "work") {
					r.wealth += 2;
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
					(j.offer.action === "open-section" && !this.s.hallSafe) ||
					(evening.handled && !evening.delivered) ||
					(cart.handled && !cart.delivered)
						? ("failed" as const)
						: ("completed" as const);
				const actual = realizedOutcome(j.offer, {
					socialCompanions,
					attendedLesson,
					material:
						j.offer.action === "work"
							? 2
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
					`${r.person.name} ${status === "failed" ? "could not complete" : "finished"} ${j.offer.label.toLowerCase()}.`,
					r.person.id,
					p.id,
					[j.event],
				);
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
			if (!question || requester.person.id === "lea") continue;
			if (this.s.now - question.at > 120) {
				question.status = "missed";
				continue;
			}
			const lea = this.actor("lea");
			if (
				presentAt(lea, "hall", this.s.now) &&
				!receivedRequest(lea, requester)
			)
				receiveEvent(
					lea,
					question.note,
					"saw",
					`Read the hall noticeboard: ${question.note.text}`,
				);
		}
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
		if (presentAt(r, "hall", this.s.now))
			observeHallInspection(r.person, {
				contextId: "hall-inspection",
				sectionId: "hall-floor",
				moisture: this.weather() === "Clear" ? "dry" : "wet",
				support: this.s.hall >= 12 ? "sound" : "loose",
			});
		const choices = this.affordances(id).map((offer) =>
			socialPreview(this.s, id, offer),
		);
		if (!choices.length) throw Error("No legal choices");
		this.offers.set(id, choices);
		const hfRecord =
			policy === "hf"
				? decide(r.person, choices, {
						scarcity: Math.max(0, 1 - r.wealth / 8),
						suggestions:
							r.person.id === "lea"
								? this.s.people
										.filter(
											(o) =>
												o.person.id !== id &&
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
										}))
								: [],
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
			source: policy === "hf" ? "HF 2.2.1" : policy,
		};
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
			...(["open-section", "keep-closed", "ask-inspector"].includes(
				offer.action,
			)
				? {
						inspectionCues: {
							moisture: this.weather() === "Clear" ? "dry" : "wet",
							support: this.s.hall >= 12 ? "sound" : "loose",
						},
					}
				: {}),
		};
		beginEvening(this.s, r);
		if (offer.action === "ask-inspector") this.postQuestion(id, r.job.event);
		this.s.pending = this.s.pending.filter((a) => a !== id);
	}
	weather() {
		return keyed(this.s.seed, Math.floor(this.s.now / 1440), "weather") < 0.35
			? "Rain"
			: "Clear";
	}
	intervene(input: Intervention) {
		if (!this.s.controls) throw Error("No intervention allowance remains");
		if (!["restore-bus", "lend-tools", "share-news"].includes(input.kind))
			throw Error("Unknown intervention");
		if (input.kind === "restore-bus" && this.s.bus)
			throw Error("Bus already restored");
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
				if (!r.person.body.alive || r.person.body.asleep) continue;
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
						this.s.people.find((o) => o.person.id === rel.otherId)?.person
							.name ?? rel.otherId,
					trust: rel.trust,
					summary: rel.roles.join(", "),
					origin: ((r.person.id === "ada" && rel.otherId === "lea") ||
					(r.person.id === "lea" && rel.otherId === "ada")
						? "initial"
						: "observed") as "initial" | "observed",
				})),
				invitations: (this.s.socialEvenings?.events ?? [])
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
							title: eveningLabel(e),
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
			evenings: (this.s.socialEvenings?.events ?? [])
				.filter((e) => e.notice)
				.map((e) => ({
					id: e.id,
					kind: e.kind,
					organiserId: e.organiserId,
					title: eveningLabel(e),
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
			...(this.s.handcart?.observation
				? {
						handcart: {
							progress: this.s.handcart.progress,
							total: 3,
							returned: !!this.s.handcart.handover,
							bench: this.s.handcart.bench
								? {
										from: this.s.handcart.bench.from,
										until: this.s.handcart.bench.until,
									}
								: undefined,
							latest: [
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
				taughtNeighbours: this.s.people.filter(
					(r) =>
						r.person.id !== "lea" && (r.person.methods?.rules.length ?? 0) > 0,
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
			controlsRemaining: this.s.controls,
			metrics: {
				active: this.s.people.filter((r) => r.job).length,
				hfPeople: this.s.people.filter((r) => r.policy === "hf").length,
				persistentPeople: this.s.people.length,
			},
		};
	}
}
