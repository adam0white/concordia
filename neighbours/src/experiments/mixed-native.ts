/** Historical external policy reports are retained verbatim. Current towns use
 * one HF4 Run; an old response tape cannot become a current resident controller. */
export interface ModelReply {
	rawResponse: string;
	provenance: {
		provider: string;
		models: string[];
		requestedModel: string;
		reportedDurationMs?: number;
		reportedCostUsd?: number;
	};
}
export type TownProvider = (prompt: string) => ModelReply;
export class MixedPort {
	constructor(
		_seed: number,
		_population: number,
		_actorId: string,
		_mode: "live" | "replay",
		_provider: TownProvider,
	) {
		throw Error(
			"Historical external-policy continuation is unsupported in the current HF4 town. Keep its report and start fresh.",
		);
	}
}
