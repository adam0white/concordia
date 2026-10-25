/** Source prose is already written for display. HF narration stays as received. */
export function plainText(text: string): string {
	return text;
}

/** Impressions arrive as complete sentences from the host. */
export function personRead(_name: string, text: string): string {
	return text;
}
