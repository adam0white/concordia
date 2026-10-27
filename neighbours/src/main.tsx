import { classifyEntry } from "./entry";

const entry = classifyEntry(new URL(location.href));
if (entry.kind === "redirect") location.replace(entry.href);
else if (entry.kind === "refuse") {
	const root = document.getElementById("root");
	if (root)
		root.textContent =
			"Invalid file entry. Open /file/ to choose a saved town.";
} else void import("./render");
