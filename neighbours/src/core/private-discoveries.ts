/** These are private author facts, disclosed only by a chosen in-person encounter.
 * No confession completes the larger biography outcome or grants a qualification.
 */
export const PRIVATE_DISCOVERIES: Record<
	string,
	{ cue: string; fact: string }
> = {
	ada: {
		cue: "Ask about the prototype handle",
		fact: "Nora says the prototype handle began with her brother’s repair. At an exhibition she let it be called wholly original. She wants a user trial and accurate credit; neither has happened yet.",
	},
	sam: {
		cue: "Ask about the testing notebook",
		fact: "Sam says he once submitted another player’s bug description without reproducing it himself. He has not corrected that old report yet. He asks you to distinguish what he checked from what he suspects.",
	},
	elin: {
		cue: "Ask whether she wants to discuss training",
		fact: "Derya chooses to say she reported a scheduling error before anyone was harmed. Training invitations later stopped; she does not know whether the events were connected. Her correspondence and her brother remain private.",
	},
	ravi: {
		cue: "Ask what the unfinished repair needs",
		fact: "Rafi says he accepted a deposit before checking whether a part was obtainable, then used some of it for this workshop trip. He is a learner. The deposit remains owed; this conversation does not repay it or repair the appliance.",
	},
	jo: {
		cue: "Ask about the small folding lamp",
		fact: "Bilal offers a brief shadow-heron demonstration. He learned the shapes with his stepchild during a power cut. This is a willing private diversion, not an agreement to perform at the hall.",
	},
	noor: {
		cue: "Ask about the rest-stop sketch",
		fact: "Ece shows her personal map of places to sit without buying anything. She checks shade, seat backs and closing hours. It is an informal worker’s map, not an official accessibility survey.",
	},
};
