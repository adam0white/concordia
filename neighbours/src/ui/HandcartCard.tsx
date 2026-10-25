import { useState } from "react";
import type { TownView } from "../contracts";
import type { BenchSlot } from "../core/bench-window";
import { clock, datedClock } from "./format";

export function CartGlyph({
	progress = 0,
	total = 3,
}: {
	progress?: number;
	total?: number;
}) {
	return (
		<g className="cart-drawing">
			<path d="M18 48H94M26 43l-4 16m62-16 4 16M94 22l19-9" />
			{[0, 1, 2].map((i) => (
				<rect
					key={i}
					x={18 + i * 25}
					y="22"
					width="25"
					height="22"
					rx="2"
					className={
						i < (progress / Math.max(1, total)) * 3
							? "cart-section cart-section-complete"
							: "cart-section"
					}
				/>
			))}
			<circle cx="27" cy="59" r="10" />
			<circle cx="83" cy="59" r="10" />
			<path d="M27 53v12m-6-6h12m50-6v12m-6-6h12" />
		</g>
	);
}

export default function HandcartCard({
	town,
	select,
	onPropose,
	onCompare,
	disabled = false,
}: {
	town: Pick<TownView, "now" | "handcart" | "people">;
	select: (id: string) => void;
	onPropose?: (slot: BenchSlot) => void;
	onCompare?: (slot: BenchSlot) => void;
	disabled?: boolean;
}) {
	const [slot, setSlot] = useState<BenchSlot>("soon");
	const cart = town.handcart;
	const owner = town.people.find((p) => p.id === "jo")?.name ?? "Bilal";
	const learner = town.people.find((p) => p.id === "ravi")?.name ?? "Rafi";
	const designer = town.people.find((p) => p.id === "ada")?.name ?? "Nora";
	if (!cart) return null;
	const stage = cart.returned
		? `Back with ${owner}`
		: cart.progress >= cart.total
			? "Ready to return"
			: cart.progress > 0
				? "Repair in progress"
				: "Waiting for repair";
	return (
		<section className="handcart-card" aria-label={`${owner}'s handcart`}>
			<div className="handcart-overview">
				<svg
					viewBox="0 0 120 75"
					role="img"
					aria-label={`Cart restoration: ${cart.progress} of ${cart.total} work periods completed`}
				>
					<CartGlyph progress={cart.progress} total={cart.total} />
				</svg>
				<div>
					<span className="eyebrow">A neighbour’s repair</span>
					<h3>{owner}’s handcart</h3>
					<p className="tiny">
						{stage} · {cart.progress}/{cart.total} work periods
					</p>
				</div>
			</div>
			{cart.canProposeBench && onPropose && (
				<div className="bench-discussion">
					<label>
						Suggest a time to use the bench
						<select
							value={slot}
							disabled={disabled}
							onChange={(e) => setSlot(e.target.value as BenchSlot)}
						>
							<option value="soon">Soon · four hours</option>
							<option value="tomorrow">Tomorrow · four hours</option>
							<option value="brief">Brief · thirty minutes</option>
						</select>
					</label>
					<p className="tiny muted">
						{designer} decides whether to lend it. One section needs an hour.
					</p>
					<div className="button-row">
						<button
							type="button"
							disabled={disabled}
							onClick={() => onPropose(slot)}
						>
							Tell {learner} · 1 credit
						</button>
						{onCompare && (
							<button
								type="button"
								disabled={disabled}
								onClick={() => onCompare(slot)}
							>
								Compare first
							</button>
						)}
					</div>
				</div>
			)}
			{cart.opportunity && (
				<p className="tiny muted">
					{town.now >= cart.opportunity.until
						? "The proposed time has passed"
						: cart.opportunity.received
							? `${learner} heard about the proposed time`
							: `${learner} did not hear about the proposed time`}{" "}
					· {datedClock(cart.opportunity.from)}–{clock(cart.opportunity.until)}
					{cart.opportunity.origin.kind === "recorded-gm"
						? " · Recorded GM proposal"
						: " · Authored proposal"}
					. {cart.bench ? "" : "The bench is not booked."}
				</p>
			)}
			{cart.completedAt !== undefined && (
				<p className="tiny muted">
					Repairs finished {datedClock(cart.completedAt)}
					{cart.returnedAt !== undefined
						? ` · Returned ${datedClock(cart.returnedAt)}`
						: ` · Waiting to be returned to ${owner}`}
				</p>
			)}
			<div className="handcart-people">
				{["ravi", "ada", "jo"].flatMap((id) => {
					const person = town.people.find((person) => person.id === id);
					return person
						? [
								<button
									key={id}
									type="button"
									className="text-button"
									aria-label={`Follow ${person.name} for the handcart`}
									onClick={() => select(id)}
								>
									{person.name} ↗
								</button>,
							]
						: [];
				})}
			</div>
			{(cart.latest || cart.bench || cart.requests > 0) && (
				<details>
					<summary>Latest cart activity</summary>
					{cart.latest && (
						<p className="tiny">
							<span className="muted">{datedClock(cart.latest.at)}</span>
							<br />
							{cart.latest.text}
						</p>
					)}
					{cart.bench && (
						<p className="tiny">
							Main bench booking · {datedClock(cart.bench.from)}–
							{clock(cart.bench.until)}
						</p>
					)}
					{cart.requests > 0 && (
						<p className="tiny muted">
							{cart.requests} bench{" "}
							{cart.requests === 1 ? "request" : "requests"} recorded
						</p>
					)}
				</details>
			)}
		</section>
	);
}
