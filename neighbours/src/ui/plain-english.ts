/** Source prose is already written for display. HF narration stays as received. */
export function plainText(text: string): string {
	return text;
}

/** The host now supplies complete sentences for current impressions. */
export function personRead(_name: string, text: string): string {
	return text;
}
