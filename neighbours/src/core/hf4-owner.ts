import {
	type DeepReadonly,
	exportRun,
	exportRunJournal,
	type Input,
	inspect,
	type PerceptData,
	preview,
	type Run,
	type RunArchive,
	type RunJournalArchive,
	type RunJournalCursor,
	restoreRun,
	type StepResult,
	step,
} from "@adam0white/human-framework";
import { nativeOffer } from "./hf4-offers.ts";
import { HOST_SOURCE, MINUTE, nativeMilliseconds, need } from "./hf4-run.ts";
import type {
	Affordance,
	DecisionRecord,
	NativeActor,
	Suggestion,
	SuggestionResolution,
} from "./host-types.ts";

type PendingLesson = {
	person: string;
	teacher: string;
	lessonId: string;
	perceptId: string;
};
export type OwnerArchive = {
	lessons: PendingLesson[];
	run: DeepReadonly<RunArchive>;
	queued: Input[];
	nextInput: number;
};
export type OwnerJournalArchive = Omit<OwnerArchive, "run"> & {
	journal: DeepReadonly<RunJournalArchive>;
};
/** SCOPE: the sole public Run owner. Readings are exact immutable HF4 snapshots, not mutable Persons. */
export class TownRunOwner {
	/** Ephemeral engineering sink. Receives the exact request before the public
	 * step so a failed process cannot erase the last submitted proof input.
	 * It is never exported, replayed or used by town rules. */
	static onStepRequest:
		| ((request: { until: number; inputs: Input[] }) => void)
		| undefined;
	readonly run: Run;
	private queued: Input[] = [];
	private lessons: PendingLesson[] = [];
	private nextInput = 1;
	private attended = new Map<string, number>();
	private receivedTimes = new Map<string, number>();
	private snapshot: DeepReadonly<RunArchive> | undefined;
	private currentState: DeepReadonly<RunArchive["current"]> | undefined;
	private currentCursor: RunJournalCursor | undefined;
	private effective!: DeepReadonly<RunArchive["initial"]["effective"]>;
	private snapshotCursor: RunJournalCursor | undefined;
	private frameAvailability = new Map<
		string,
		{ alive: boolean; asleep: boolean; downed: boolean }
	>();
	last: DeepReadonly<StepResult> | null = null;
	/** Last actual public step argument. Ephemeral diagnostics; never a replay input or state edit. */
	lastRequest: { until: number; inputs: Input[] } | null = null;
	constructor(run: Run) {
		this.run = run;
		this.readCurrent();
	}
	static restore(value: OwnerArchive): TownRunOwner {
		const owner = new TownRunOwner(need(restoreRun(value.run)));
		owner.lessons = structuredClone(value.lessons);
		owner.queued = structuredClone(value.queued);
		owner.nextInput = value.nextInput;
		const restored = need(
			inspect(owner.run, {
				perspective: { kind: "host" },
				people: Object.keys(owner.current.people),
				select: ["events"],
			}),
		);
		for (const person of restored.people)
			if (person.kind === "host")
				for (const part of person.parts)
					if (part.select === "events")
						for (const event of part.value)
							if (event.data.kind === "observation-attended") {
								owner.attended.set(
									`${person.id}:${event.data.perceptId}`,
									event.data.attention,
								);
								owner.receivedTimes.set(
									`${person.id}:${event.data.perceptId}`,
									event.data.deliveredAt,
								);
							}
		return owner;
	}
	queue(input: Input): void {
		this.queued.push(structuredClone(input));
	}
	allocate(kind: string): string {
		if (!Number.isSafeInteger(this.nextInput) || this.nextInput < 1)
			throw Error("Input counter exhausted");
		return `neighbours:${String(this.nextInput++).padStart(16, "0")}:${kind}`;
	}
	get pending() {
		return this.current.pending;
	}
	offers(person: string) {
		return this.current.offers[person]?.offers ?? [];
	}
	offerRevision(person: string) {
		return this.current.offers[person]?.revision ?? 0;
	}
	queuedGoal(person: string, label: string) {
		return this.queued.find(
			(input) =>
				input.kind === "agenda.requested" &&
				input.payload.person === person &&
				input.payload.request.type === "goal" &&
				input.payload.request.goal.label === label,
		);
	}
	accepted(id: string) {
		return this.current.receipts.inputs.some((input) => input.id === id);
	}
	get parameters() {
		this.readCurrent();
		return this.effective;
	}
	get at() {
		return this.current.at;
	}
	get revision() {
		return this.current.world.revision;
	}
	actor(id: string): NativeActor {
		const actor = this.current.people[id];
		if (!actor) throw Error("Unknown Run actor");
		return actor;
	}
	enqueue<K extends Input["kind"]>(
		kind: K,
		payload: Extract<Input, { kind: K }>["payload"],
		at = this.at + 1,
	): string {
		const id = this.allocate("input");
		// TypeScript cannot correlate a generic discriminant with its payload after construction.
		this.queued.push({
			id,
			at,
			source: HOST_SOURCE,
			kind,
			payload: structuredClone(payload),
		} as Input);
		return id;
	}
	attentionTime(person: string, perceptId: string): number | null {
		return this.receivedTimes.get(`${person}:${perceptId}`) ?? null;
	}
	attention(person: string, perceptId: string): number | null {
		return this.attended.get(`${person}:${perceptId}`) ?? null;
	}
	observe(person: string, percept: PerceptData): boolean {
		const key = `${person}:${percept.id}`;
		if (this.attended.has(key)) return (this.attended.get(key) ?? 0) > 0;
		if (
			!this.queued.some(
				(x) =>
					x.kind === "observation.received" &&
					x.payload.person === person &&
					x.payload.percepts.some((p) => p.id === percept.id),
			)
		)
			this.enqueue("observation.received", {
				person,
				evidenceId: `observation:${key}`,
				percepts: [percept],
			});
		return false;
	}
	offerInputs(
		person: string,
		offers: readonly Affordance[],
		at = this.at + 1,
	): Input[] {
		const queuedRevision = this.queued.flatMap((input) =>
			input.kind === "offers.received" && input.payload.person === person
				? [input.payload.revision]
				: [],
		);
		const revision =
			Math.max(this.current.offers[person]?.revision ?? 0, ...queuedRevision) +
			1;
		return [
			{
				id: this.allocate("offers"),
				at,
				source: HOST_SOURCE,
				kind: "offers.received",
				payload: {
					person,
					revision,
					offers: offers.map((offer) => nativeOffer(person, offer)),
				},
			},
		];
	}
	private decisionInputs(
		person: string,
		offers: readonly Affordance[],
		reason: string,
		suggestion?: Suggestion,
	): Input[] {
		const at = this.at + 1;
		const inputs = this.offerInputs(person, offers, at);
		const book = inputs[0];
		if (book?.kind !== "offers.received") throw Error("Missing offer book");
		if (suggestion) {
			if (suggestion.insist) {
				if (!suggestion.affordanceId)
					throw Error("Insistence must name an actual offer");
				inputs.push({
					id: this.allocate("coercion"),
					at,
					source: HOST_SOURCE,
					kind: "coercion.received",
					payload: {
						person,
						voiceId: suggestion.voiceId,
						orderId: this.allocate("order"),
						offerId: suggestion.affordanceId,
						repeat: false,
					},
				});
			} else
				inputs.push({
					id: this.allocate("advice"),
					at,
					source: HOST_SOURCE,
					kind: "suggestion.received",
					payload: {
						person,
						received: {
							kind: "ordinary",
							suggestion: {
								...suggestion,
								since: at,
								adviceId: this.allocate("advice-evidence"),
							},
						},
					},
				});
		}
		inputs.push({
			id: this.allocate("decision"),
			at,
			source: HOST_SOURCE,
			kind: "decision.requested",
			payload: {
				person,
				reason,
				treatment: "reconsider",
				offerRevision: book.payload.revision,
			},
		});
		return inputs;
	}
	requestDecision(
		person: string,
		offers: readonly Affordance[],
		reason: string,
		suggestion?: Suggestion,
	): DecisionRecord {
		if (this.current.pending.length)
			throw Error("Finish the reached physical boundary before speaking");
		const inputs = this.decisionInputs(person, offers, reason, suggestion);
		this.queued.push(...inputs);
		const result = this.advance(this.at + 1);
		const event = result.events.find(
			(e) => e.person === person && e.data.kind === "decision",
		);
		if (event?.data.kind !== "decision")
			throw Error("Run did not return the requested decision");
		return {
			...event.data.decision,
			narration: event.narration.map((line) => line.text).join(" "),
		};
	}
	requestAdvice(
		person: string,
		offers: readonly Affordance[],
		suggestion: Suggestion,
	): SuggestionResolution {
		const decision = this.requestDecision(
			person,
			offers,
			"player spoke",
			suggestion,
		);
		const resolution =
			decision.suggestions?.find(
				(item) => item.voiceId === suggestion.voiceId,
			) ?? decision.suggestion;
		if (!resolution)
			throw Error("Run did not return a received-suggestion resolution");
		return resolution;
	}
	previewAdvice(
		person: string,
		offers: readonly Affordance[],
		suggestion: Suggestion,
	): SuggestionResolution {
		if (this.current.pending.length)
			throw Error("Finish the reached physical boundary before previewing");
		const before = this.nextInput;
		const inputs = this.decisionInputs(
			person,
			offers,
			"hypothetical player speech",
			suggestion,
		);
		this.nextInput = before;
		const result = need(
			preview(this.run, {
				perspective: { kind: "person", observer: person },
				person,
				until: this.at + 1,
				inputs,
			}),
		);
		const event = result.possibilities.find(
			(e) => e.data.kind === "suggestion-resolved",
		);
		if (event?.data.kind !== "suggestion-resolved")
			throw Error("No supported hypothetical suggestion reading");
		return event.data.resolution;
	}
	lesson(person: string, teacher: string, lessonId: string): void {
		const body = this.actor(person).body;
		if (!body.alive || body.asleep || body.downed) return;
		if (
			this.lessons.some((x) => x.lessonId === lessonId && x.person === person)
		)
			return;
		const perceptId = `lesson:${lessonId}:${person}`;
		this.observe(
			person,
			minutePercept(perceptId, this.at / MINUTE, {
				channel: "heard",
				kind: "inspection-lesson",
				actorId: teacher,
				targetId: person,
				salience: 0.85,
				summary:
					"The teacher explained when dry timber and sound supports allow opening, and when wet timber means keeping a section closed.",
			}),
		);
		this.lessons.push({ person, teacher, lessonId, perceptId });
	}
	private advanceLessons(): void {
		this.lessons = this.lessons.filter((lesson) => {
			const attention = this.attention(lesson.person, lesson.perceptId);
			if (attention === null) return true;
			for (const [i, moisture] of ["dry", "wet"].entries()) {
				const contextId = `${lesson.lessonId}:example:${i}`;
				const conditions = [
					{ cue: "hall-moisture", value: moisture },
					{ cue: "hall-support", value: "sound" },
				];
				this.enqueue("method.cues", {
					person: lesson.person,
					evidenceId: `${contextId}:cues`,
					contextId,
					cues: conditions,
				});
				for (let repeat = 0; repeat < 2; repeat++)
					this.enqueue("method.demonstrated", {
						person: lesson.person,
						evidenceId: `${contextId}:evidence:${repeat}`,
						demonstrationId: `${contextId}:demo:${repeat}`,
						methodId: "hall-section-inspection",
						contextId,
						conditions,
						action: moisture === "dry" ? "open-section" : "keep-closed",
						teacher: lesson.teacher,
						outcome: "success",
						receivedAttention: attention,
					});
			}
			return false;
		});
	}
	advance(
		until: number,
		resolutions: readonly Input[] = [],
	): DeepReadonly<StepResult> {
		// Pending resolutions retain their exact reached time. Other inputs enter only a later open frame.
		const current = this.current;
		const pending = current.pending;
		const inputs: Input[] = [...resolutions];
		const eligible =
			pending.length === 0 ? this.queued.filter((x) => x.at <= until) : [];
		inputs.push(...eligible);
		this.lastRequest = structuredClone({ until, inputs });
		TownRunOwner.onStepRequest?.(structuredClone(this.lastRequest));
		this.frameAvailability = new Map(
			Object.entries(current.people).map(([id, actor]) => [
				id,
				{
					alive: actor.body.alive,
					asleep: actor.body.asleep,
					downed: !!actor.body.downed,
				},
			]),
		);
		const result = need(step(this.run, { until, inputs }));
		this.queued = this.queued.filter(
			(x) => !eligible.some((y) => y.id === x.id),
		);
		this.readCurrent();
		this.last = result;
		for (const event of result.events)
			if (event.person && event.data.kind === "observation-attended") {
				this.attended.set(
					`${event.person}:${event.data.perceptId}`,
					event.data.attention,
				);
				this.receivedTimes.set(
					`${event.person}:${event.data.perceptId}`,
					event.data.deliveredAt,
				);
			}
		this.advanceLessons();
		return result;
	}
	/** Read physical availability at an actual event in the last public step.
	 * Only public body facts/events are retained, never a mutable native actor. */
	availableAt(person: string, at: number): boolean {
		const initial = this.frameAvailability.get(person);
		if (!initial || !this.last || at > this.last.at)
			throw Error("Missing native source boundary");
		let { alive, asleep, downed } = initial;
		for (const event of this.last.events) {
			if (
				event.person !== person ||
				event.at > at ||
				event.data.kind !== "body-change"
			)
				continue;
			switch (event.data.change.kind) {
				case "died":
					alive = false;
					break;
				case "dozed":
					asleep = true;
					break;
				case "woke":
					asleep = false;
					break;
				case "downed":
					downed = true;
					break;
				case "stood":
					downed = false;
					break;
			}
		}
		// Sleep load onset is public body.since; completed sleep intervals are public
		// woke receipts. A later wake must not retroactively make a witness awake.
		const body = this.actor(person).body;
		if (body.asleep && body.since <= at) asleep = true;
		for (const event of this.last.events)
			if (
				event.person === person &&
				event.data.kind === "body-change" &&
				event.data.change.kind === "woke" &&
				event.data.change.slept.from <= at &&
				at < event.data.change.slept.to
			)
				asleep = true;
		return alive && !asleep && !downed;
	}
	inspect(person: string, select: Parameters<typeof inspect>[1]["select"]) {
		return need(
			inspect(this.run, {
				perspective: { kind: "host" },
				people: [person],
				select,
			}),
		);
	}
	/** Complete lossless file evidence. Cursor deltas are not substituted for a full file. */
	exportJournal(): OwnerJournalArchive {
		const journal = need(exportRunJournal(this.run));
		if (!journal.opening) throw Error("Missing journal opening");
		return {
			lessons: structuredClone(this.lessons),
			journal: {
				opening: journal.opening,
				chunks: journal.chunk ? [journal.chunk] : [],
				head: journal.head,
			},
			queued: structuredClone(this.queued),
			nextInput: this.nextInput,
		};
	}
	/** SCOPE: exact detached public current, reused only while the public journal
	 * confirms the same transaction prefix and initial authoring. Time/revision
	 * alone are not freshness witnesses. This cursor never advances archive reuse. */
	private journalSince(cursor: RunJournalCursor | undefined) {
		const journal = exportRunJournal(this.run, cursor);
		if (
			!journal.ok &&
			journal.error.code === "invalid-admission" &&
			journal.error.path === "$.cursor"
		)
			return need(exportRunJournal(this.run));
		return need(journal);
	}
	private readCurrent(): DeepReadonly<RunArchive["current"]> {
		const journal = this.journalSince(this.currentCursor);
		if (!this.currentState || journal.chunk || journal.opening) {
			const reading = need(
				inspect(this.run, {
					perspective: { kind: "host" },
					people: [],
					select: ["current"],
				}),
			);
			if (!reading.current) throw Error("Missing public Run current");
			this.currentState = reading.current;
		}
		if (journal.opening) this.effective = journal.opening.initial.effective;
		this.currentCursor = journal.cursor;
		return this.currentState;
	}
	get current() {
		return this.readCurrent();
	}

