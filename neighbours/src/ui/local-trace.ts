import type { UiCommand } from "../contracts";

export const TRACE_LIMIT = 128;
type Event =
	| "session-start"
	| "session-end"
	| "command"
	| "ack"
	| "reply"
	| "menu-request"
	| "menu-open"
	| "menu-close"
	| "visibilitychange"
	| "pagehide"
	| "pageshow"
	| "resize"
	| "read";
type Data = {
	command?: UiCommand["type"];
	reply?: "ready" | "state" | "error" | "save" | "other";
	result?: "accepted" | "error" | "obsolete";
	id?: number;
	durationMs?: number;
	pending?: number;
	persisted?: boolean;
	workerPending?: boolean;
	advancePending?: boolean;
	comparisonPending?: boolean;
	hidden?: boolean;
	width?: number;
	height?: number;
	frameWidth?: number;
	frameHeight?: number;
	svgWidth?: number;
	svgHeight?: number;
	viewX?: number;
	viewY?: number;
	viewWidth?: number;
	viewHeight?: number;
};
type Entry = Data & {
	sequence: number;
	session: number;
	elapsedMs: number;
	event: Event;
};
type Command = {
	session: number;
	id: number;
	command: UiCommand["type"];
	at: number;
	done: boolean;
};

/** UI observations only. No packets, arbitrary strings, pending maps or timers. */
export class LocalTrace {
	private entries: Entry[] = [];
	private session = 0;
	private active = false;
	private sequence = 0;
	private commands = 0;
	private dropped = 0;
	private readonly started: number;
	constructor(private readonly now = () => performance.now()) {
		this.started = now();
	}
	begin() {
		this.session++;
		this.active = true;
		this.event(this.session, "session-start");
		return this.session;
	}
	end(session: number) {
		this.event(session, "session-end");
		if (session === this.session) this.active = false;
	}
	event(session: number, event: Event, data: Data = {}) {
		if (!this.active || session !== this.session) return;
		const entry: Entry = {
			sequence: ++this.sequence,
			session,
			event,
			elapsedMs: Math.round(this.now() - this.started),
		};
		// Copy only fixed scalar fields. Never retain a caller's object or packet.
		for (const key of [
			"id",
			"durationMs",
			"pending",
			"width",
			"height",
			"frameWidth",
			"frameHeight",
			"svgWidth",
			"svgHeight",
			"viewX",
			"viewY",
			"viewWidth",
			"viewHeight",
		] as const) {
			const value = data[key];
			if (typeof value === "number" && Number.isFinite(value))
				entry[key] = Math.round(value * 100) / 100;
		}
		if (data.command) entry.command = data.command;
		if (data.reply) entry.reply = data.reply;
		if (data.result) entry.result = data.result;
		if (typeof data.persisted === "boolean") entry.persisted = data.persisted;
		if (typeof data.hidden === "boolean") entry.hidden = data.hidden;
		for (const key of [
			"workerPending",
			"advancePending",
			"comparisonPending",
		] as const) {
			if (typeof data[key] === "boolean") entry[key] = data[key];
		}
		if (this.entries.length === TRACE_LIMIT) {
			this.entries.shift();
			this.dropped++;
		}
		this.entries.push(entry);
	}
	command(
		session: number,
		command: UiCommand["type"],
		pending: number,
	): Command {
		const token = {
			session,
			id: ++this.commands,
			command,
			at: this.now(),
			done: false,
		};
		this.event(session, "command", { command, id: token.id, pending });
		return token;
	}
	ack(
		session: number,
		token: Command | undefined,
		result: Data["result"],
		pending: number,
	) {
		if (
			!token ||
			token.done ||
			token.session !== session ||
			session !== this.session ||
			!this.active
		)
			return;
		token.done = true;
		this.event(session, "ack", {
			command: token.command,
			id: token.id,
			result,
			pending,
			durationMs: this.now() - token.at,
		});
	}
	read() {
		return {
			schema: "neighbours/local-ui-trace@1",
			limit: TRACE_LIMIT,
			dropped: this.dropped,
			timing:
				"Elapsed performance.now milliseconds since this UI trace was created; includes queue and persistence wait. Background suspension and observation overhead may affect timing.",
			entries: this.entries.map((entry) => ({ ...entry })),
		};
	}
}

/** Numeric DOM layout, not proof of painted pixels or phoneStage internals. */
export function traceViewport() {
	const frame = document.querySelector(".map-frame")?.getBoundingClientRect();
	const svg = document.querySelector<SVGSVGElement>(".map-frame svg");
	const rect = svg?.getBoundingClientRect();
	const view = svg?.viewBox.baseVal;
	return {
		hidden: document.hidden,
		width: window.innerWidth,
		height: window.innerHeight,
		frameWidth: frame?.width,
		frameHeight: frame?.height,
		svgWidth: rect?.width,
		svgHeight: rect?.height,
		viewX: view?.x,
		viewY: view?.y,
		viewWidth: view?.width,
		viewHeight: view?.height,
	};
}
