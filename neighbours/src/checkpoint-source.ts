/** Local receipt consistency only; neither this check nor a digest proves custody. */
import type { TownPacket } from "./cast-session.ts";
import { canonicalHash } from "./core/hf4-canonical.ts";

export const checkpointChapter = (packet: TownPacket) =>
	canonicalHash({
		seed: packet.runtime.physical.seed,
		hf: packet.runtime.hf,
		initial:
			packet.runtime.format === "neighbours-journal"
				? packet.runtime.owner.journal.opening.initial
				: packet.runtime.owner.run.initial,
	});

/** Shared by browser admission and native CLI; preserve the original receipt. */
export function checkpointSources(packet: TownPacket): Record<string, unknown> {
	if (packet.castLocal?.heads.length)
		throw Error(
			"Current shared per-actor custody cannot be resumed by this published Neighbours contract. Keep the source file.",
		);
	if (
		packet.castLocal &&
		packet.castLocal.chapter !== checkpointChapter(packet)
	)
		throw Error("Native town identity differs from its local receipt.");
	const sources = structuredClone(packet.castLocal?.sources ?? {});
	if (!sources || typeof sources !== "object" || Array.isArray(sources))
		throw Error("Invalid archived source journal");
	for (const [digest, body] of Object.entries(sources))
		if (!/^[a-f0-9]{64}$/.test(digest) || canonicalHash(body) !== digest)
			throw Error("Archived source journal digest differs");
	return sources;
}
