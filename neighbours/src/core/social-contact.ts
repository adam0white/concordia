import { socialEvent } from "@adam0white/human-framework";
import { overlapMinutes, presentAt } from "./encounters.ts";
import { shareEveningNotice } from "./evening-news.ts";
import type { EveningHost } from "./evenings.ts";

/** Contact is real once it happens, even if either person later changes plan. */
export function recordSocialContacts(host: EveningHost): void {
	const s = host.s;
	const engaged = s.people.filter(
		(r) => r.job && ["talk", "gather"].includes(r.job.offer.action),
	);
	for (let i = 0; i < engaged.length; i++) {
		const a = engaged[i];
		if (!a?.job) continue;
		for (const b of engaged.slice(i + 1)) {
			const aj = a.job,
				bj = b.job;
			if (
				!bj ||
				!aj.offer.placeId ||
				!presentAt(a, aj.offer.placeId, s.now) ||
				!presentAt(b, aj.offer.placeId, s.now) ||
				overlapMinutes(aj, b, s.now) < 15 ||
				aj.socialContacts?.some(
					(c) => c.otherId === b.person.id && c.event === bj.event,
				)
			)
				continue;
			socialEvent(a.person, {
				at: s.now,
				kind: "chat",
				otherId: b.person.id,
				byMe: true,
				magnitude: 0.5,
			});
			socialEvent(b.person, {
				at: s.now,
				kind: "chat",
				otherId: a.person.id,
				byMe: false,
				magnitude: 0.5,
			});
			aj.socialContacts ??= [];
			bj.socialContacts ??= [];
			aj.socialContacts.push({ otherId: b.person.id, event: bj.event });
			bj.socialContacts.push({ otherId: a.person.id, event: aj.event });
			shareEveningNotice(host, a, b);
			shareEveningNotice(host, b, a);
		}
	}
}
