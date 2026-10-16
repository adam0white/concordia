import type { PersonView } from "../contracts";
import { datedClock } from "./format";

const statusLabel = (status: string) =>
	status[0]?.toUpperCase() + status.slice(1);
export default function PersonPromises({
	person,
	now,
}: {
	person: Pick<PersonView, "commitments" | "lifeState">;
	now: number;
}) {
	const promises = person.commitments.toSorted((a, b) => b.at - a.at);
	if (!promises.length) return null;
	const pending = promises.findLast((promise) => promise.status === "pending");
	const closed = promises.find((promise) =>
		["kept", "broken", "released"].includes(promise.status),
	);
	const occurrences = new Map<string, number>();
	const history = promises.map((promise) => {
		const value = JSON.stringify([promise.at, promise.label]);
		const occurrence = occurrences.get(value) ?? 0;
		occurrences.set(value, occurrence + 1);
		return { promise, key: `${value}:${occurrence}` };
	});
	const canPromise = !["dead", "downed", "break"].includes(
		person.lifeState ?? "awake",
	);
	return (
		<section className="person-promises" aria-label="Promises">
			{pending && canPromise && (
				<div className="commitment">
					<span className="eyebrow">
						Promise · Pending{pending.at < now ? " · deadline passed" : ""}
					</span>
					<p>{pending.label}</p>
					<time className="tiny muted">
						Deadline · {datedClock(pending.at)}
					</time>
				</div>
			)}
			{closed && (
				<div className="promise-result">
					<span className="eyebrow">
						Promise result · {statusLabel(closed.status)}
					</span>
					<p>{closed.label}</p>
					<time className="tiny muted">Deadline · {datedClock(closed.at)}</time>
				</div>
			)}
			<details className="promise-history">
				<summary>Promise history · {promises.length}</summary>
				{history.map(({ promise, key }) => (
					<div key={key}>
						<p>{promise.label}</p>
						<span className="tiny muted">
							{statusLabel(promise.status)} · deadline {datedClock(promise.at)}
						</span>
					</div>
				))}
			</details>
		</section>
	);
}
