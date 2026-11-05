/** Native-only external policy adapter. The ordinary browser runtime never imports this file. */
import { createHash } from "node:crypto";
import { RuntimePort } from "../bridge-port.ts";
export interface ModelReply {
	rawResponse: string;
	provenance: {
		provider: string;
		models: string[];
		requestedModel: string;
		reportedDurationMs?: number;
		reportedCostUsd?: number;
	};
}
export type TownProvider = (prompt: string) => ModelReply;
interface Entry extends ModelReply {
	requestHash: string;
	prompt: string;
}
interface Tape {
	schema: "town-response-tape@1";
	actorId: string;
	cursor: number;
	entries: Entry[];
}
function digest(value: unknown) {
	return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export class MixedPort {
	port: RuntimePort;
	tape: Tape;
	readonly mode: "live" | "replay";
	readonly provider: TownProvider;
	constructor(
		seed: number,
		population: number,
		actorId: string,
		mode: "live" | "replay",
		provider: TownProvider,
	) {
		this.mode = mode;
		this.provider = provider;
		this.port = new RuntimePort(seed, population);
		this.tape = {
			schema: "town-response-tape@1",
			actorId,
			cursor: 0,
			entries: [],
		};
		if (!this.port.runtime.view().people.some((p) => p.id === actorId))
			throw Error("Unknown external actor");
	}
	dispatch(request: Record<string, unknown>): unknown {
		if (request.op === "save")
			return {
				...(this.port.runtime.export() as object),
				mixed: structuredClone(this.tape),
			};
		if (request.op === "restore") {
			if (!request.save || typeof request.save !== "object")
				throw Error("Invalid mixed checkpoint");
			const { mixed, ...runtime } = request.save as Record<string, unknown>;
			if (!mixed || typeof mixed !== "object")
				throw Error("Missing response tape");
			const tape = structuredClone(mixed) as Tape;
			if (
				tape.schema !== "town-response-tape@1" ||
				tape.actorId !== this.tape.actorId ||
				!Array.isArray(tape.entries) ||
				tape.entries.length > 128 ||
				!Number.isSafeInteger(tape.cursor) ||
				tape.cursor < 0 ||
				tape.cursor > tape.entries.length ||
				tape.entries.some(
					(e) =>
						typeof e.requestHash !== "string" ||
						!/^[a-f0-9]{64}$/.test(e.requestHash) ||
						typeof e.prompt !== "string" ||
						e.prompt.length > 65536 ||
						typeof e.rawResponse !== "string" ||
						e.rawResponse.length > 16384 ||
						!e.provenance ||
						!Array.isArray(e.provenance.models) ||
						!e.provenance.models.length,
				)
			)
				throw Error("Invalid response tape");
			this.port.dispatch({ op: "restore", save: runtime });
			this.tape = tape;
			return null;
		}
		if (request.op === "choose" && request.actorId === this.tape.actorId) {
			const actorId = this.tape.actorId;
			const choices = this.port.runtime.getChoices(actorId);
			const person = this.port.runtime
				.view()
				.people.find((p) => p.id === actorId);
			if (!person || !choices.length)
				throw Error("External actor has no legal decision");
			const requestHash = digest({
				actorId,
				state: this.port.runtime.export(),
				choices,
			});
			const prompt = JSON.stringify({
				responseFormat:
					"Return one plain JSON object. No Markdown fences or surrounding text.",
				task: "Choose one feasible town activity for yourself. Balance your needs and known commitments; you may decline work by selecting another available action. You cannot invent actions or outcomes.",
				contextId: requestHash,
				observation: JSON.parse(this.port.runtime.getObservation(actorId)),
				self: {
					name: person.name,
					role: person.role,
					description: person.description,
					needs: person.needs,
					wealth: person.wealth,
					commitments: person.commitments,
					relationships: person.relationships,
					history: person.history,
				},
				choices,
				response: {
					contextId: requestHash,
					action: "one available action ID",
					reason: "brief reason, at most 400 characters",
				},
			});
			let entry = this.tape.entries[this.tape.cursor];
			if (entry && entry.requestHash !== requestHash)
				throw Error("Response tape does not match this exact world state");
			if (!entry) {
				if (this.mode === "replay")
					throw Error(
						"Replay has no recorded model response for this decision",
					);
				if (this.tape.entries.length >= 8)
					throw Error("Live model decision budget exhausted");
				entry = { ...this.provider(prompt), requestHash, prompt };
			}
			const parsed: unknown = JSON.parse(entry.rawResponse);
			if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
				throw Error("Model choice must be JSON");
			const choice = parsed as Record<string, unknown>;
			if (
				Object.keys(choice).sort().join() !== "action,contextId,reason" ||
				choice.contextId !== requestHash ||
				typeof choice.action !== "string" ||
				!choices.some((a) => a.id === choice.action) ||
				typeof choice.reason !== "string" ||
				!choice.reason.trim() ||
				choice.reason.length > 400
			)
				throw Error("External choice is not legal for this request");
			this.port.runtime.acceptExternalChoice(
				actorId,
				choice.action,
				choice.reason,
				entry.provenance.models.join(", "),
			);
			if (this.tape.cursor === this.tape.entries.length)
				this.tape.entries.push(entry);
			this.tape.cursor++;
			return choice.action;
		}
		return this.port.dispatch(request);
	}
}
