export default function ErrorMessage({ message }: { message: string }) {
	if (message.length < 240 && !message.includes("Traceback"))
		return <p>{message}</p>;
	return (
		<>
			<p>
				{message.startsWith("The saved town could not be restored.")
					? "The saved town could not be restored. Its device save is preserved while this fresh town is paused. Continuing with Play, Step or an intervention will replace that save. You can also import a compatible save or choose Start town in Inspector."
					: message.includes("restore:")
						? "This save could not be loaded. Your current town is unchanged."
						: "The town could not complete that action. You can reload and restore your latest save."}
			</p>
			<details>
				<summary>Technical details</summary>
				<p className="tiny" style={{ overflowWrap: "anywhere" }}>
					{message}
				</p>
			</details>
		</>
	);
}
