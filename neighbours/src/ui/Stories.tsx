import { useEffect, useRef, useState } from "react";
import type { TownEvent, TownView } from "../contracts";
import type { EveningEvent } from "../core/evenings.ts";
import { datedClock } from "./format";
import type { StoryGroup } from "./observations";
import { plainText } from "./plain-english";
import { storyAnchor } from "./StoryHeadline";

export type EveningReading = {
	lines: string[];
	people: { id: string; name: string; lines: string[] }[];
};
/** Only retained host facts cross this UI boundary. No native Person or cast metadata is read. */
type HostSnapshot = {
	now: number;
	seed: number;
	events: TownEvent[];
	socialEvenings?: {
		events: EveningEvent[];
		recurrence?: { cycles: { events: EveningEvent[] }[] };
	};
};
function when(at: number): string {
	const minute = ((at % 1440) + 1440) % 1440;
	return `Day ${Math.floor(at / 1440) + 1}, ${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(Math.floor(minute % 60)).padStart(2, "0")}`;
}
/** A native snapshot must match the exact settled public view and retained story. */
export function projectEveningReading(
	packet: unknown,
	town: TownView,
	story: StoryGroup,
): EveningReading | undefined {
	if (
		!packet ||
		typeof packet !== "object" ||
		!("runtime" in packet) ||
		!("schema" in packet) ||
		packet.schema !== "neighbours/concordia@2"
	)
		return undefined;
	const native = packet.runtime as Record<string, unknown> | undefined;
	const fields = [
		"format",
		"schema",
		"hf",
		"physical",
		"owner",
		"boundary",
		"inputs",
	];
	if (
		!native ||
		typeof native !== "object" ||
		Object.keys(native).length !== fields.length ||
		fields.some((field) => !Object.hasOwn(native, field)) ||
		native.format !== "neighbours-native" ||
		native.schema !== "neighbours-hf4/1" ||
		native.hf !== "4.9.0"
	)
		return undefined;
	const s = native.physical as HostSnapshot | undefined;
	if (
		!s ||
		s.now !== town.now ||
		s.seed !== town.seed ||
		!Array.isArray(s.events)
	)
		return undefined;
	const evenings = [
		...(s.socialEvenings?.events ?? []),
		...(s.socialEvenings?.recurrence?.cycles.flatMap((c) => c.events) ?? []),
	];
	const evening = evenings.find(
		(e) => (e.result ?? e.notice)?.id === story.eventIds.at(-1),
	);
	const source = evening?.result ?? evening?.notice;
	const visible = town.evenings?.find((e) => e.id === evening?.id);
	if (
		!evening?.notice ||
		evening.notice.at > s.now ||
		!source ||
		source.at > s.now ||
		source.kind !== story.kind ||
		source.at !== story.at ||
		!story.summaries.includes(source.text) ||
		!visible ||
		visible.kind !== evening.kind ||
		visible.organiserId !== evening.organiserId ||
		visible.startsAt !== evening.startsAt ||
		visible.endsAt !== evening.endsAt ||
		visible.stage !== evening.stage ||
		visible.result !== evening.result?.text
	)
		return undefined;
	const guests = Object.entries(evening.replies).filter(
		([id]) => id !== evening.organiserId,
	);
	if (
		visible.heard !== guests.length ||
		visible.accepted !==
			Object.values(evening.replies).filter((r) => r.reply === "accepted")
				.length ||
		visible.attended !== guests.filter(([, r]) => r.delivered === true).length
	)
		return undefined;
	return readingFromFacts(s, town, evening);
}
function readingFromFacts(
	s: HostSnapshot,
	town: TownView,
	evening: EveningEvent,
): EveningReading {
	const notice = evening.notice;
	if (!notice) throw Error("No retained invitation.");
	const background = Object.entries(evening.replies).filter(
		([id]) =>
			id !== evening.organiserId &&
			town.people.some((r) => r.id === id && !r.known),
	);
	const closed =
		evening.stage === "closed" &&
		!!evening.result &&
		evening.result.at <= s.now;
	const delivered = background.filter(
		([, reply]) => reply.delivered === true,
	).length;
	return {
		lines: [
			`Retained records as of ${when(s.now)}.`,
			`${when(notice.at)}: ${town.people.find((p) => p.id === evening.organiserId)?.name ?? "A neighbour"} posted the invitation.`,
			`Scheduled for ${when(evening.startsAt)}–${when(evening.endsAt)}. A schedule or acceptance does not establish delivery.`,
			`Background guests: ${background.length} received the notice; ${background.filter(([, reply]) => reply.reply === "accepted").length} accepted; ${delivered} have recorded ${evening.kind === "meal" ? "meal" : "lesson"} delivery.${closed ? " The evening is closed." : " The outcome is still open; missing delivery is unknown."}`,
			"Arrival times and reply times are not retained in the evening record. Later activities show what followed, not why anyone chose them. Older activity records may be missing.",
		],
		people: town.people
			.filter((r) => r.known)
			.map((r) => {
				const id = r.id;
				const reply = evening.replies[id];
				const host = id === evening.organiserId;
				const later = s.events
					.filter(
						(event) =>
							event.actorId === id &&
							event.at > evening.endsAt &&
							event.at <= s.now &&
							["started", "completed"].includes(event.kind),
					)
					.toSorted((a, b) => a.at - b.at || a.id - b.id)
					.slice(0, 2);
				const lines = host
					? [
							"Organiser; posting the invitation is a promise to host, not delivery.",
						]
					: [
							reply && reply.heardAt <= s.now
								? `Notice received ${when(reply.heardAt)}.`
								: "Notice receipt unknown: no retained receipt.",
							reply?.reply === "accepted"
								? "Voluntarily accepted; exact reply time unknown."
								: reply?.reply === "declined"
									? "Declined; exact reply time unknown."
									: "No reply recorded.",
						];
				lines.push(
					reply && reply.attendedMinutes > 0
						? `Physical presence confirmed by ${reply.attendedMinutes} recorded minutes awake with ${host ? "guests" : "the host"}; exact arrival time unknown.`
						: `${reply?.attempted ? "An attendance activity started. " : ""}Physical arrival unknown; no awake overlap recorded.`,
				);
				lines.push(
					host
						? `Hosting delivery ${reply?.delivered === true ? "recorded" : reply?.delivered === false ? "did not complete" : closed ? "not recorded when the evening closed" : "unknown while the outcome is open"}.`
						: reply?.delivered === true
							? `${evening.kind === "meal" ? "Meal" : "Lesson attendance"} delivery recorded. ${evening.kind === "class" ? "This reading does not establish acquisition of a method." : ""}`.trim()
							: reply?.delivered === false
								? "Attendance ended without delivery."
								: closed
									? "No delivery recorded when the evening closed."
									: "Delivery unknown while the outcome is open.",
				);
				lines.push(
					...(later.length
						? later.map(
								(event) =>
									`Later retained activity, ${when(event.at)}: ${event.text}`,
							)
						: [
								"Later activity unknown: no retained started/completed record after this evening.",
							]),
				);
				return { id, name: r.name, lines };
			}),
	};
}
/** getRun already binds requests to the worker generation. This adds view/time and UI-lifetime binding. */
export async function captureEveningReading(
	town: TownView,
	story: StoryGroup,
	capture: () => Promise<unknown>,
	current: () => boolean,
): Promise<EveningReading> {
	if (!current()) throw Error("The town changed or this reading closed.");
	const packet = await capture();
	if (!current()) throw Error("The town changed or this reading closed.");
	const reading = projectEveningReading(packet, town, story);
	if (!reading)
		throw Error(
			"No matching retained record is available at this settled time. Close and reopen to try again.",
		);
	return reading;
}
function EveningRecord({
	town,
	story,
	capture,
	run,
	select,
}: {
	town: TownView;
	story: StoryGroup;
	capture: () => Promise<unknown>;
	run: number;
	select: (id: string) => void;
}) {
	const [result, setResult] = useState<{
		reading?: EveningReading;
		error?: string;
		pending?: boolean;
	}>({});
	const alive = useRef(true),
		sequence = useRef(0),
		details = useRef<HTMLDetailsElement>(null);
	const latest = useRef({ town, run });
	latest.current = { town, run };
	useEffect(() => {
		alive.current = true;
		const hide = () => {
			alive.current = false;
			sequence.current++;
			setResult({});
		};
		window.addEventListener("pagehide", hide);
		return () => {
			alive.current = false;
			sequence.current++;
			window.removeEventListener("pagehide", hide);
		};
	}, []);
	const open = () => {
		const request = ++sequence.current;
		setResult({});
		if (!details.current?.open) return;
		setResult({ pending: true });
		const sameReading = () =>
			alive.current &&
			sequence.current === request &&
			latest.current.run === run &&
			!!details.current?.open;
		void captureEveningReading(
			town,
			story,
			capture,
			() => sameReading() && latest.current.town === town,
		).then(
			(reading) => {
				if (sameReading()) setResult({ reading });
			},
			(failure) => {
				if (sameReading())
					setResult({
						error:
							failure instanceof Error
								? failure.message
								: "This reading is unavailable.",
					});
			},
		);
	};
	return (
		<details ref={details} className="evening-reading" onToggle={open}>
			<summary>Invitation, attendance and afterwards</summary>
			{result.pending && (
				<p role="status">Reading the town's retained record…</p>
			)}
			{result.error && <p role="status">{result.error}</p>}
			{result.reading?.lines.map((line) => (
				<p key={line}>{plainText(line)}</p>
			))}
			{result.reading?.people.map((person) => (
				<section key={person.id} aria-label={`${person.name}'s evening record`}>
					<h4>{person.name}</h4>
					<ol>
						{person.lines.map((line) => (
							<li key={line}>{plainText(line)}</li>
						))}
					</ol>
					<button
						type="button"
						className="text-button"
						onClick={() => select(person.id)}
					>
						Follow {person.name} ↗
					</button>
				</section>
			))}
		</details>
	);
}

