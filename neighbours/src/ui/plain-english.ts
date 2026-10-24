/** Display projections only. Recorded text, HF state and rule hashes stay unchanged. */
const words: Record<string, string> = {
	"A repair designer sharing the workshop; her older brother lives elsewhere.":
		"She designs repairs and shares the workshop. Her older brother lives elsewhere.",
	"A night nurse on a bounded relief visit. Morning sleep matters; her family is private.":
		"She is a night nurse here for a short relief visit. She needs to sleep in the morning. She keeps her family life private.",
	"An eighteen-year-old repair apprentice helping with the shared meal, with experienced kitchen cover.":
		"He is eighteen and is learning to repair things. He helps with the shared meal while an experienced person covers the kitchen.",
	"A maintenance technician helping move supplies during a bounded stay; his spouse and stepchild are at home.":
		"He is a maintenance technician helping move supplies during a short stay. His spouse and stepchild are at home.",
	"A nineteen-year-old dish worker on a workshop exchange. He asks before borrowing tools.":
		"He is nineteen and washes dishes for work. He is visiting on a workshop exchange. He asks before borrowing tools.",
	"A courier and part-time logistics student on a temporary supply exchange. She lives with her aunt at home.":
		"She is a courier and studies logistics part time. She is visiting on a temporary supply exchange. She lives with her aunt at home.",
	"Meals reserved when an activity starts.":
		"Meals are reserved when an activity starts.",
	"Shared town space.": "People share this town space.",
	"Not now — after I pray.": "Not now. I need to pray first.",
	"Find your feet": "Choose where to walk",
	"Set on": "Plans to continue",
	"Nothing recorded yet. Your own steps will appear here.":
		"You have not taken any actions yet. Your actions will appear here.",
	"Share a bounded private confidence": "Share a private detail",
	"Still sore about a promise you broke":
		"They are still upset about a promise you broke",
	"Bristling at being pushed": "They are upset about being pushed",
	"Cooler towards you than before":
		"They are less friendly towards you than before",
	"Leaning towards": "They are considering",
	"Willing to hear you out": "They are willing to listen to you",
	"Cautious with you": "They are cautious with you",
	"Wary of you": "They do not trust you much",
	"Doing it under protest": "They are doing it despite their objections",
	"Does not know you well": "They do not know you well",
	"Remembers you kept your word": "They remember that you kept your promise",
	"Trusts your word": "They trust your promises",
};
export function plainText(text: string): string {
	const exact = words[text];
	if (exact) return exact;
	return text
		.replace(
			/^(\d+)\/12 repairs; closed pending safe inspection$/,
			"$1 of 12 repairs are complete. The hall stays closed until it passes a safety inspection.",
		)
		.replace(
			/^(\d+)\/12 repairs; open after inspection$/,
			"$1 of 12 repairs are complete. The hall passed its inspection and is open.",
		)
		.replace(/^Set on (.+)$/, "They plan to continue $1")
		.replace(/^Leaning towards (.+)$/, "They are considering $1")
		.replace(/I’ve /g, "I have ")
		.replace(/Not that — I’d rather /g, "No. I would rather ")
		.replace(/during a bounded visit/g, "during a short visit")
		.replace(
			/Your promise to (.+?) stood:/g,
			"Your promise to $1 was accepted:",
		)
		.replace(
			/Your offered hour for (.+?) no longer stands:/g,
			"Your offered hour for $1 was cancelled:",
		)
		.replace(
			/act on your word for an evening/g,
			"accept your request to help with an evening",
		)
		.replace(/hemmed in/g, "restricted")
		.replace(/adrift/g, "unsure of their purpose")
		.replace(/low in themselves/g, "unhappy with themselves");
}
/** Current impressions have no subject in old saves. Supply the selected person's name. */
export function personRead(name: string, text: string): string {
	const parts = plainText(text).split(/(?<=\.)\s+/);
	return parts
		.map((part, index) => {
			if (!part) return part;
			if (part === "Nothing pressing.") return "No need seems urgent.";
			const lower = part[0]?.toLowerCase() + part.slice(1);
			if (index === 0) return `${name} looks ${lower}`;
			if (/^Promised to /.test(part))
				return `${name} promised to ${part.slice(12)}`;
			if (/^Expected to /.test(part))
				return `${name} is expected to ${part.slice(12)}`;
			if (/^Due at work to /.test(part))
				return `${name} is due at work to ${part.slice(15)}`;
			if (/^Has to /.test(part)) return `${name} has to ${part.slice(7)}`;
			return part;
		})
		.join(" ");
}
