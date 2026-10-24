import { useEffect, useRef, useState } from "react";
import { inkCircle } from "./ink";

/** Shared Field Notebook mark: links back to the Human Framework hub. */
export function HubMark() {
	return (
		<a className="hub-mark" href="https://human.adamwhite.work">
			<span aria-hidden="true">◇</span> human framework
		</a>
	);
}

/** The design language's footer: one link to the collection of all notebooks. */
export function OtherNotebooks() {
	return (
		<nav className="other-notebooks" aria-label="All games">
			<a href="https://human.adamwhite.work/games/" target="_top">
				◇ all games
			</a>
		</nav>
	);
}

export type Milestone = { id: string; text: string };

/**
 * An ink stamp for an actual milestone that has just happened: a step of the
 * player's goal sequence, or the hall reopening. It names the recorded change
 * and nothing more. Milestones already reached when the town loads, or several
 * appearing at once (a restored save), are not stamped.
 */
export function InkStamp({ reached }: { reached: Milestone[] }) {
	const seen = useRef<Set<string> | undefined>(undefined);
	const [stamp, setStamp] = useState<Milestone>();
	const key = reached.map((m) => m.id).join("|");
	// biome-ignore lint/correctness/useExhaustiveDependencies: key summarises reached.
	useEffect(() => {
		if (!seen.current) {
			seen.current = new Set(reached.map((m) => m.id));
			return;
		}
		const fresh = reached.filter((m) => !seen.current?.has(m.id));
		for (const m of reached) seen.current.add(m.id);
		if (fresh.length === 1) setStamp(fresh[0]);
	}, [key]);
	useEffect(() => {
		if (!stamp) return;
		const timer = window.setTimeout(() => setStamp(undefined), 5200);
		return () => window.clearTimeout(timer);
	}, [stamp]);
	if (!stamp) return null;
	return (
		<div className="ink-stamp" role="status">
			<svg viewBox="0 0 120 120" aria-hidden="true">
				<path
					className="stamp-ring"
					d={inkCircle(`stamp:${stamp.id}`, 60, 60, 52, 0.03)}
				/>
				<path
					className="stamp-ring"
					d={inkCircle(`stamp2:${stamp.id}`, 60, 60, 45, 0.03)}
				/>
			</svg>
			<span>{stamp.text}</span>
			<button
				type="button"
				className="text-button"
				aria-label="Dismiss milestone"
				onClick={() => setStamp(undefined)}
			>
				×
			</button>
		</div>
	);
}

/** A person's initials in a hand-drawn ring. */
export function InkPortrait({
	id,
	label,
	className,
}: {
	id: string;
	label: string;
	className: string;
}) {
	return (
		<span className={className} aria-hidden="true">
			<svg viewBox="0 0 48 48" aria-hidden="true">
				<path d={inkCircle(`portrait:${id}`, 24, 24, 20, 0.06)} />
			</svg>
			<span>{label}</span>
		</span>
	);
}
