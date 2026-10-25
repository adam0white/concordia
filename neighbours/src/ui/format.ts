import type { PlaceView } from "../contracts";

export const clock = (minutes: number) =>
	`${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(Math.floor(minutes % 60)).padStart(2, "0")}`;
export const datedClock = (minutes: number) =>
	`Day ${Math.floor(minutes / 1440) + 1} · ${clock(minutes)}`;
export const placeName = (place: PlaceView) =>
	place.id === "hall" && place.open ? "Community hall" : place.name;
export const initial = (name: string) =>
	name
		.split(" ")
		.map((word) => word[0])
		.slice(0, 2)
		.join("");
export const number = (value: number) =>
	Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1);
export const metricLabel = (key: string) =>
	({
		hallRepairs: "Hall repairs",
		interventionsSpent: "Town credits spent",
		hallSafe: "Hall open",
		tools: "Available tools",
		totalTools: "All shared tools",
		methodLearners: "People with inspection methods",
		active: "People doing an activity",
		hfPeople: "HF-controlled residents",
		persistentPeople: "Persistent residents",
	})[key] ?? key.replaceAll("_", " ").replace(/([a-z])([A-Z])/g, "$1 $2");
