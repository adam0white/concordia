type Entry =
	| { kind: "native" | "file" | "refuse" }
	| { kind: "redirect"; href: string };

/** Pure: run before importing App, Lab, or any native startup module. */
export function classifyEntry(url: URL): Entry {
	const values = url.searchParams.getAll("file");
	if (values.length > 1 || (values.length === 1 && values[0] !== "1"))
		return { kind: "refuse" };
	if (
		values.length ||
		url.pathname === "/file" ||
		url.pathname === "/file/index.html"
	) {
		const target = new URL(url);
		target.pathname = "/file/";
		target.searchParams.delete("file");
		return {
			kind: "redirect",
			href: target.pathname + target.search + target.hash,
		};
	}
	if (url.pathname === "/file/") return { kind: "file" };
	return { kind: "native" };
}
