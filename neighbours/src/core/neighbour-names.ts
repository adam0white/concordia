import { keyed } from "./hash.ts";

const givenNames = [
	"Alex",
	"Ariel",
	"Avery",
	"Blair",
	"Cameron",
	"Casey",
	"Charlie",
	"Ellis",
	"Finley",
	"Frankie",
	"Hayden",
	"Jamie",
	"Jordan",
	"Morgan",
	"Quinn",
	"Reese",
	"Robin",
	"Rowan",
];
const surnames = [
	"Brooks",
	"Carter",
	"Chen",
	"Das",
	"Diaz",
	"Evans",
	"Grant",
	"Khan",
	"Kim",
	"Lane",
	"Martin",
	"Patel",
	"Reed",
	"Rivera",
	"Singh",
	"Silva",
	"Stone",
	"Ward",
];

/** Synthetic labels only. The keyed ordering never draws from a person's RNG. */
export function neighbourNames(seed: number): string[] {
	return givenNames
		.flatMap((given) => surnames.map((surname) => `${given} ${surname}`))
		.map((name, index) => ({
			name,
			index,
			order: keyed(seed, 0, `neighbour-name:${name}`),
		}))
		.sort((a, b) => a.order - b.order || a.index - b.index)
		.map(({ name }) => name);
}
