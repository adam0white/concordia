/** Synthetic offer control only; not the measured actual checkpoint or an attendance result. */
import { expect, it } from "vitest";
import { differences } from "../scripts/capacity-study.ts";
import { eveningOffers } from "../src/core/evenings.ts";
import { createRuntime, type Save } from "../src/core/index.ts";

it("physical seats alone gate attendance offers while the host keeps a reserved host place", () => {
	const low = createRuntime(42, 6).export() as Save;
	low.hallSafe = true;
	low.now = 1080;
	low.socialEvenings = {
		version: 1,
		openedAt: 480,
		lastCountAt: 1080,
		events: [
			{
				id: "synthetic-capacity-control",
				kind: "class",
				organiserId: "ada",
				startsAt: 1080,
				endsAt: 1140,
				stage: "prepared",
				replies: {
					ravi: { heardAt: 900, reply: "accepted", attendedMinutes: 0 },
				},
			},
		],
	};
	const learner = low.people.find((p) => p.person.id === "ravi");
	const room = low.places.find((p) => p.id === "hall");
	expect(learner && room).toBeTruthy();
	if (!learner || !room) throw Error("Control setup missing");
	learner.place = "hall";
	room.reserved = 9;
	const high = structuredClone(low);
	const larger = high.places.find((p) => p.id === "hall");
	if (!larger) throw Error("Control room missing");
	larger.capacity = 14;
	expect(differences(low, high)).toEqual(["/places/7/capacity"]);
	const offered = (s: Save) =>
		eveningOffers(
			s,
			s.people.find((p) => p.person.id === "ravi") ?? learner,
		).map((o) => o.id);
	expect(offered(low)).not.toContain("attend:synthetic-capacity-control");
	expect(offered(high)).toContain("attend:synthetic-capacity-control");
	// With room for the host and guest, capacity has no effect on the offer.
	room.reserved = 8;
	larger.reserved = 8;
	expect(offered(low)).toEqual(offered(high));
});
