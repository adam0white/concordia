import type { Intervention, TownView } from "../contracts";
import { hasHallChoice } from "../hall-choice";
import EveningBoard from "./EveningBoard";
import HallChoices from "./HallChoices";
import HandcartCard from "./HandcartCard";
import InspectionSituation from "./InspectionSituation";

export default function HelpPanel({
	town,
	disabled,
	action,
	compare,
	select,
	hallExpanded,
	setHallExpanded,
	onAdvance,
}: {
	town: TownView;
	disabled: boolean;
	action: (input: Intervention) => void;
	compare: (input: Intervention, rounds: 96 | 672) => void;
	select: (id: string) => void;
	hallExpanded: boolean;
	setHallExpanded: (open: boolean) => void;
	onAdvance?: () => void;
}) {
	const support = [
		{
			kind: "restore-bus",
			title: "Restore the public bus",
			available: town.canRestoreBus !== false,
			effect: "Future trips around town will be faster.",
			unavailable: "Public transport is running.",
		},
		{
			kind: "lend-tools",
			title: "Lend tools",
			available: town.canLendTools !== false,
			effect: "Add 3 tools for the hall repairs.",
			unavailable: "The hall repairs are complete.",
		},
		{
			kind: "share-news",
			title: "Share hall news",
			available: town.canShareNews !== false,
			effect: "Tell awake neighbours about the hall repairs.",
			unavailable: "No awake neighbour needs this news now.",
		},
	] as const;
	return (
		<section className="help-panel">
			<div className="view-heading">
				<h2>Help the town</h2>
				<p>Your actions change the town. People decide how to respond.</p>
			</div>
			{onAdvance && !hasHallChoice(town) && (
				<button
					type="button"
					className="next-hall-choice"
					disabled={disabled}
					title="Run up to seven days; stop at a displayed evening funding or advertisement choice."
					onClick={onAdvance}
				>
					Next evening choice →
				</button>
			)}
			<section className="town-support" aria-label="Town support">
				<div className="support-heading">
					<h3>Town support</h3>
					<span>{town.controlsRemaining} town credits left</span>
				</div>
				<p className="tiny muted">
					Each action costs 1 town credit. These can also support later hall
					evenings.
				</p>
				<div className="support-options">
					{support.map((option) => (
						<div className="support-option" key={option.kind}>
							<button
								type="button"
								disabled={
									disabled || !town.controlsRemaining || !option.available
								}
								onClick={(event) => {
									if (event.detail > 1) return;
									action({ kind: option.kind });
								}}
							>
								{option.title}{" "}
								<span className="support-cost">1 town credit</span>
							</button>
							<small>
								{option.available ? option.effect : option.unavailable}
							</small>
						</div>
					))}
				</div>
			</section>
			<h3>The hall</h3>
			<HallChoices
				expanded={hallExpanded}
				onExpandedChange={setHallExpanded}
				town={town}
				disabled={disabled}
				onAction={action}
				onCompare={(input) => compare(input, 672)}
			/>
			<InspectionSituation
				town={town}
				disabled={disabled}
				onAction={action}
				onCompare={(input) => compare(input, 96)}
			/>
			{(town.handcart ||
				town.evenings?.some((event) => event.stage !== "candidate")) && (
				<details className="project-history">
					<summary>Projects and notices</summary>
					<HandcartCard
						town={town}
						select={select}
						disabled={disabled}
						onPropose={(slot) =>
							action({
								kind: "propose-bench-window",
								proposal: {
									schema: "neighbours-bench-proposal@1",
									kind: "bench-window",
									slot,
								},
								proposalOrigin: { kind: "authored" },
							})
						}
						onCompare={(slot) =>
							compare(
								{
									kind: "propose-bench-window",
									proposal: {
										schema: "neighbours-bench-proposal@1",
										kind: "bench-window",
										slot,
									},
									proposalOrigin: { kind: "authored" },
								},
								96,
							)
						}
					/>
					<EveningBoard town={town} select={select} />
				</details>
			)}
		</section>
	);
}
