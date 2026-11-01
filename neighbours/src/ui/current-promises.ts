import type { PlayerView } from "../contracts";
import { datedClock } from "./format";

type Pledge = PlayerView["pledges"][number];

/** Display only. Status comes from the public view, never from speech or a deadline guess. */
export function pledgePresentation(pledge: Pledge) {
	const work = `To ${pledge.toName}: ${pledge.label}, by ${datedClock(pledge.dueBy)}.`;
	const status = {
		offered: {
			title: "Your hour is still an offer",
			detail: `You do not owe this hour yet. It becomes a commitment if ${pledge.toName} agrees or later acts on your request.`,
		},
		open: { title: "Keep your promise", detail: "You owe this hour." },
		released: {
			title: "Your hour was released",
			detail: "You no longer owe this hour.",
		},
		kept: {
			title: "You kept your promise",
			detail: "You completed this promised hour.",
		},
		lapsed: {
			title: "Your promise lapsed",
			detail: "You did not keep this hour before its deadline.",
		},
	}[pledge.status];
	return { title: status.title, detail: `${work} ${status.detail}` };
}

/** Keep recorded goal progress intact. Only the current instruction is projected. */
export function currentGuide(
	player: Pick<PlayerView, "goals" | "pledges"> | undefined,
) {
	const goal = player?.goals.find((item) => item.status === "current");
	if (!player) return goal;
	const active =
		player.pledges.find((item) => item.status === "open") ??
		player.pledges.find((item) => item.status === "offered");
	if (!active && goal?.id !== "pledge" && goal?.id !== "objection") return goal;
	const pledge = active ?? player.pledges.at(-1);
	if (!pledge && goal?.id !== "pledge") return goal;
	const presentation = pledge
		? pledgePresentation(pledge)
		: {
				title: "No hour is owed",
				detail: "You have no recorded promise to keep.",
			};
	return {
		...goal,
		id: "pledge",
		title: presentation.title,
		hint: `${presentation.detail}${active?.status === "open" ? " Open the Journal. Under Your promises now, use Start the hour or read why it cannot start." : active?.status === "offered" ? " Wait for an actual agreement or action. You can check the status in the Journal." : " You can walk, talk, or help the town."}`,
	};
}
