import type { Person } from "@adam0white/human-framework";
import type { PersonView } from "../contracts.ts";

/** Retained explained cases, not inferred skill or a claim about present timber. */
export function personLessons(person: Person): PersonView["lessons"] {
	const lessons: NonNullable<PersonView["lessons"]> = [];
	for (const rule of person.methods?.rules ?? []) {
		if (
			rule.id !== "hall-section-inspection" ||
			rule.conditions.length !== 2 ||
			!rule.evidence.length ||
			!rule.conditions.some(
				(c) => c.cue === "hall-support" && c.value === "sound",
			)
		)
			continue;
		const moisture = rule.conditions.find(
			(c) => c.cue === "hall-moisture",
		)?.value;
		const label =
			moisture === "dry" && rule.action === "open-section"
				? "Dry timber and sound supports: open this section"
				: moisture === "wet" && rule.action === "keep-closed"
					? "Wet timber and sound supports: keep this section closed"
					: undefined;
		if (!label) continue;
		lessons.push({
			id: `${rule.id}:${rule.action}`,
			label,
			at: Math.max(...rule.evidence.map((e) => e.at)),
			sourceIds: [...new Set(rule.evidence.map((e) => e.sourceId))].sort(),
			successes: rule.evidence.filter((e) => e.outcome === "success").length,
			failures: rule.evidence.filter((e) => e.outcome === "failure").length,
		});
	}
	return lessons.length ? lessons : undefined;
}
