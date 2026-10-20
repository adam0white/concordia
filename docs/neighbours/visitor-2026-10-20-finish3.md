# Independent source-unread watch — 2026-10-20 finish3

Scope: browser UI at http://127.0.0.1:5287/ only. Before and during watching I did not read application source, tests, HANDOFF, or previous visitor reports. I used the served town, not experiment tapes. This is independent visitor evidence, not Adam's feel acceptance. Root identified the served build as source 9148a96 / HF 2.8.0 after the watch had begun; I did not independently derive that identity from UI.

## Actions and observed outcomes

1. Fresh desktop visit showed the flood introduction, eight familiar people, two hundred background residents, and an explicit device/Python-runtime notice. Enter town opened a paused Day 1 08:00 rain map. The closed hall visibly awaited repair. Places, named person buttons, background dots, Play/Step/Next, and familiar-person rail were present.
2. Selected Ada on the map. Her drawer showed carpenter, Workshop, free to choose, an evening door-repair intention, and a pending 14:00 promise to meet at the hall after Lea's class.
3. Pressed Step once. Clock became 08:15. Ada chose to inspect hall timber, in transit to Flooded hall until 09:00. The map and other people changed activity. This made the difference between decision, journey, and arrival understandable.
4. Opened Walk somewhere in Ada's drawer. Chose Flooded hall, about 45 minutes. The player state became walking there with ETA 09:00. This was a legal player action; it did not invent an instant arrival or claim Ada could hear the player remotely.
5. Pressed Next outcome for Ada. The UI briefly reported bounded advance progress, then stopped at Day 1 14:00. A toast said Ada kept the promised hall meeting. Player was at Flooded hall. Ada was now travelling to Workshop for a paid carpentry shift until 15:30. The next visible promise was repair doors before evening, deadline 18:00. No hall repairs had completed in this short watch.
6. Opened Save options. It reported Saved, Day 1 14:00. Navigated to the same URL again. The introduction reappeared. Enter town restored Day 1 14:00, Ada selected with the same activity and evening promise, player at hall, and completed Find your feet onboarding. This verifies this reload/auto-restore path, not exported-save compatibility or a full deterministic replay.
7. Resized to 390 by 844. Restored drawer was readable and scrollable with persistent playback navigation. Closed it. The map filled the phone view, place labels shortened, familiar people remained available below the map, and document width equalled viewport width (390); no horizontal overflow observed.
8. Tried the phone map's 4 neighbours at Riverside homes button. Normal pointer click failed: Playwright retried for five seconds, reporting Lea's travelling person-head intercepted the pointer. Screenshot visibly showed Lea's L marker on the count badge. Both elements had the same displayed map transform. The cluster could not be opened by this attempted center click.

## Assessment

The town was legible as a flood-recovery setting, with distinct places, residents travelling and choosing, a shared hall goal, personal promises, and a player who must travel. Selecting one person and stepping made the town easier to understand than reading the introduction alone. Next produced a meaningful promise outcome without manual repeated stepping. Reload restored the observed live-browser state.

One confirmed defect: a departing traveller can cover a co-located-person cluster on the phone map, blocking its center pointer target. Familiar-neighbour navigation still offers another way to select people, so this did not block the entire visit. Root should decide the release gate; I recommend preventing transit markers from covering count-badge hit targets. The 0 awake here wording amid many sleeping home residents was understandable after inspecting activity, but initially surprising at 08:15.

No observed runtime failure blocked entering, stepping, walking, following a person, or reload restore. I did not watch a whole day, hall reopening, death/incapacity, exported-save import, policy/runtime selection, or causal controls. Those remain unverified by this visitor pass.

Local browser artifacts were moved outside the repository to /tmp/neighbours-finish3-watch-20261020. Relevant phone screenshots: page-2026-10-20T04-53-26-013Z.png (drawer), page-2026-10-20T04-53-31-664Z.png (map and covered homes badge).

## Separate source-read follow-up

After the source-unread watch above, root authorized source inspection and a bounded map-only fix. The compact count excluded travellers and painted before individual markers. Lea's just-started journey projected exactly to homes, so her marker covered the count. The fix paints existing count badges after individual markers. It changes no simulation state, decisions, or journey coordinates. The count now takes pointer priority at exact overlap; the traveller remains available through familiar-person navigation.

Added a browser regression reproducing the Day 1 14:00 phone case with a normal pointer click. RED failed with the observed Lea pointer interception. GREEN passed, and the other two map-glyph browser tests passed (3/3 total). The isolated Vite dev run used port 5291 and external /tmp test configuration/output. Typecheck and lint also passed. These runs used the default local Node 23 path; root requested supported-Node final verification and owns that final gate. A full unit suite was started then interrupted at root's request to avoid competing with release checks; it produced no pass/fail result. The source-unread findings above describe the earlier candidate, before this fix.

## Source-read correction after the watch

After recording the observations above, the same reviewer read the map source and reproduced the blocked phone count in a real browser regression. The regression first failed because Lea intercepted the normal pointer click. Moving count groups after individual markers in SVG paint order leaves the count visible and clickable without changing journeys or simulation state. All three map-glyph browser tests passed after the correction. A separate correctness reviewer found no blocker. Traveller selection remains available in the familiar-person rail at exact overlaps. The root's final supported-Node release gates cover the delivered source.
