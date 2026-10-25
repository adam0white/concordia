/** Display-only corrections. Recorded narration and rule hashes remain unchanged. */
const possessives: Record<string, string> = {
	Nora: "her",
	Derya: "her",
	Ece: "her",
	Sam: "his",
	Bilal: "his",
	Rafi: "his",
};

function guestList(names: string): string {
	const guests = names.split(", ");
	if (guests.length === 1) return names;
	if (guests.length === 2) return guests.join(" and ");
	const others = guests.length - 2;
	return `${guests.slice(0, 2).join(", ")} and ${others} other neighbour${others === 1 ? "" : "s"}`;
}

export function plainText(text: string): string {
	return (
		text
			.replace(
				/([^.!?]+) (ate with the host at|received the practical lesson at) ([^.!?]+)’s (shared supper|practical class)\./g,
				(_all, names: string, action: string, host: string, activity: string) =>
					`${guestList(names)} ${action.startsWith("ate") ? `ate with ${host}` : `received the practical lesson from ${host}`} at ${possessives[host] ?? "the"} ${activity}.`,
			)
			// Only a complete named-subject sentence supplies an owner for a pronoun.
			// A lowercase predicate prevents a full name such as Sam Reed aliasing Sam.
			.replace(
				/(^|[.!?]\s+)(Nora|Derya|Ece|Sam|Bilal|Rafi)( [a-z][^.!?]*)/g,
				(_all, boundary: string, name: string, sentence: string) =>
					`${boundary}${name}${sentence
						.replaceAll(`${name}’s `, `${possessives[name]} `)
						.replaceAll(`${name}'s `, `${possessives[name]} `)}`,
			)
			.replace(
				/at the hall at (Flooded hall|Community hall)/g,
				(_all, place: string) => `at the ${place.toLowerCase()}`,
			)
			.replace(
				/\b0 meals arrived by handcart\./g,
				"No meals arrived by handcart.",
			)
			// The shared action label omits whether the main floor or annex was inspected.
			// Name the known room without inventing a more specific section.
			.replace(
				/\b([Kk]eep|keeping) this section closed/g,
				"$1 the inspected section of the hall closed",
			)
			.replace(
				/\b(After I finish this (?:task|duty)) \(([A-Z])([^)]*)\)/g,
				(_all, prefix: string, first: string, rest: string) =>
					`${prefix} (${first.toLowerCase()}${rest})`,
			)
			.replace(
				/(prepared the hall for the shared supper[^.!?]*\.) The other activity cannot use the same room at that time\./g,
				"$1 The practical class cannot use the hall at that time.",
			)
			.replace(
				/(prepared the hall for the practical class[^.!?]*\.) The other activity cannot use the same room at that time\./g,
				"$1 The shared supper cannot use the hall at that time.",
			)
	);
}

/** A planned drink supports an approximate read, not a claim that drinking has begun. */
export function personRead(name: string, text: string): string {
	if (text === `${name} plans to keep having a drink of water.`)
		return `${name} seems thirsty.`;
	return plainText(text);
}
