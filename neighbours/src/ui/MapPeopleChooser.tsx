import { useEffect, useRef } from "react";
import type { PersonView } from "../contracts";
import { activityLabel } from "./person-status";

export default function MapPeopleChooser({
	place,
	people,
	close,
	select,
}: {
	place: string;
	people: PersonView[];
	close: () => void;
	select: (id: string) => void;
}) {
	const chooser = useRef<HTMLElement>(null);
	useEffect(() => {
		chooser.current?.querySelector<HTMLButtonElement>("[data-person]")?.focus();
	}, []);
	return (
		<section
			ref={chooser}
			className="map-chooser"
			aria-label={`Neighbours at ${place}`}
			onKeyDown={(event) => {
				if (event.key === "Escape") {
					event.preventDefault();
					close();
				}
			}}
		>
			<div className="map-chooser-heading">
				<strong>{place}</strong>
				<button
					type="button"
					onClick={close}
					aria-label="Close place neighbours"
				>
					×
				</button>
			</div>
			<div className="map-chooser-people">
				{people.map((person) => (
					<button
						type="button"
						key={person.id}
						data-person={person.id}
						onClick={() => select(person.id)}
					>
						<strong>{person.name}</strong>
						<small>{activityLabel(person)}</small>
					</button>
				))}
			</div>
		</section>
	);
}
