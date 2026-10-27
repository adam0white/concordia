export default function ErrorMessage({ message }: { message: string }) {
	const text = message.startsWith("Shared people are unavailable.")
		? "Shared people are unavailable. Choose Start a fresh local town in Other ways in."
		: message.startsWith(
					"This save could not be compressed. The current town is unchanged.",
				)
			? "This save could not be compressed. The current town is unchanged. Try keeping a copy again or send Feedback from the menu."
			: message.startsWith("The saved town could not be restored.")
				? "The saved town could not be restored. Its device save is preserved while this fresh town is paused. Taking an action will replace that save."
				: message.startsWith(
							"This save could not be loaded. Your current town is unchanged.",
						)
					? "This save could not be loaded. Your current town is unchanged. It may be from an older version. Start a new game to use this version."
					: "The town could not complete that action. Send Feedback from the menu for help.";
	return <p>{text}</p>;
}
