import type { PersonView } from "../contracts";

export default function PersonPurposes({
	person,
}: {
	person: Pick<PersonView, "purposes">;
}) {
	if (!person.purposes?.length) return null;
	return (
		<details className="person-purposes">
			<summary>
				Purposes <span>{person.purposes.length}</span>
			</summary>
			{person.purposes.map((purpose) => (
				<div className="purpose-state" key={purpose.id}>
					<p>{purpose.label}</p>
					<span className="tiny muted">
						{purpose.status.replaceAll("-", " ")} ·{" "}
						{Math.round(purpose.progress * 100)}%
					</span>
					<progress
						max={1}
						value={purpose.progress}
						aria-label={`${purpose.label} progress`}
					/>
				</div>
			))}
		</details>
	);
}
