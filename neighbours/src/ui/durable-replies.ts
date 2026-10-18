import type { UiReply } from "../contracts";

/**
 * Deliver worker replies in arrival order, but hold a reply that carries a checkpoint (a player input's
 * `state`) until `persist` has settled for that checkpoint. Every later reply waits behind it, so the
 * command FIFO bookkeeping never sees replies out of order. A player's answer is therefore never shown
 * before its request and booked costs are on the device: a reload cannot lose the request or let the
 * player ask again from the earlier checkpoint. A failed write still delivers the reply (the caller
 * reports the save as unavailable); it never blocks the town.
 */
export function orderedReplies(
	deliver: (reply: UiReply) => void,
	persist: (reply: UiReply & { save: unknown }) => Promise<void> | undefined,
	report: (error: unknown) => void = (error) =>
		typeof reportError === "function"
			? reportError(error)
			: console.error(error),
): (reply: UiReply) => void {
	let held: Promise<void> | null = null;
	const now = (reply: UiReply): Promise<void> | undefined => {
		const write =
			reply.type === "state" && reply.save !== undefined
				? persist(reply as UiReply & { save: unknown })
				: undefined;
		if (!write) {
			deliver(reply);
			return undefined;
		}
		return write.then(
			() => deliver(reply),
			(error: unknown) => {
				report(error);
				deliver(reply);
			},
		);
	};
	const hold = (next: Promise<void>) => {
		const settled = next.catch(report);
		held = settled;
		void settled.then(() => {
			if (held === settled) held = null;
		});
	};
	return (reply) => {
		if (held) {
			hold(held.then(() => now(reply)));
			return;
		}
		const write = now(reply);
		if (write) hold(write);
	};
}
