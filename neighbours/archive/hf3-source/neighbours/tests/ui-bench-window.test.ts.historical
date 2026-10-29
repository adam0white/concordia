import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import HandcartCard from "../src/ui/HandcartCard.tsx";

it("offers a discussion, with its cost, and never describes the proposal as permission", () => {
	const html = renderToStaticMarkup(
		createElement(HandcartCard, {
			town: {
				now: 480,
				people: [],
				handcart: {
					progress: 0,
					total: 3,
					returned: false,
					requests: 0,
					canProposeBench: true,
				},
			},
			select: () => {},
			onPropose: () => {},
			onCompare: () => {},
		}),
	);
	expect(html).toContain("Tell Rafi · 1 credit");
	expect(html).toContain("Compare first");
	expect(html).toContain("Nora decides whether to lend it");
});
it("shows an expired proposal as expired rather than a bench booking", () => {
	const html = renderToStaticMarkup(
		createElement(HandcartCard, {
			town: {
				now: 900,
				people: [],
				handcart: {
					progress: 0,
					total: 3,
					returned: false,
					requests: 0,
					opportunity: {
						from: 510,
						until: 750,
						received: true,
						origin: { kind: "authored" },
					},
				},
			},
			select: () => {},
		}),
	);
	expect(html).toContain("The proposed time has passed");
	expect(html).not.toContain("Main bench booking");
});
