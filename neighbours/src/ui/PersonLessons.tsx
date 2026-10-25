import type { PersonView, TownView } from "../contracts";
import { datedClock } from "./format";
import { plainText } from "./plain-english";

const sourceLabel = (id: string, people: Pick<PersonView, "id" | "name">[]) =>
	people.find((person) => person.id === id)?.name ??
	(["prior-trade-course", "trade-course"].includes(id)
		? "Prior trade course"
		: id.replaceAll("-", " ").replaceAll("_", " "));
export default function PersonLessons({
	person,
	town,
}: {
	person: Pick<PersonView, "lessons">;
	town: Pick<TownView, "people">;
}) {
	if (!person.lessons?.length) return null;
	return (
		<details className="person-lessons">
			<summary>
				Lessons received <span>{person.lessons.length}</span>
			</summary>
			<p className="tiny muted">
				These records show which examples the person received. They do not prove
				that the person has mastered the skill.
			</p>
			{person.lessons
				.toSorted((a, b) => b.at - a.at)
				.map((lesson) => (
					<div className="lesson-evidence" key={lesson.id}>
						<p>{plainText(lesson.label)}</p>
						<time className="tiny muted">
							Received · {datedClock(lesson.at)}
						</time>
						<p className="tiny">
							Sources:{" "}
							{lesson.sourceIds
								.map((id) => sourceLabel(id, town.people))
								.join(", ") || "No named source recorded"}
						</p>
						<p className="tiny muted">
							Recorded successes: {lesson.successes} · failures:{" "}
							{lesson.failures}
						</p>
					</div>
				))}
		</details>
	);
}
