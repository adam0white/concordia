import type { PersonView } from "../contracts";

const progressWords = (progress: number) =>
	progress >= 1
		? "done"
		: progress >= 0.66
			? "nearly finished"
			: progress >= 0.33
				? "in progress"
				: progress > 0
					? "just started"
					: "not started";

export default function PersonPurposes({
	person,
}: {
	person: Pick<PersonView, "purposes">;
}) {
	if (!person.purposes?.length) return null;
	return (
		<details className="person-purposes">
			<summary>
				Goals <span>{person.purposes.length}</span>
			</summary>
			{person.purposes.map((purpose) => (
				<div className="purpose-state" key={purpose.id}>
					<p>{purpose.label}</p>
					<span className="tiny muted">
						<span className="hand">
							{purpose.status === "abandoned"
								? "No longer pursuing this goal"
								: purpose.status === "achieved"
									? "Goal reached"
									: progressWords(purpose.progress)}
						</span>
					</span>
				</div>
			))}
		</details>
	);
}
