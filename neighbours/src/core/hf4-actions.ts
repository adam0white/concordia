import type {
	ActionRequest,
	ActionResolution,
	DeepReadonly,
	HostRequest,
	Input,
	Json,
	ObservedOutcome,
	Offer,
} from "@adam0white/human-framework";

export interface PhysicalJob {
	activityId: string;
	offer: Offer;
	from: string;
	startedAt: number;
	arriveAt: number;
	endsAt: number;
	food: number;
	tools: number;
	slot: boolean;
}
export interface PhysicalBoundary {
	revision: number;
	at: number;
	places: Record<string, { capacity: number; reserved: number; stock: number }>;
	residents: Record<string, { place: string; wealth: number }>;
	tools: number;
	marketStock: number;
	consumed: number;
	produced: number;
	nextInput: number;
	applied: string[];
	jobs: Record<string, PhysicalJob>;
}
export interface ResolvedBatch {
	state: PhysicalBoundary;
	inputs: Input[];
}
// SCOPE: physical request resolution only. The actual Run chooses; this host never preselects an offer or edits an actor.
export function resolveActionBatch(
	original: PhysicalBoundary,
	requests: DeepReadonly<readonly HostRequest[]>,
	offered: readonly Offer[],
): ResolvedBatch {
	const state = structuredClone(original);
	const inputs: Input[] = [];
	for (const request of requests) {
		if (request.kind !== "action")
			throw Error(`Unsupported host request: ${request.kind}`);
		if (state.applied.includes(request.id))
			throw Error("Action request already resolved");
		if (request.worldRevision > state.revision)
			throw Error("Action request is ahead of physical world");
		const resident = state.residents[request.person];
		if (!resident) throw Error("Unknown physical resident");
		const offer = offered.find(
			(o) => o.person === request.person && o.id === request.offerId,
		);
		const job = state.jobs[request.person];
		let disposition: ActionResolution["disposition"] = "rejected";
		let outcome: ObservedOutcome | undefined;
		let changed = false;
		if (request.stage === "start") {
			if (!offer) throw Error("Requested offer was never registered");
			const place = offer.place ? state.places[offer.place] : undefined;
			const slot = !offer.tags.includes("floor");
			const food = ["eat", "gather", "attend-meal"].includes(offer.actionId)
				? 1
				: 0;
			const tools = offer.actionId === "repair" ? 1 : 0;
			if (
				!job &&
				place &&
				(!slot || place.reserved < place.capacity) &&
				state.tools >= tools &&
				state.marketStock >= food &&
				resident.wealth >= food
			) {
				state.marketStock -= food;
				resident.wealth -= food;
				state.tools -= tools;
				if (slot) place.reserved++;
				state.jobs[request.person] = {
					activityId: request.activityId,
					offer: structuredClone(offer),
					from: resident.place,
					startedAt: request.boundaryAt,
					arriveAt: request.boundaryAt,
					endsAt: request.boundaryAt + offer.durationMs,
					food,
					tools,
					slot,
				};
				disposition = "accepted";
				changed = true;
			}
		} else {
			if (
				!job ||
				job.activityId !== request.activityId ||
				job.offer.id !== request.offerId
			)
				throw Error("Physical job does not match action request");
			const place = job.offer.place ? state.places[job.offer.place] : undefined;
			if (!place) throw Error("Job destination missing");
			if (request.stage === "finish" && request.boundaryAt < job.endsAt)
				throw Error("Job cannot finish early");
			if (job.slot) {
				if (place.reserved < 1) throw Error("Reservation underflow");
				place.reserved--;
			}
			state.tools += job.tools;
			if (request.stage === "interrupt") {
				state.marketStock += job.food;
				resident.wealth += job.food;
				disposition = "interrupted";
			} else {
				state.consumed += job.food;
				if (job.offer.actionId === "grow") {
					state.marketStock += 3;
					state.produced += 3;
				}
				if (job.offer.actionId === "supply") {
					state.marketStock += 5;
					state.produced += 5;
				}
				if (job.offer.actionId === "work") resident.wealth += 2;
				resident.place = job.offer.place ?? resident.place;
				disposition = "completed";
			}
			outcome = physicalOutcome(request, job, disposition);
			delete state.jobs[request.person];
			changed = true;
		}
		const worldRevision = state.revision;
		if (changed) state.revision++;
		state.applied.push(request.id);
		state.at = request.boundaryAt;
		const payload: ActionResolution = {
			requestId: request.id,
			requestHash: request.requestHash,
			person: request.person,
			activityId: request.activityId,
			stage: request.stage,
			worldRevision,
			disposition,
			observations: [],
			...(outcome ? { outcome } : {}),
			...(changed
				? {
						worldChange: {
							expectedRevision: worldRevision,
							revision: state.revision,
							put: [],
							remove: [],
							hostState: physicalJson(state),
						},
					}
				: {}),
		};
		inputs.push({
			id: `neighbours:${String(state.nextInput++).padStart(16, "0")}:resolution`,
			at: request.boundaryAt,
			source: { type: "host", id: "neighbours" },
			kind: "action.resolved",
			payload,
		});
	}
	return { state, inputs };
}
function physicalJson(state: PhysicalBoundary): Json {
	return JSON.parse(JSON.stringify(state)) as Json;
}
function physicalOutcome(
	request: DeepReadonly<ActionRequest>,
	job: PhysicalJob,
	disposition: ActionResolution["disposition"],
): ObservedOutcome {
	const completed = disposition === "completed";
	return {
		activityId: job.activityId,
		offerId: job.offer.id,
		actionId: job.offer.actionId,
		...(job.offer.target ? { target: job.offer.target } : {}),
		start: job.startedAt,
		end: request.boundaryAt,
		status: completed ? "completed" : "interrupted",
		evidenceId: `physical:${request.id}`,
		actual: {
			exposures: [],
			observedProgress: [],
			...(completed && job.food ? { consumed: { food: 0.65 } } : {}),
			...(completed && job.offer.actionId === "drink"
				? { consumed: { water: 0.7 } }
				: {}),
			material: completed ? (job.offer.actionId === "work" ? 2 : -job.food) : 0,
		},
		fulfills: completed ? job.offer.fulfills : [],
		advances: completed ? job.offer.advances : [],
	};
}
