import type { Input } from "@adam0white/human-framework";
import { nativeMilliseconds } from "./hf4-run.ts";
import type { Save } from "./state.ts";

type GoalRequest = Extract<
	Input,
	{ kind: "agenda.requested" }
>["payload"]["request"];
type NativeGoal = Extract<GoalRequest, { type: "goal" }>["goal"];
type Commitment = Extract<GoalRequest, { type: "commit" }>["commitment"];
export type HostGoal = Pick<
	NativeGoal,
	"label" | "serves" | "importance" | "advancedBy"
> & { deadline?: number };
export type HostCommitment = Omit<
	Commitment,
	"id" | "from" | "until" | "recurEveryMs"
> & { from: number; until: number; recurEvery?: number };
// SCOPE: explicit host evidence inputs. These helpers never edit the readonly native actor snapshot.
export function addGoal(
	s: Save,
	person: string,
	goal: HostGoal,
): { id: string } {
	const pending = s.owner.queuedGoal(person, goal.label);
	if (
		pending?.kind === "agenda.requested" &&
		pending.payload.request.type === "goal"
	)
		return { id: pending.payload.request.goal.id };
	const id = s.owner.allocate(`goal:${person}`);
	s.owner.enqueue("agenda.requested", {
		person,
		request: {
			type: "goal",
			goal: {
				...goal,
				id,
				progress: 0,
				baseImportance: goal.importance,
				completionHalfLifeMs: 7200000,
				...(goal.deadline === undefined
					? {}
					: { deadline: nativeMilliseconds(goal.deadline) }),
			},
		},
	});
	return { id };
}
export function addCommitment(
	s: Save,
	person: string,
	commitment: HostCommitment,
): { id: string } {
	const id = s.owner.allocate(`promise:${person}`);
	const { recurEvery, ...rest } = commitment;
	s.owner.enqueue("agenda.requested", {
		person,
		request: {
			type: "commit",
			commitment: {
				...rest,
				id,
				from: nativeMilliseconds(commitment.from),
				until: nativeMilliseconds(commitment.until),
				...(recurEvery === undefined
					? {}
					: { recurEveryMs: nativeMilliseconds(recurEvery) }),
			},
		},
	});
	return { id };
}
export function abandonHostGoal(s: Save, person: string, goalId: string): void {
	s.owner.enqueue("agenda.requested", {
		person,
		request: { type: "abandon-goal", goalId },
	});
}
export function actualSocial(
	s: Save,
	person: string,
	event: {
		otherId: string;
		kind: Extract<
			Input,
			{ kind: "social.received" }
		>["payload"]["event"]["kind"];
		byMe: boolean;
		magnitude: number;
	},
): void {
	const { otherId, ...data } = event;
	s.owner.enqueue("social.received", {
		person,
		evidenceId: s.owner.allocate(`social:${s.nextEvent}:${person}:${otherId}`),
		other: otherId,
		event: data,
	});
}