	export(): OwnerArchive {
		const journal = this.journalSince(this.snapshotCursor);
		if (!this.snapshot || journal.chunk || journal.opening)
			this.snapshot = exportRun(this.run);
		this.snapshotCursor = journal.cursor;
		return {
			lessons: structuredClone(this.lessons),
			// Reuse only after validating the exact public transaction/authoring prefix.
			// Queue/lesson/counter metadata is copied separately.
			run: this.snapshot,
			queued: structuredClone(this.queued),
			nextInput: this.nextInput,
		};
	}
}
export function minutePercept(
	id: string,
	atMinute: number,
	input: Omit<
		PerceptData,
		| "id"
		| "occurredAt"
		| "claims"
		| "norms"
		| "advice"
		| "consequences"
		| "withdrawConsequences"
		| "witnesses"
		| "reports"
		| "provenance"
	> &
		Partial<
			Pick<
				PerceptData,
				| "claims"
				| "norms"
				| "advice"
				| "consequences"
				| "withdrawConsequences"
				| "witnesses"
				| "reports"
				| "provenance"
			>
		>,
): PerceptData {
	return {
		id,
		occurredAt: nativeMilliseconds(atMinute),
		claims: [],
		norms: [],
		advice: [],
		consequences: [],
		withdrawConsequences: [],
		witnesses: [],
		reports: [],
		provenance: [],
		...input,
	};
}
