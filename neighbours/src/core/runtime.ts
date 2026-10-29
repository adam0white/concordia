import type {
	ActionRequest,
	ActionResolution,
	DeepReadonly,
	HostRequest,
	Input,
	LifecycleReceipt,
	ObservedOutcome,
	StepResult,
} from "@adam0white/human-framework";
import type {
	Intervention,
	TownEvent,
	TownRuntime,
	TownView,
} from "../contracts";
import {
	observeHallInspection,
	teachHallInspection,
} from "../experiments/inspection.ts";
import { reviewOffers } from "./activity-reviews.ts";
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
	type PhysicalWitness,
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
import { canonicalHash } from "./hf4-canonical.ts";
import { observeFacts } from "./hf4-evidence.ts";
import { physicalOffer } from "./hf4-offers.ts";
import {
	minutePercept,
	type OwnerArchive,
	type OwnerJournalArchive,
	type TownRunOwner,
} from "./hf4-owner.ts";
import { MINUTE, nativeMilliseconds } from "./hf4-run.ts";
import type { Affordance, DecisionRecord, Suggestion } from "./host-types.ts";
import { moodRead } from "./impression.ts";
import { placeOf, required } from "./invariants.ts";
import { buildOffers, usesActivitySlot, workMinutesFor } from "./offers.ts";
import { realizedOutcome } from "./outcomes.ts";
import { personLessons } from "./person-learning.ts";
import {
	finishPrivateConversation,
	placeName,
	playerApplied,
	playerDecided,
	playerIntervene,
	playerJobEnded,
	playerRound,
	playerView,
	predictAnswers,
	predictSpeech,
	privateConversationOffers,
} from "./player.ts";
import { botchedUnderProtest } from "./protest.ts";
import { recordSocialContacts } from "./social-contact.ts";
import { type Resident, type Save, SCHEMA } from "./state.ts";
import { townStories } from "./stories.ts";
import { scheduledFoodDelivery } from "./supply.ts";
import { repairHolds, timberMoisture, weatherTimber } from "./timber.ts";
import { recordTownEvent } from "./town-chronicle.ts";
import { actionWords, ingWords, jobLine } from "./voicing.ts";