function StoryCard({
	s,
	town,
	select,
	capture,
	run = 0,
}: {
	s: StoryGroup;
	town: TownView;
	select: (id: string) => void;
	capture?: () => Promise<unknown>;
	run?: number;
}) {
	return (
		<article className="event" id={storyAnchor(s.id)} tabIndex={-1}>
			<span className="eyebrow">
				{s.at === undefined
					? s.kind
					: `${datedClock(s.at)} · ${s.kind.replaceAll("-", " ")}`}
			</span>
			<h3>{s.title}</h3>
			<div className="story-links">
				{[...new Set([...s.actorIds, ...s.participantIds])].map((id) => {
					const person = town.people.find((person) => person.id === id);
					return person ? (
						<button
							type="button"
							className="text-button"
							key={id}
							onClick={() => select(id)}
						>
							Follow {person.name} ↗
						</button>
					) : null;
				})}
			</div>
			<p>
				{s.summaries.length === 1
					? plainText(s.summaries[0] ?? "")
					: `${s.summaries.length} recorded outcomes from the same class.`}
			</p>
			{capture && ["evening-proposed", "evening-ended"].includes(s.kind) && (
				<EveningRecord
					key={`${run}:${s.id}`}
					town={town}
					story={s}
					capture={capture}
					run={run}
					select={select}
				/>
			)}
			{s.summaries.length > 1 && (
				<details>
					<summary>Recorded outcomes</summary>
					{s.summaries.map((summary) => (
						<p key={summary}>{plainText(summary)}</p>
					))}
				</details>
			)}
		</article>
	);
}
export default function Stories({
	stories,
	town,
	select,
	capture,
	run = 0,
}: {
	stories: StoryGroup[];
	town: TownView;
	select: (id: string) => void;
	capture?: () => Promise<unknown>;
	run?: number;
}) {
	return (
		<>
			{stories.slice(0, 6).map((s) => (
				<StoryCard
					key={`${run}:${s.id}`}
					s={s}
					town={town}
					select={select}
					capture={capture}
					run={run}
				/>
			))}
			{stories.length > 6 && (
				<details className="story-archive">
					<summary>Older stories · {stories.length - 6}</summary>
					<div className="event-grid">
						{stories.slice(6).map((s) => (
							<StoryCard
								key={`${run}:${s.id}`}
								s={s}
								town={town}
								select={select}
								capture={capture}
								run={run}
							/>
						))}
					</div>
				</details>
			)}
		</>
	);
}
