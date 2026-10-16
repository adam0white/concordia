import type { PersonView } from "../contracts";
import { datedClock } from "./format";

const statusLabel = (status: string) =>
	status[0]?.toUpperCase() + status.slice(1);
export default function PersonPromises({
	person,
	now,
	mode = "all",
}: {
	person: Pick<PersonView, "commitments" | "lifeState">;
	now: number;
	mode?: "all" | "current" | "history";
}) {
	const promises = person.commitments.toSorted((a, b) => b.at - a.at);
	if (!promises.length) return null;
	const canPromise = !["dead", "downed", "break"].includes(
		person.lifeState ?? "awake",
	);
	const pending = canPromise
		? promises.findLast((p) => p.status === "pending")
		: undefined;
	const current =
		pending ??
		promises.find((p) => ["kept", "broken", "released"].includes(p.status));
	const occurrences = new Map<string, number>();
	const history = promises
		.filter((p) => p !== current)
		.map((promise) => {
			const value = JSON.stringify([promise.at, promise.label]);
			const occurrence = occurrences.get(value) ?? 0;
			occurrences.set(value, occurrence + 1);
			return { promise, key: `${value}:${occurrence}` };
		});
	if (mode === "history" && !history.length) return null;
	return (
		<section className="person-promises" aria-label="Promises">
			{mode !== "history" && current && (
				<div className={pending ? "commitment" : "promise-result"}>
					<span className="eyebrow">
						{pending
							? `Promise · Pending${pending.at < now ? " · deadline passed" : ""}`
							: `Promise result · ${statusLabel(current.status)}`}
					</span>
					<p>{current.label}</p>
					<time className="tiny muted">
						Deadline · {datedClock(current.at)}
					</time>
				</div>
			)}
			{mode !== "current" && history.length > 0 && (
				<details className="promise-history">
					<summary>Other promises · {history.length}</summary>
					{history.map(({ promise, key }) => (
						<div key={key}>
							<p>{promise.label}</p>
							<span className="tiny muted">
								{statusLabel(promise.status)} · deadline{" "}
								{datedClock(promise.at)}
							</span>
						</div>
					))}
				</details>
			)}
		</section>
	);
}
