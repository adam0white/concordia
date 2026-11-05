import type { TownView } from "../contracts.ts";
import { nativeMilliseconds } from "./hf4-run.ts";
import { usesActivitySlot } from "./offers.ts";
import type { Save } from "./state.ts";

type Diagnostic = TownView["diagnostics"][number];
/** Derived checks never alter a person's state or force a desired outcome. */
export function townDiagnostics(s: Save): Diagnostic[] {
	const out: Diagnostic[] = [];
	const error = (code: string, message: string) =>
		out.push({ code, message, severity: "error" });
	if (
		nativeMilliseconds(s.now) !== s.owner.at ||
		s.people.some((r) => {
			const actor = r.owner.actor(r.id);
			return actor.body.alive
				? actor.now !== s.owner.at
				: actor.now > s.owner.at;
		})
	)
		error("CLOCK_DIVERGENCE", "The town and resident clocks disagree.");
	const reservedFood = s.people.reduce((n, r) => n + (r.job?.food ?? 0), 0);
	const stock = s.places.reduce((n, p) => n + p.stock, 0);
	if (
		stock + reservedFood + s.consumed !== s.initialFood + s.produced ||
		s.places.some((p) => p.stock < 0)
	)
		error(
			"FOOD_CONSERVATION",
			"The amounts of food available, reserved and eaten do not add up correctly.",
		);
	for (const p of s.places) {
		const reserved = s.people.filter(
			(r) => r.job?.offer.placeId === p.id && usesActivitySlot(r.job.offer),
		).length;
		if (p.reserved !== reserved || p.reserved > p.capacity || p.reserved < 0)
			error(
				"ACTIVITY_RESERVATION",
				`The activity reservations at ${p.name} are invalid or do not match the activities in progress.`,
			);
	}
	const tools = s.tools + s.people.reduce((n, r) => n + (r.job?.tools ?? 0), 0);
	if (
		s.tools < 0 ||
		tools < 3 ||
		tools > 3 + 3 * (3 - s.controls) ||
		tools % 3 !== 0
	)
		error(
			"TOOL_CONSERVATION",
			"Available tools and tools in use do not balance.",
		);
	if (
		s.people.some(
			(r) =>
				(Boolean(r.job) !== Boolean(r.owner.actor(r.id).activity) ||
					(r.job && r.job.end <= s.now)) &&
				!s.owner.pending.some(
					(request) => request.kind === "action" && request.person === r.id,
				),
		)
	)
		error(
			"ACTIVITY_TRACKING",
			"A person's work in the town does not match their recorded activity.",
		);
	if (s.hall < 0 || s.hall > 12 || (s.hallSafe && s.hall < 12))
		error("HALL_STATE", "The hall's repair or opening records do not match.");
	if (s.hall === 12 && !s.hallSafe) {
		const lastInspection = s.people
			.flatMap((r) => (r.inspection ? [r.inspection] : []))
			.sort(
				(a, b) => b.at - a.at || (b.event?.id ?? 0) - (a.event?.id ?? 0),
			)[0];
		out.push({
			code: "INSPECTION_PENDING",
			message: lastInspection
				? `${lastInspection.result} The hall needs safe conditions and another inspection before it can reopen. People may have other priorities.`
				: "The repairs are finished. An inspection has not yet found the hall safe to open. People may have other priorities.",
			severity: "info",
		});
	}
	const market = s.places.find((p) => p.id === "market");
	if (market?.stock === 0)
		out.push({
			code: "MEALS_RESERVED",
			message:
				"All meals at the market have been reserved or used. Gardening, deliveries and carrying food can add more meals.",
			severity: "warning",
		});
	out.push({
		code: "PERSISTENT_PERSONS",
		message:
			"Every resident keeps their own HF person state over time. Each person’s decision policy is labelled.",
		severity: "info",
	});
	return out;
}
