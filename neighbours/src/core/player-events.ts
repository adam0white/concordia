/** Event kinds recorded for the player's own actions and what they set in motion. */
export const PLAYER_EVENT_KINDS = [
	"player-returned",
	"player-moved",
	"player-arrived",
	"player-request",
	"player-answer",
	"player-decided",
	"player-pledge",
	"player-work-started",
	"player-work-done",
	"player-pledge-lapsed",
	"player-pledge-released",
] as const;
