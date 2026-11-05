export default function FirstSteps({
	text,
	skip,
}: {
	text: string;
	skip: () => void;
}) {
	return (
		<aside className="first-steps" data-first-steps>
			<span role="status" aria-live="polite">
				{text}
			</span>
			<button type="button" onClick={skip}>
				Skip guide
			</button>
		</aside>
	);
}
