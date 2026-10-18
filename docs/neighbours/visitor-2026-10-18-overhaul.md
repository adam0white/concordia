# Visitor review: first playable overhaul (2026-10-18)

Reviewer: an independent game designer who had not read the source, playing a local preview of the overhaul build (before Phase B/C). The text below is the reviewer's final report, verbatim.

---

Acceptance answer: **mostly yes.** Within ten minutes I made a plan (reopen the hall), met a reasonable objection (Noor would rather work a paid shift), changed something concrete (I urged Noor, then promised and did an hour of hauling food) and saw a consequence (hall repairs went to 4 of 12). The consequence I cared about most, Ada's failed inspection, came from her timber check, not from my work. And I only got the repairs by using Urge, which overrode everything.

**Setup and caveats.** There is no `preview` script, so I ran `npx vite preview` on port 5399. Its listener was PID 18446, and I stopped it by that PID; the port is now free. I made no repo edits and ran no git commands. Real play time was about 13 minutes, short of the 15 asked. I played with Playwright at 360×780, mostly by reading page text and driving clicks with scripts. I briefly wrote and then removed one test key in the page's localStorage.

**First ten minutes**
- **0:00** The intro reads clearly. Day 1, 08:00, at the homes with Noor. The goal is "Find your feet".
- **0:30** I asked Noor to repair the hall. The game showed her answer in advance: "I'd rather work a paid shift instead." My only follow-up was to accept her counter-offer.
- **2:00** I walked 45 minutes to the hall. A story auto-paused the game: Lea taught Ada how to judge flood-damaged timber. This was the best moment of the session.
- **4:00** I asked Ada to open a hall section. She agreed, then found wet timber, so the hall stayed shut. A cause I understood had an outcome I cared about.
- **5:30** I offered Noor an hour of my work. She still declined, and I was still bound to the promise.
- **6:30** Urge got "Alright, I'll do it." Noor left her shift to repair.
- **8–10:00** I walked to the quay and carried 5 meals, which kept my promise. Repairs reached 4 of 12.

**What is fun:** the inspection thread, travel time, the "only people here can hear you" rule, and the journal.
**What is not:** every reply is shown before you ask, so asking has no tension. Urge works on everyone and costs nothing. The town finished all 12 repairs by Day 2 without me, then kept the hall shut for five days with the same "stayed closed" story repeated. With 930 meals already at the market, my 5 meant nothing.

**Do the people feel like people?** Partly. They have jobs, short backstories ("Lost seedlings in the flood") and reasons in their own words. But every one of them always "SEEMS Settled. Nothing pressing." Urging Noor off a paid shift, and breaking a promise to Sam, changed neither mood nor willingness. Sam walked home twice in a few hours just to drink water.

**Bugs**
1. **The "Keep your word" step never completes.** Promise to Noor, carry the food, and the journal records "kept your promise". The step still shows on Day 4.
2. **Promising doesn't convince, but still binds.** Promise an hour to someone whose predicted reply is a refusal: they refuse and you still owe the hour. The hour task defaulted to carrying food; I never chose it.
3. **Broken promises have no visible effect.** Promise to Sam, let the 18:00 deadline pass, and the next day Sam still shows "Alright, I'll do it" for everything. The only sign is a red dashed ring on his chip.
4. **Machine text leaks into the journal.** It shows "No matching learned-method term was recorded for this choice". Grammar is broken in "could not complete open this section" and "finished repair the flood-damaged hall". Old reply text stays on a neighbour's panel days later.
5. **Hall reopening seems unreachable.** Day 2 through Day 5 show 12 of 12 repairs with every inspection failing on wet timber. It rained through Day 5.
6. **Small issues:**
   - The "you" marker is cut off at the map's left edge.
   - A × drawn on the workshop looks like the map's death marker.
   - Clicking a neighbour chip on the Town tab closes the panel.
   - A request I sent just before a reload was lost, which may let players reroll refusals. I did not confirm this.

Spamming requests was handled well: one request per round. Saves survived reloads mid-day.

**First three changes, ranked**
1. **Hide the predicted reply, and give Urge and broken promises a cost.** Show a vague read of the person, such as "seems tired", instead of their exact answer. Lower trust and mood after an urge or a broken promise, so the objection becomes a real decision.
2. **Make the player's work matter.** Slow the background repairs, or tie hall reopening to an action the player can take (dry the timber, fetch an inspector), so the town doesn't finish without you.
3. **Fix the onboarding loop and the leaked text:** complete "Keep your word", let the player pick the hour of work they offer, and rewrite the journal lines in plain words.
