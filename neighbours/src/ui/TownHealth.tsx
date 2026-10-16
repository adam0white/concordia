import type { TownView } from "../contracts";

const measures = [
	["alive", "Living"],
	["dead", "Dead"],
	["underfed", "Underfed"],
	["lowHealth", "Low health"],
	["penniless", "Penniless"],
	["meals", "Meals in stock"],
] as const;
type Measure = (typeof measures)[number][0];
export interface HealthSample {
	at: number;
	values: Partial<Record<Measure, number>>;
}
export interface HealthHistory {
	seed: number;
	samples: HealthSample[];
}
/** UI observations only. Never fills gaps or reads the canonical save. */
export function sampleHealth(
	previous: HealthHistory | undefined,
	town: TownView,
): HealthHistory {
	const last = previous?.samples.at(-1);
	const samples =
		previous?.seed === town.seed && last && last.at <= town.now
			? [...previous.samples]
			: [];
	const values: HealthSample["values"] = {};
	for (const [key] of measures) {
		const value =
			key === "meals"
				? town.places.find((p) => p.id === "market")?.stock
				: town.stats[key];
		if (typeof value === "number" && Number.isFinite(value))
			values[key] = value;
	}
	const next = { at: town.now, values };
	if (samples.at(-1)?.at === town.now) samples[samples.length - 1] = next;
	else samples.push(next);
	return { seed: town.seed, samples: samples.slice(-160) };
}
const time = (minute: number) =>
	`Day ${Math.floor(minute / 1440) + 1} ${String(Math.floor(minute / 60) % 24).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
const number = (value: number) =>
	Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1);
export default function TownHealth({
	history,
}: {
	history: HealthHistory | undefined;
}) {
	const samples = history?.samples ?? [];
	const current = samples.at(-1);
	return (
		<details className="comparison town-health">
			<summary>Town health</summary>
			<div className="health-heading">
				<span className="eyebrow">While watching</span>
				<span className="tiny muted">
					{samples.length} observed{" "}
					{samples.length === 1 ? "sample" : "samples"}
					{samples[0] && current
						? ` · ${time(samples[0].at)} → ${time(current.at)}`
						: ""}
				</span>
			</div>
			<div className="health-measures">
				{measures.map(([key, label]) => {
					const points = samples.filter((s) => s.values[key] !== undefined);
					const values = points.map((s) => s.values[key] as number);
					const min = Math.min(...values),
						max = Math.max(...values),
						range = max - min || 1;
					const start = samples[0]?.at ?? 0,
						span = (current?.at ?? start) - start || 1;
					const positions = points
						.map(
							(sample) =>
								`${((sample.at - start) / span) * 130},${24 - (((sample.values[key] ?? 0) - min) / range) * 20}`,
						)
						.join(" ");
					const value = current?.values[key];
					return (
						<div className={`health-measure health-${key}`} key={key}>
							<span>{label}</span>
							<strong>
								{value === undefined ? "Not reported" : number(value)}
							</strong>
							<svg
								viewBox="0 0 132 28"
								role="img"
								aria-label={
									points.length
										? `${label}: ${value === undefined ? "current value not reported" : number(value)}. While watching: ${points.length} observed samples; minimum ${number(min)}, maximum ${number(max)}.`
										: `${label}: no samples reported.`
								}
							>
								<title>{label} · while watching</title>
								{points.length > 1 ? (
									<polyline
										points={positions}
										fill="none"
										stroke="currentColor"
										strokeWidth="2"
									/>
								) : points.length === 1 ? (
									<circle cx="1" cy="14" r="2" fill="currentColor" />
								) : null}
							</svg>
						</div>
					);
				})}
			</div>
			<p className="tiny muted health-note">
				Underfed: food reserve below 10%. Low health: below 50%. Penniless: no
				money. Lines join observed snapshots; no earlier history is inferred.
			</p>
		</details>
	);
}
