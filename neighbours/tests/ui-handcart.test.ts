import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { PersonView, TownView } from "../src/contracts";
import HandcartCard from "../src/ui/HandcartCard";
import MapPeopleChooser from "../src/ui/MapPeopleChooser";
import PersonPurposes from "../src/ui/PersonPurposes";

const people = ["ravi", "ada", "jo"].map(
	(id) => ({ id, name: id[0]?.toUpperCase() + id.slice(1) }) as PersonView,
);
const render = (handcart?: TownView["handcart"]) =>
	renderToStaticMarkup(
		createElement(HandcartCard, {
			town: { now: 500, people, handcart },
			select: () => {},
		}),
	);
it("does not show an unobserved cart", () => expect(render()).toBe(""));
it("shows actual repair count without inventing a return or named repaired part", () => {
	const html = render({ progress: 1, total: 3, returned: false, requests: 0 });
	expect(html).toContain("Repair in progress");
	expect(html).toContain("1/3 work periods");
	expect(html).toContain("Follow Ravi for the handcart");
	expect(html).not.toContain("Back with Jo");
	expect(html).not.toContain("Axle repaired");
});
it("keeps completed repair distinct from actual return and folds the latest event", () => {
	expect(
		render({ progress: 3, total: 3, returned: false, requests: 1 }),
	).toContain("Ready to return");
	const html = render({
		progress: 3,
		total: 3,
		returned: true,
		requests: 1,
		latest: {
			id: 3,
			at: 480,
			kind: "cart-returned",
			text: "Ravi returned the cart to Jo.",
			causes: [],
			importance: 0.5,
		},
	});
	expect(html.split("<details")[0]).toContain("Back with Jo");
	expect(html.split("<details")[0]).not.toContain("Ravi returned the cart");
	expect(html).toContain("Ravi returned the cart to Jo.");
	expect(html).not.toContain("<details open");
});
it("folds actual HF purpose state and does not fabricate missing goals", () => {
	expect(
		renderToStaticMarkup(createElement(PersonPurposes, { person: {} })),
	).toBe("");
	const html = renderToStaticMarkup(
		createElement(PersonPurposes, {
			person: {
				purposes: [
					{
						id: "g2",
						label: "Return the cart",
						progress: 0.5,
						status: "active",
					},
				],
			},
		}),
	);
	expect(html).toContain("Return the cart");
	expect(html).toContain('active · <span class="hand">in progress</span>');
	expect(html).not.toContain("%");
	expect(html).not.toContain("<details open");
});
it("labels the physical place in the chooser and uses native named selection buttons", () => {
	const html = renderToStaticMarkup(
		createElement(MapPeopleChooser, {
			place: "Riverside homes",
			people: people.map((person) => ({
				...person,
				activity: "Sleep at home",
				lifeState: "asleep" as const,
			})),
			close: () => {},
			select: () => {},
		}),
	);
	expect(html).toContain("Neighbours at Riverside homes");
	expect(html).toContain('data-person="ravi"');
	expect(html).toContain("Asleep");
	expect(html).toContain("Close place neighbours");
});
