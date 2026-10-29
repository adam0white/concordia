/** Named prose fields are blanked. Nine rewritten labels map one-to-one to their original identities. Other labels remain exact. IDs, keys, reasons, action history and numbers remain exact. */
const PROSE_FIELDS = new Set([
	"text",
	"summary",
	"description",
	"says",
	"chosenLabel",
	"insteadLabel",
]);
const LABEL_ALIASES = new Map<string, string>([
	[
		"Move the supplies agreed for this visit",
		"Move supplies within the agreed scope",
	],
	[
		"Practise repairs with workshop supervision",
		"Practise repairs with workshop cover",
	],
	[
		"Keep the prayer appointment they received",
		"Keep the received prayer appointment",
	],
	[
		"Teach a practical repair class that moved after the flood",
		"Teach a displaced practical repair class",
	],
	[
		"Teach the evening class that moved after the flood",
		"Teach the displaced evening class",
	],
	[
		"Leave a note asking someone to check the supports",
		"Leave a note requesting a structural opinion",
	],
	[
		"Sleep in the morning after night work; cover shifts later",
		"Morning sleep after night work; relief duties wait",
	],
	[
		"Keep the clinic open during the agreed shift",
		"Keep the relief clinic open within the agreed shift",
	],
	[
		"Help prepare the shared meal with an experienced kitchen worker",
		"Help prepare the shared meal with kitchen cover",
	],
]);
export function proseFree(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(proseFree);
	if (value && typeof value === "object")
		return Object.fromEntries(
			Object.entries(value).map(([key, item]) => [
				key,
				key === "label" && typeof item === "string"
					? (LABEL_ALIASES.get(item) ?? item)
					: PROSE_FIELDS.has(key) && typeof item === "string"
						? ""
						: proseFree(item),
			]),
		);
	return value;
}
