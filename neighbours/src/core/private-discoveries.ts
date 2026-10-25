/** These are private author facts, disclosed only by a chosen in-person encounter.
 * No confession completes the larger biography outcome or grants a qualification.
 */
export const PRIVATE_DISCOVERIES: Record<
	string,
	{ cue: string; fact: string }
> = {
	ada: {
		cue: "Ask about the prototype handle",
		fact: "Nora says the first version of the handle came from her brother’s repair. At an exhibition, she let people call it entirely her own invention. She wants people to test it and wants her brother to receive proper credit. Neither has happened yet.",
	},
	sam: {
		cue: "Ask about the testing notebook",
		fact: "Sam says he once submitted another player’s bug report without checking the bug himself. He has not corrected that old report yet. He asks you to be clear about what he checked and what he only suspects.",
	},
	elin: {
		cue: "Ask whether she wants to discuss training",
		fact: "Derya chooses to tell you that she reported a scheduling error before anyone was harmed. She later stopped receiving training invitations. She does not know whether this was connected to her report. She keeps her letters and her brother’s life private.",
	},
	ravi: {
		cue: "Ask what the unfinished repair needs",
		fact: "Rafi says he accepted a deposit before checking whether he could get a part. He then used some of the money for this workshop trip. He is still learning. He still owes the deposit. This conversation does not repay the money or repair the appliance.",
	},
	jo: {
		cue: "Ask about the small folding lamp",
		fact: "Bilal chooses to show you briefly how to make a heron shadow. He learned the shapes with his stepchild during a power cut. He chooses to share this private pastime. He has not agreed to perform at the hall.",
	},
	noor: {
		cue: "Ask about the rest-stop sketch",
		fact: "Ece shows you her own map of places where people can sit without buying anything. She checks shade, seat backs and closing hours. She made the map informally as a worker. It is not an official accessibility survey.",
	},
};
