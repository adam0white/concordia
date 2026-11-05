/** Historical HF3 two-step report remains unchanged in public/experiments. */
export function runReceivedConsequenceControl(
	_domain: "parcel" | "sample" = "parcel",
): never {
	throw Error(
		"Historical HF3 experiment. Current HF4 controls require a public Run fixture.",
	);
}
