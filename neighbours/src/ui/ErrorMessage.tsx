import { labMode } from "./lab-mode";
export default function ErrorMessage({ message }: { message: string }) {
	if (
		labMode() &&
		message.length < 240 &&
		!message.includes("Traceback") &&
		!message.startsWith("This save could not be loaded.") &&
		!message.startsWith("The saved town could not be restored.")
	)
		return <p>{message}</p>;
	const text = message.startsWith("The saved town could not be restored.")
		? "The saved town could not be restored. Its device save is preserved while this fresh town is paused. Taking an action will replace that save."
		: message.startsWith(
					"This save could not be loaded. Your current town is unchanged.",
				)
			? "This save could not be loaded. It may be from an older version. Your current town is unchanged. Start a new game to use this version."
			: "The town could not complete that action. Your saved town has been kept. You can reload to try again or send Feedback from the menu.";
	return (
		<>
			<p>{text}</p>
			{labMode() && (
				<details>
					<summary>Technical details</summary>
					<p className="tiny" style={{ overflowWrap: "anywhere" }}>
						{message}
					</p>
				</details>
			)}
		</>
	);
}
