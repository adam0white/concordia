import type { TownView } from "../contracts";
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
}: {
	town: Pick<TownView, "now" | "handcart" | "people">;
	select: (id: string) => void;
}) {
	const cart = town.handcart;
	if (!cart) return null;
	const stage = cart.returned
		? "Back with Jo"
		: cart.progress >= cart.total
			? "Ready to return"
			: cart.progress > 0
				? "Repair in progress"
				: "Waiting for repair";
	return (
		<section className="handcart-card" aria-label="Jo's handcart">
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
					<h3>Jo’s handcart</h3>
					<p className="tiny">
						{stage} · {cart.progress}/{cart.total} work periods
					</p>
				</div>
			</div>
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
