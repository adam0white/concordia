/** Diagnostics require the exact owner-only URL flag. */
export function labMode(
	search = typeof location === "undefined" ? "" : location.search,
): boolean {
	return new URLSearchParams(search).get("lab") === "1";
}