function awakeHallNewsListener(r: Save["people"][number]): boolean {
	return (
		r.owner.actor(r.id).body.alive &&
		!r.owner.actor(r.id).body.asleep &&
		r.job?.offer.mode !== "sleep"
	);
}
export function canShareHallNews(s: Save): boolean {
	return s.hall < 12 && s.people.some(awakeHallNewsListener);
}
export type PhysicalSave = Omit<Save, "owner" | "people"> & {
	people: Omit<Resident, "owner">[];
};
export type NativeTownArchive = {
	format: "neighbours-native";
	schema: typeof SCHEMA;
	hf: "4.10.0";
	physical: PhysicalSave;
	owner: OwnerArchive;
	boundary: {
		targetAt: number | null;
		resolutions: Input[];
		projectedRevision: number;
		requests: DeepReadonly<HostRequest>[];
		complete: boolean;
		worldDirty: boolean;
		witnesses: Omit<PhysicalWitness, "owner">[];
	};
	inputs: Record<string, unknown>[];
};
export type JournalTownArchive = Omit<NativeTownArchive, "format" | "owner"> & {
	format: "neighbours-journal";
	owner: OwnerJournalArchive;
};
export class Runtime implements TownRuntime {
	s: Save;
	records = new Map<string, DecisionRecord>();
	offers = new Map<string, Affordance[]>();
	constructor(s: Save) {
		this.s = s;
		this.projectedRevision = s.owner.revision;
	}
	actor(id: string) {
		const p = this.s.people.find((p) => p.id === id);
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
				this.s.people.filter((r) => r.known).map((r) => r.id),
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
		const learnedDampness = r.owner
			.actor(r.id)
			.methods?.rules.some((rule) =>
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
			`${r.name} left a question on the hall noticeboard: “${question}”`,
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
			if (instructor.id !== id && presentAt(instructor, "hall", this.s.now))
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
		if (this.s.now >= j.arrive)
			r.place = required(j.offer.placeId, "Missing destination");

		const travelling = this.s.now < j.arrive;
		const stopped = this.event(
			"interrupted",
			// Towns begun under HF 2.8.0 say it in plain words; older saves keep their recorded wording exactly.
			this.s.together
				? `${r.name} stopped ${travelling ? `on the way to ${placeName(this.s, required(j.offer.placeId, "Missing destination"))} before starting to ${actionWords(j.offer.label)}` : `${ingWords(j.offer.label)} at ${placeName(this.s, r.place)}`}${reason === "stopped" ? "" : " and did something else"}.`
				: `${r.name}'s ${j.offer.label.toLowerCase()} ${reason} ${travelling ? `before arrival was confirmed, last known at ${j.from} while travelling toward ${j.offer.placeId}` : `at ${r.place}`}; reserved resources were returned.`,
			r.id,
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
					o.id !== r.id &&
					o.question?.status === "waiting" &&
					receivedRequest(r, o) &&
					presentAt(o, "hall", this.s.now),
			)
			.map((o) => ({
				voiceId: o.id,
				affordanceId: `answer-inspection:${o.id}`,
				strength: 0.5,
				appeal: "competence" as const,
				since: o.question?.at,
			}));
	}
	private targetAt: number | null = null;
	private resolutions: Input[] = [];
	private projectedRevision: number;
	private boundaryRequests: DeepReadonly<HostRequest>[] = [];
	private wireHistory: Record<string, unknown>[] = [];
	private complete = true;
	private worldDirty = false;
	private witnesses: Omit<PhysicalWitness, "owner">[] = [];
	private recording = true;
	static hydrate(archive: NativeTownArchive, owner: TownRunOwner): Runtime {
		const physical = structuredClone(archive.physical);
		const runtime = new Runtime({
			...physical,
			owner,
			people: physical.people.map((person) => ({ ...person, owner })),
		});
		runtime.targetAt = archive.boundary.targetAt;
		runtime.resolutions = structuredClone(archive.boundary.resolutions);
		runtime.projectedRevision = archive.boundary.projectedRevision;
		runtime.boundaryRequests = structuredClone(archive.boundary.requests);
		runtime.complete = archive.boundary.complete;
		runtime.worldDirty = archive.boundary.worldDirty;
		runtime.witnesses = structuredClone(archive.boundary.witnesses);
		runtime.wireHistory = structuredClone(archive.inputs);
		return runtime;
	}
	private captureWitnesses(): void {
		this.witnesses = structuredClone(
			this.s.people.map((person) => ({
				id: person.id,
				name: person.name,
				place: person.place,
				...(person.job ? { job: person.job } : {}),
				...(person.idleSince === undefined
					? {}
					: { idleSince: person.idleSince }),
			})),
		);
	}
	private nativeInput<K extends Input["kind"]>(
		kind: K,
		payload: Extract<Input, { kind: K }>["payload"],
		at: number,
	): Input {
		return {
			id: this.s.owner.allocate("physical-receipt"),
			at,
			source: { type: "host", id: "neighbours" },
			kind,
			payload,
		} as Input;
	}
	private physicalState(): PhysicalSave {
		const { owner, people, ...state } = this.s;
		void owner;
		return {
			...state,
			people: people.map(({ owner, ...resident }) => {
				void owner;
				return resident;
			}),
		};
	}
	private worldChange() {
		this.worldDirty = false;
		const expectedRevision = this.projectedRevision++;
		return {
			expectedRevision,
			revision: this.projectedRevision,
			put: [],
			remove: [],
			hostState: {
				schema: SCHEMA,
				at: this.s.now * MINUTE,
				physicalHash: canonicalHash(this.physicalState()),
			},
		};
	}
	private clock(at: number): void {
		if (at < this.s.now * MINUTE - 0.00001)
			throw Error("Native clock moved backward");
		const elapsed = at / MINUTE - this.s.now;
		weatherTimber(this.s, this.weather(), elapsed);
		this.s.now = at / MINUTE;
	}
	/** External host lifecycle facts enter the same complete replay journal.
	 * This is no player control and does not author a natural death. */
	receiveLifecycle(receipt: LifecycleReceipt): void {
		if (this.s.owner.pending.length)
			throw Error(
				"Resolve the reached native boundary before external lifecycle ingress",
			);
		if (receipt.type !== "death")
			throw Error("Only a source-bound death receipt is supported here");
		if (!this.s.owner.actor(receipt.person.id).body.alive)
			throw Error("Death already recorded");
		const inputId = this.s.owner.enqueue("lifecycle.received", receipt);
		const result = this.s.owner.advance(this.s.owner.at + 1);
		const accepted = required(
			result.events.find(
				(event) =>
					event.person === receipt.person.id &&
					event.data.kind === "body-change" &&
					event.data.change.kind === "died" &&
					event.data.change.discoveredAt === event.at &&
					event.causeIds.includes(inputId),
			),
			"Native Run did not accept the lifecycle source",
		);
		if (this.s.owner.actor(receipt.person.id).body.alive)
			throw Error("Native lifecycle did not establish death");
		if (this.recording)
			this.wireHistory.push({
				op: "lifecycle",
				receipt: structuredClone(receipt),
				accepted: {
					eventId: accepted.id,
					person: receipt.person.id,
					at: accepted.at,
					evidenceId: receipt.basis.evidence.id,
				},
			});
		this.acceptStep(result);
	}
	private recordDeath(
		resident: Resident,
		at: number,
		sourceEvent: string,
	): void {
		if (resident.lifeEvent?.kind === "death") return;
		const minute = at / MINUTE;
		const place = resident.job
			? locatedAt(
					resident,
					resident.job.offer.placeId ?? resident.place,
					minute,
				)
				? resident.job.offer.placeId
				: undefined
			: resident.place;
		const witnesses = place
			? this.s.people
					.filter(
						(other) =>
							other.id !== resident.id &&
							locatedAt(other, place, minute) &&
							this.s.owner.availableAt(other.id, at),
					)
					.map((other) => other.id)
			: [];
		this.clock(at);
		if (resident.job) {
			this.interruptJob(resident.id, "died");
			this.worldDirty = true;
		}
		const event = this.lifecycleEvent(
			"death",
			`${resident.name} was found dead.`,
			resident.id,
			place ?? resident.place,
		);
		resident.lifeEvent = event;
		for (const witness of witnesses)
			this.s.owner.observe(
				witness,
				minutePercept(`town:${event.id}:${witness}`, minute, {
					channel: "saw",
					kind: "death",
					actorId: resident.id,
					targetId: resident.id,
					...(place ? { placeId: place } : {}),
					salience: 0.9,
					valence: -0.8,
					summary: `Saw ${event.text}`,
					provenance: [`town-event:${event.id}`, `native-death:${sourceEvent}`],
				}),
			);
	}
	private reconcileHost(): void {
		for (const resident of this.s.people)
			if (
				!resident.owner.actor(resident.id).body.alive &&
				resident.lifeEvent?.kind !== "death"
			)
				throw Error("Native death lacks its public source boundary");
		for (const resident of this.s.people)
			for (const event of this.s.events) {
				if (
					(this.s.owner.attention(
						resident.id,
						`town:${event.id}:${resident.id}`,
					) ?? 0) > 0 &&
					!resident.received?.some((item) => item.id === event.id)
				)
					resident.received = [
						...(resident.received ?? []),
						{ ...event, targetId: resident.id },
					].slice(-12);
			}
		const assistance = this.s.assistance;
		if (assistance && !assistance.received)
			assistance.received =
				(this.s.owner.attention(
					assistance.actorId,
					`town:${assistance.request.id}:${assistance.actorId}`,
				) ?? 0) > 0;
		const premise = this.s.handcart?.premise;
		if (premise && !premise.received && premise.event.targetId)
			premise.received =
				(this.s.owner.attention(
					premise.event.targetId,
					`town:${premise.event.id}:${premise.event.targetId}`,
				) ?? 0) > 0;
		recordSocialContacts(this);
		updateEvenings(this);
		updateHandcart(this);
		playerRound(this);
		for (const requester of this.s.people.filter(
			(person) => person.question?.status === "waiting",
		)) {
			const question = requester.question;
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
	}
	prepareBoundary(): {
		at: number;
		done: boolean;
		requests: DeepReadonly<HostRequest>[];
	} {
		if (this.s.pending.length) throw Error("Physical requests are unresolved");
		if (this.recording) this.wireHistory.push({ op: "prepare" });
		if (this.targetAt === null) {
			this.complete = false;
			this.targetAt = (480 + 15 * (this.s.round + 1)) * MINUTE;
			this.s.round++;
		}
		const target = this.targetAt;
		let result: DeepReadonly<StepResult>;
		if (this.resolutions.length) {
			result = this.s.owner.advance(this.s.owner.at, this.resolutions);
			this.resolutions = [];
		} else if (this.s.owner.pending.length) {
			this.boundaryRequests = [...this.s.owner.pending];
			if (!this.witnesses.length) this.captureWitnesses();
			this.s.pending = this.boundaryRequests.map((request) => request.id);
			return {
				at: this.s.owner.at,
				done: false,
				requests: this.boundaryRequests,
			};
		} else {
			this.reconcileHost();
			if (this.worldDirty) {
				const expectedRevision = this.s.owner.revision;
				this.s.owner.enqueue("world.changed", {
					expectedRevision,
					revision: expectedRevision + 1,
					put: [],
					remove: [],
					hostState: {
						schema: SCHEMA,
						at: nativeMilliseconds(this.s.now),
						physicalHash: canonicalHash(this.physicalState()),
					},
				});
				this.worldDirty = false;
			}
			for (const r of this.s.people) {
				if (!r.owner.actor(r.id).body.alive) continue;
				if (presentAt(r, "hall", this.s.now)) {
					noticeLooseHall(this.s, r);
					observeHallInspection(r, {
						contextId: "hall-inspection",
						sectionId: "hall-floor",
						moisture: this.moisture(),
						support: this.s.hall >= 12 ? "sound" : "loose",
					});
				}
				observeAssistance(this.s, r);
				const offers = r.job
					? reviewOffers(this.s, r)
					: buildOffers(this.s, r.id);
				if (!offers.length) continue;
				for (const suggestion of this.instructorSuggestions(r)) {
					const adviceId = `inspection-request:${suggestion.voiceId}:${r.id}:${suggestion.since}`;
					if (
						!r.owner
							.actor(r.id)
							.will.advice.some((advice) => advice.adviceId === adviceId)
					)
						this.s.owner.enqueue("suggestion.received", {
							person: r.id,
							received: {
								kind: "ordinary",
								suggestion: {
									...suggestion,
									adviceId,
									since: nativeMilliseconds(suggestion.since ?? this.s.now),
								},
							},
						});
				}
				const inputs = this.s.owner.offerInputs(r.id, offers);
				for (const input of inputs) this.s.owner.queue(input);
				const book = inputs[0];
				if (!r.job && book?.kind === "offers.received")
					this.s.owner.enqueue("decision.requested", {
						person: r.id,
						reason: "ordinary town opportunities",
						treatment: "ordinary",
						offerRevision: book.payload.revision,
					});
			}
			result = this.s.owner.advance(target);
		}
		this.acceptStep(result);
		if (result.reachedUntil && result.at === target && !this.s.pending.length) {
			if (loosenHall(this.s))
				this.event(
					"hall-loosened",
					"A repaired section of the hall came loose as the wet timber moved.",
					undefined,
					"hall",
				);
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
			this.targetAt = null;
			this.complete = true;
		}
		return {
			at: result.at,
			done: this.complete,
			requests: this.boundaryRequests,
		};
	}
	private acceptStep(result: DeepReadonly<StepResult>): void {
		// A lifecycle event can occur before the requested time without needing a
		// physical action reply. Release the host job at its actual public event time.
		for (const event of [...result.events].sort(
			(a, b) =>
				a.at - b.at ||
				(a.data.kind === "lifecycle" ? -1 : 0) -
					(b.data.kind === "lifecycle" ? -1 : 0),
		)) {
			const dead =
				event.data.kind === "lifecycle" && event.data.receipt.type === "death"
					? event.data.receipt.person.id
					: event.data.kind === "body-change" &&
							event.data.change.kind === "died"
						? event.person
						: undefined;
			if (dead) this.recordDeath(this.actor(dead), event.at, event.id);
		}
		this.clock(result.at);
		this.projectedRevision = this.s.owner.revision;
		for (const event of result.events)
			if (event.person && event.data.kind === "decision") {
				const r = this.actor(event.person);
				const record = {
					...event.data.decision,
					narration: event.narration.map((line) => line.text).join(" "),
				};
				r.record = record;
				r.decision = {
					chosen: record.chosenAffordanceId ?? "",
					decidedAt: event.at / MINUTE,
					round: this.s.round,
					label:
						this.s.owner
							.offers(r.id)
							.find((offer) => offer.id === record.chosenAffordanceId)?.label ??
						"No activity chosen",
					reason: record.narration,
					options: record.considered.map((option) => ({
						id: option.affordanceId,
						label: option.label ?? option.action,
						utility: option.utility,
					})),
					source: HF_SOURCE,
					offeredCount: this.s.owner.offers(r.id).length,
					recordedCount: record.considered.length,
				};
				playerDecided(
					this,
					r,
					record,
					this.s.owner.offers(r.id).map(physicalOffer),
				);
			}
		this.reconcileHost();
		this.boundaryRequests =
			result.boundary.type === "world-required"
				? [...result.boundary.requests]
				: [];
		this.s.pending = this.boundaryRequests.map((request) => request.id);
		if (this.boundaryRequests.length) this.captureWitnesses();
		else this.witnesses = [];
	}
	private settleImmediateBoundary(): void {
		if (this.s.owner.last) this.acceptStep(this.s.owner.last);
		for (let budget = 0; budget < 10000; budget++) {
			if (this.s.owner.pending.length) {
				this.boundaryRequests = [...this.s.owner.pending];
				this.s.pending = this.boundaryRequests.map((request) => request.id);
				for (const request of this.boundaryRequests)
					this.apply(request.id, this.choose(request.id));
			}
			if (!this.resolutions.length) return;
			const result = this.s.owner.advance(this.s.owner.at, this.resolutions);
			this.resolutions = [];
			this.acceptStep(result);
		}
		throw Error("Immediate speech boundary exceeded its native request budget");
	}
	private completeConversation(person: string): void {
		const until = this.s.owner.at + MINUTE;
		for (let budget = 0; budget < 10000; budget++) {
			if (this.s.owner.pending.length) {
				this.boundaryRequests = [...this.s.owner.pending];
				this.s.pending = this.boundaryRequests.map((request) => request.id);
				for (const request of this.boundaryRequests)
					this.apply(request.id, this.choose(request.id));
			}
			const result = this.resolutions.length
				? this.s.owner.advance(this.s.owner.at, this.resolutions)
				: this.s.owner.advance(until);
			this.resolutions = [];
			this.acceptStep(result);
			if (
				result.at === until &&
				!this.s.owner.pending.length &&
				!this.actor(person).privateConversation
			)
				return;
		}
		throw Error("Conversation exceeded the bounded native request budget");
	}
	roundComplete() {
		return (
			this.complete &&
			this.s.pending.length === 0 &&
			this.resolutions.length === 0
		);
	}
	getChoices(requestId: string) {
		const request = this.boundaryRequests.find((item) => item.id === requestId);
		if (!request) throw Error("Unknown physical request");
		if (request.kind === "communication")
			return [
				{ id: "deliver", label: "Deliver the actual emitted communication" },
			];
		if (request.stage !== "start")
			return [
				{
					id: request.offerId,
					label: this.actor(request.person).job?.offer.label ?? request.offerId,
				},
			];
		return this.s.owner
			.offers(request.person)
			.map((offer) => ({ id: offer.id, label: offer.label }));
	}
	choose(requestId: string) {
		const request = this.boundaryRequests.find((item) => item.id === requestId);
		if (!request) throw Error("Unknown physical request");
		return request.kind === "action" ? request.offerId : "deliver";
	}
	apply(requestId: string, actionId: string): void {
		if (!this.s.pending.includes(requestId))
			throw Error("Request is not pending");
		const request = this.boundaryRequests.find((item) => item.id === requestId);
		if (!request) throw Error("Missing native request");
		if (this.recording)
			this.wireHistory.push({ op: "apply", requestId, actionId });
		if (request.kind === "communication") {
			if (actionId !== "deliver")
				throw Error("Unknown communication disposition");
			const speaker = this.actor(request.speaker);
			const received = request.recipients
				.filter((id) => presentAt(this.actor(id), speaker.place, this.s.now))
				.map((id) => ({
					recipient: id,
					evidenceId: `communication:${request.id}:${id}`,
					attention: 1,
					itemIds: request.items.map((item) => item.id),
				}));
			this.resolutions.push(
				this.nativeInput(
					"communication.resolved",
					{
						requestId: request.id,
						requestHash: request.requestHash,
						worldRevision: this.projectedRevision,
						speaker: request.speaker,
						emittedItemIds: request.items.map((item) => item.id),
						received,
					},
					request.boundaryAt,
				),
			);
		} else {
			if (actionId !== request.offerId)
				throw Error("Action differs from native selected offer");
			const r = this.actor(request.person);
			let disposition: ActionResolution["disposition"];
			let outcome: ObservedOutcome | undefined;
			if (request.stage === "start") {
				const native = this.s.owner
					.offers(r.id)
					.find((offer) => offer.id === request.offerId);
				if (!native) throw Error("Native selected an unregistered offer");
				const offer = physicalOffer(native);
				const feasible = this.affordances(r.id).some(
					(candidate) => candidate.id === offer.id,
				);
				if (r.job || !feasible) {
					disposition = "rejected";
				} else {
					this.startPhysical(r, offer, request);
					disposition = "accepted";
				}
			} else if (request.stage === "interrupt") {
				const job = r.job;
				if (!job || job.activityId !== request.activityId)
					throw Error("Interrupted job identity differs");
				this.interruptJob(r.id, "changed plan at an HF boundary");
				disposition = "interrupted";
				outcome = {
					activityId: request.activityId,
					offerId: job.offer.id,
					actionId: job.offer.action,
					start: job.startedAt,
					end: request.boundaryAt,
					status: "interrupted",
					evidenceId: `interrupted:${request.id}`,
					actual: { exposures: [], observedProgress: [], material: 0 },
					fulfills: [],
					advances: [],
				};
			} else {
				if (r.job?.activityId !== request.activityId)
					throw Error("Finished job identity differs");
				outcome = this.finishPhysical(r, request);
				disposition = outcome.status === "failed" ? "failed" : "completed";
			}
			const revision = this.projectedRevision;
			this.resolutions.push(
				this.nativeInput(
					"action.resolved",
					{
						requestId: request.id,
						requestHash: request.requestHash,
						person: r.id,
						activityId: request.activityId,
						stage: request.stage,
						worldRevision: revision,
						disposition,
						observations: [],
						...(outcome ? { outcome } : {}),
						...(disposition === "rejected"
							? {}
							: { worldChange: this.worldChange() }),
					},
					request.boundaryAt,
				),
			);
		}
		this.s.pending = this.s.pending.filter((id) => id !== requestId);
	}

	startPhysical(
		r: Resident,
		offer: Affordance,
		request: DeepReadonly<ActionRequest>,
	): void {
		const id = r.id;
		const selected =
			r.owner
				.actor(id)
				.trace.find(
					(record) => record.id === r.owner.actor(id).activity?.decisionId,
				) ?? r.owner.actor(id).trace.at(-1);
		if (!selected || selected.chosenAffordanceId !== offer.id)
			throw Error("No matching actual Run decision for this action");
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
			personId: r.id,
			activityId: request.activityId,
			startedAt: request.boundaryAt,
			offer,
			end: (request.boundaryAt + nativeMilliseconds(offer.duration)) / MINUTE,
			arrive: (request.boundaryAt + nativeMilliseconds(travel)) / MINUTE,
			from: r.place,
			event: this.event(
				"started",
				`${r.name} started to ${actionWords(offer.label)}.`,
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
	}

	finishPhysical(
		r: Resident,
		request: DeepReadonly<ActionRequest>,
		boundary: readonly PhysicalWitness[] = this.witnesses.map((person) => ({
			...person,
			owner: this.s.owner,
		})),
	): ObservedOutcome {
		if (!r.job) throw Error("Missing physical job at finish");
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
		const cart = finishHandcart(this, r, boundary);
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
				? this.s.people.find((o) => o.id === classOrganiser)
				: undefined;
			if (
				organiser &&
				retainsInspectionMethod(organiser.owner.actor(organiser.id))
			)
				teachHallInspection(r, organiser.id, `evening-lesson-${j.event}`);
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
			const supplied = 5 + cartSupplyBonus(this.s, r.id, "supply");
			m.stock += supplied;
			this.s.produced += supplied;
		}
		if (botched) {
			// A botched job does nothing to the world.
		} else if (j.offer.action === "repair" && !repairHolds(this.s, j.event))
			this.event(
				"repair-slipped",
				`${r.name}’s repair on the damp timber did not hold.`,
				r.id,
				"hall",
				[j.event],
			);
		else if (j.offer.action === "repair") {
			this.s.hall += 1;
			settleHallGoals(this.s);
			if (this.s.hall === 12)
				this.event(
					"hall-repaired",
					"All twelve repairs are complete. Someone still needs to inspect the timber before the hall can reopen.",
					r.id,
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
					? `${r.name} found dry timber with sound supports and opened the hall.`
					: `${r.name} found ${this.moisture()} timber and ${this.s.hall >= 12 ? "sound" : "loose"} supports. The hall stayed closed.`,
				r.id,
				"hall",
				[j.event],
			);
		}
		if (j.offer.action === "keep-closed" && !assistance) {
			this.s.hallSafe = false;
			inspectionEvent = this.event(
				"hall-closed",
				`${r.name} kept the hall closed after seeing ${this.moisture()} timber and ${this.s.hall >= 12 ? "sound" : "loose"} supports.`,
				r.id,
				"hall",
				[j.event],
			);
		}
		if (j.offer.action === "answer-inspection") {
			const learner = this.s.people.find((o) => o.id === j.offer.targetId);
			if (
				learner?.question?.status === "waiting" &&
				presentAt(learner, "hall", this.s.now) &&
				overlapMinutes(
					j,
					required(
						boundary.find((o) => o.id === learner.id),
						"Learner boundary missing",
					),
					this.s.now,
				) >= 15 &&
				presentAt(r, "hall", this.s.now) &&
				receivedRequest(r, learner)
			) {
				socialCompanions = 1;
				const questionId = learner.question.event;
				teachHallInspection(learner, r.id, `hall-explanation-${j.event}`);
				const lessonId = this.event(
					"hall-explanation",
					`${r.name} showed ${learner.name} how dry, sound timber differs from wet timber, and when another opinion is needed.`,
					r.id,
					"hall",
					[questionId, j.event],
				);
				const lesson = required(
					this.s.events.find((e) => e.id === lessonId),
					"Explanation event missing",
				);
				lesson.targetId = learner.id;
				receiveEvent(
					learner,
					lesson,
					"social",
					`${r.name} explained the timber check to me beside the hall.`,
				);
				learner.question = {
					...learner.question,
					status: "answered",
					answeredBy: r.id,
					lessonEvent: lessonId,
				};
			} else
				this.event(
					"missed-encounter",
					`${r.name} went to explain the timber check, but the explanation did not reach the person who asked.`,
					r.id,
					"hall",
					[j.event],
				);
		}
		if (
			(j.offer.action === "open-section" || j.offer.action === "keep-closed") &&
			inspectionEvent !== undefined
		) {
			const event = required(
				this.s.events.find((e) => e.id === inspectionEvent),
				"Inspection event missing",
			);
			const record = r.owner
				.actor(r.id)
				.trace.find((t) => t.id === r.owner.actor(r.id).activity?.decisionId);
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
					o.id !== r.id &&
					o.job?.offer.action === "teach" &&
					overlapMinutes(j, o, this.s.now) >= 15,
			);
			if (teacher?.job) {
				attendedLesson = true;
				socialCompanions = 1;
			}
			// The class passes on only what its teacher actually retains.
			if (
				teacher?.job &&
				retainsInspectionMethod(teacher.owner.actor(teacher.id))
			) {
				teachHallInspection(r, teacher.id, `lesson-${j.event}`);
				const eid = this.event(
					"lesson",
					`${r.name} watched ${teacher.name} explain when flood-soaked timber is safe.`,
					r.id,
					"school",
					[j.event, teacher.job.event],
				);
				const lesson = required(
					this.s.events.find((e) => e.id === eid),
					"Lesson event missing",
				);
				receiveEvent(
					r,
					{ ...lesson, actorId: teacher.id, targetId: r.id },
					"heard",
					`${teacher.name} explained timber inspection during the practical class.`,
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
					o.id !== r.id &&
					o.job &&
					(o.job.offer.action === "talk" || o.job.offer.action === "gather") &&
					overlapMinutes(j, o, this.s.now) >= 15,
			);

			socialCompanions = j.socialContacts?.length ?? 0;
			// Preview company never enters the physical activity. HF finish must not count it again.
			// HF4 alongside/participants are expectations; physical companions enter only actual evidence.
			if (
				j.offer.action === "gather" &&
				this.s.firstMealAt === null &&
				companions.some((o) => o.job?.offer.action === "gather")
			) {
				this.s.firstMealAt = this.s.now;
				this.event(
					"shared-meal",
					`${r.name} shared the first meal in the reopened hall.`,
					r.id,
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
			(cart.handled && !cart.delivered && !cart.pending)
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
		const psychological = Object.fromEntries(
			Object.entries(actual.needs).filter(
				([key]) => !["food", "water", "sleep", "rest", "relief"].includes(key),
			),
		);
		const outcome: ObservedOutcome = {
			activityId: request.activityId,
			offerId: j.offer.id,
			actionId: j.offer.action,
			...(j.offer.targetId ? { target: j.offer.targetId } : {}),
			start: j.startedAt,
			end: request.boundaryAt,
			status,
			evidenceId: `physical:${request.id}`,
			actual: {
				exposures: [],
				observedProgress: [],
				psychological,
				material: actual.material,
				...(status === "completed"
					? {
							consumed: {
								...(actual.needs.food === undefined
									? {}
									: { food: actual.needs.food }),
								...(actual.needs.water === undefined
									? {}
									: { water: actual.needs.water }),
							},
						}
					: {}),
			},
			fulfills: status === "completed" ? (j.offer.fulfills ?? []) : [],
			advances: status === "completed" ? (j.offer.advances ?? []) : [],
		};

		const eid = this.event(
			status === "failed" ? "attempt-failed" : "completed",
			botched
				? `${jobLine(r.name, j.offer.label, true)} The work was done under protest and went wrong.`
				: jobLine(r.name, j.offer.label, status === "failed"),
			r.id,
			p.id,
			[j.event],
		);
		playerJobEnded(this.s, j.event, eid, status);
		if (status === "completed")
			finishPrivateConversation(this, r, j.offer.id, eid);
		for (const other of boundary
			.filter((o) => o.id !== r.id && presentAt(o, p.id, this.s.now))
			.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
			.slice(0, 12))
			observeFacts(other.owner, other.id, [
				{
					at: this.s.now,
					channel: "saw",
					kind: "neighbour-completed",
					actorId: r.id,
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
		return outcome;
	}

	affordances(id: string): Affordance[] {
		const r = this.actor(id);
		return r.job
			? reviewOffers(this.s, r)
			: r.privateConversation
				? privateConversationOffers(r)
				: buildOffers(this.s, id);
	}

	getObservation(id: string) {
		const r = this.actor(id);
		const location =
			r.job && r.job.arrive <= this.s.now
				? (r.job.offer.placeId ?? r.place)
				: r.place;
		return JSON.stringify({
			at: this.s.now,
			name: r.name,
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
				.map((o) => o.name)
				.slice(0, 16),
		});
	}
	acceptExternalChoice(): never {
		throw Error(
			"Historical model/table policies cannot control a current HF4 Run",
		);
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
		this.recording = false;
		try {
			this.applyIntervention(input);
			this.wireHistory.push({ op: "intervene", input: structuredClone(input) });
		} finally {
			this.recording = true;
		}
	}
	private applyIntervention(input: Intervention) {
		if (
			input.kind === "player-move" ||
			input.kind === "player-speak" ||
			input.kind === "player-work" ||
			input.kind === "player-help" ||
			input.kind === "player-private"
		) {
			if (this.s.pending.length) throw Error("Round has unresolved actors");
			playerIntervene(this, input, (r) => this.instructorSuggestions(r));
			if (input.kind === "player-speak" || input.kind === "player-private")
				this.settleImmediateBoundary();
			if (input.kind === "player-private" && input.actorId)
				this.completeConversation(input.actorId);
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
				: input.kind === "restore-bus"
					? "The town bus service has been restored."
					: "The town has borrowed three extra tools.",
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
				r.owner.observe(
					r.id,
					minutePercept(`town:${event.id}:${r.id}`, this.s.now, {
						channel: "told",
						kind: "hall-news",
						actorId: "town-bulletin",
						targetId: r.id,
						salience: 0.8,
						advice: [
							{
								adviceId: `hall-news:${event.id}:${r.id}`,
								action: "repair",
								strength: 0.7,
							},
						],
						claims: [{ prop: "hall-needs-help", value: true, confidence: 0.9 }],
						summary: event.text,
					}),
				);
			}
		}
	}
	step(): void {
		for (let boundary = 0; boundary < 10000; boundary++) {
			const next = this.prepareBoundary();
			for (const request of next.requests)
				this.apply(request.id, this.choose(request.id));
			if (this.roundComplete()) return;
		}
		throw Error("Town round exceeded the bounded physical request budget");
	}

	inspect(id: string) {
		const r = this.actor(id);
		return {
			person: r.owner.inspect(r.id, [
				"summary",
				"body",
				"needs",
				"agenda",
				"methods",
				"events",
			]),
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
	export(): NativeTownArchive {
		return structuredClone({
			format: "neighbours-native",
			schema: SCHEMA,
			hf: "4.10.0",
			physical: this.physicalState(),
			owner: this.s.owner.export(),
			boundary: {
				targetAt: this.targetAt,
				resolutions: this.resolutions,
				projectedRevision: this.projectedRevision,
				requests: this.boundaryRequests,
				complete: this.complete,
				worldDirty: this.worldDirty,
				witnesses: this.witnesses,
			},
			inputs: structuredClone(this.wireHistory),
		});
	}
	/** SCOPE: local files only. Native/device/recording exports retain their complete format. */
	exportJournal(): JournalTownArchive {
		return structuredClone({
			format: "neighbours-journal",
			schema: SCHEMA,
			hf: "4.10.0",
			physical: this.physicalState(),
			owner: this.s.owner.exportJournal(),
			boundary: {
				targetAt: this.targetAt,
				resolutions: this.resolutions,
				projectedRevision: this.projectedRevision,
				requests: this.boundaryRequests,
				complete: this.complete,
				worldDirty: this.worldDirty,
				witnesses: this.witnesses,
			},
			inputs: structuredClone(this.wireHistory),
		});
	}
	private needs(id: string): Record<string, number> {
		const person = this.s.owner.inspect(id, ["needs"]).people[0];
		if (person?.kind !== "host") throw Error("Missing needs reading");
		const part = person.parts.find((item) => item.select === "needs");
		if (part?.select !== "needs") throw Error("Missing needs reading");
		return Object.fromEntries(
			part.value.map((need) => [need.id, need.urgency]),
		);
	}

	view(): TownView {
		return {
			schema: SCHEMA,
			seed: this.s.seed,
			now: this.s.now,
			day: Math.floor(this.s.now / 1440) + 1,
			people: this.s.people.map((r) => ({
				id: r.id,
				name: r.name,
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
				lifeState: !r.owner.actor(r.id).body.alive
					? "dead"
					: r.owner.actor(r.id).body.downed
						? "downed"
						: r.owner.actor(r.id).affect.crisis.active
							? "break"
							: r.owner.actor(r.id).body.asleep
								? "asleep"
								: "awake",
				lifeEvent: r.lifeEvent,
				activity: !r.owner.actor(r.id).body.alive
					? "Dead"
					: r.job
						? r.job.offer.label
						: "Free to choose",
				until: r.job?.end ?? this.s.now,
				needs: this.needs(r.id),
				mood: r.owner.actor(r.id).affect.mood.valence,
				read: moodRead(this.s, r),
				wealth: r.wealth,
				history: this.s.events.filter((e) => e.actorId === r.id).slice(-8),
				observations: r.received ?? [],
				lessons: personLessons(r.owner.actor(r.id)),
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
				relationships: r.owner.actor(r.id).social.relationships.map((rel) => ({
					id: rel.otherId,
					name:
						rel.otherId === "player"
							? "You"
							: (this.s.people.find((o) => o.id === rel.otherId)?.name ??
								rel.otherId),
					trust: rel.trust,
					summary: rel.roles.join(", "),
					// Seeded ties carry an authored role; ties HF forms from encounters start without one.
					origin: (rel.roles.some((role) => role !== "deceased")
						? "initial"
						: "observed") as "initial" | "observed",
				})),
				invitations: allEvenings(this.s)
					.filter((e) => e.replies[r.id] && e.organiserId !== r.id)
					.map((e) => {
						const reply = required(
							e.replies[r.id],
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
				purposes: r.owner.actor(r.id).agenda.goals.map((g) => ({
					id: g.id,
					label: g.label,
					progress: g.progress,
					status: g.status,
				})),
				commitments: r.owner.actor(r.id).agenda.commitments.map((c) => ({
					label: c.label ?? c.actions.join(", "),
					at: c.until / MINUTE,
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
						? `${this.s.hall} of 12 repairs are complete. ${this.s.hallSafe ? "The hall opened after an inspection found it safe." : "The hall stays closed until an inspection finds it safe."}`
						: p.id === "market"
							? "Meals are reserved when an activity starts."
							: "Neighbours share this space.",
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
					(r) => (r.owner.actor(r.id).methods?.rules.length ?? 0) > 0,
				).length,
				taughtNeighbours: this.s.people.filter((r) =>
					taughtByNeighbour(this.s, r),
				).length,
				foodProduced: this.s.produced,
				foodConsumed: this.s.consumed,
				alive: this.s.people.filter((r) => r.owner.actor(r.id).body.alive)
					.length,
				dead: this.s.people.filter((r) => !r.owner.actor(r.id).body.alive)
					.length,
				underfed: this.s.people.filter(
					(r) =>
						r.owner.actor(r.id).body.alive &&
						r.owner.actor(r.id).body.satiety < 0.1,
				).length,
				lowHealth: this.s.people.filter(
					(r) =>
						r.owner.actor(r.id).body.alive &&
						r.owner.actor(r.id).body.health < 0.5,
				).length,
				penniless: this.s.people.filter(
					(r) => r.owner.actor(r.id).body.alive && r.wealth === 0,
				).length,
				population: this.s.people.length,
				background: this.s.people.filter((r) => !r.known).length,
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
