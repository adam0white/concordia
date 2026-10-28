import { useEffect, useState } from "react";

export default function LocalTrace({ read }: { read: () => unknown }) {
	const [text, setText] = useState("");
	const [url, setUrl] = useState("");
	useEffect(
		() => () => {
			if (url) URL.revokeObjectURL(url);
		},
		[url],
	);
	return (
		<section aria-label="Local UI trace">
			<p className="tiny">
				Local UI observations only. The last 128 entries stay in memory until
				this page closes. No town data or automatic upload. Missing entries and
				the original interruption cause remain unknown.
			</p>
			<button
				type="button"
				onClick={() => {
					const value = JSON.stringify(read(), null, 2);
					setText(value);
					setUrl(
						URL.createObjectURL(
							new Blob([value], { type: "application/json" }),
						),
					);
				}}
			>
				Read local UI trace
			</button>
			{url && (
				<a href={url} download="neighbours-local-ui-trace.json">
					Download local UI trace
				</a>
			)}
			{text && (
				<pre
					style={{
						whiteSpace: "pre-wrap",
						overflowWrap: "anywhere",
						maxHeight: "16rem",
						overflow: "auto",
					}}
				>
					{text}
				</pre>
			)}
		</section>
	);
}
