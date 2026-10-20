# Visitor report, 2026-10-19: edge pusher (refuse, urge, break promises, invalid imports)

Phase D playtest of a local preview build (HF 2.8.0, before the refusal and rejected-work fixes in this phase). The tester saw only a local preview URL, never the repository. Agenda: edge pusher (refuse, urge, break promises, invalid imports). Model: Claude Haiku. Words below are the tester's own, unedited.

**1. Verdict:** Partly tested. The game handled a plain ask, a reload and a broken import honestly, but my urge and promise attempts did not register, so I cannot yet say whether pushing costs trust.

**2. What I tried (in-game time is approximate):**
- Day 1, 08:00: entered the town. Walked Ada to the flooded hall. Pressed Next, which ran the clock forward to Day 1 14:00 and beyond.
- A script loop stepped the clock about 400 times and skipped roughly three days (Day 1 to Day 2 19:30). That was my mistake, not a game fault.
- Day 3, about 08:30: walked to Riverside homes, where Ada was sleeping until 09:30. Stepped until she was awake (about 20:15).
- Day 3, 20:15: asked Ada to "Sleep at home" and chose the default deadline. The answer was pending, shown as "Considering what Ada could do now…". Time had to pass before it resolved.
- Day 3, 20:30 to 21:15: Ada answered "Alright, I'll do it. Ada" and then "Later: Fine. Ada chose to sleep at home."
- Reloaded the page mid-game. The town came back with Ada's answer intact.
- Set speed to 10× and pressed Play for 30 seconds of real time. The clock went from Day 3 21:00 to Day 4 22:15, then Stop.
- Imported a truncated JSON file.
- Downloaded the save (Day 5, 04:15).

**Not tried or not working:** I meant to spam Urge, make and break promises, and push absurd requests. My urge clicks missed because the request list changed between steps, so the urge results are not real data. I also did not reach a refusal, and I did not see a trust change.

**3. What broke, what was honest, what was a dead end, what was fun:**
- Honest: the bad import showed "This file is not valid JSON. The current town is unchanged." and kept the town intact.
- Honest: the answer arrived with a visible delay, and the game did not pretend it was instant.
- Confusing: the request list under "Ask them to" changes between visits (Ada's list on Day 1 differed from Day 3). A request I clicked once was not there the next time.
- Confusing: "Ada is not with you" stayed on screen after she was at my place. I am not sure whether that is a bug.
- Confusing: the header read "0 awake here" at one point and "1 awake here" a few minutes later at the same place.
- Dead end (as far as I saw): Ada accepted my one ask at once. Nothing I did gave her a reason to say no.
- Fun: the answer pending, then the reply, then the journal line "Kept the hall tables dry; wants to repair its doors." made the wait feel like a real person deciding.
- Not confirmed: whether the "Urge" text ("being pushed wears on their trust") has any effect. I did not verify it.

**4. Refusal:** I did not see one. Ada took my request. I cannot say whether she would refuse after pushing, so I do not believe or disbelieve any refusal claim.

**5. Exact on-screen text worth checking:**
- "Insist. They may give in under protest, and being pushed wears on their trust."
- "Offer an hour of your own work. It binds you only if they take it up."
- "Considering what Ada could do now…"
- "Ada took up your request and chose to sleep at home."
- "Ada is not with you. Only people at the same place, and awake, can hear you."
- "Download save ↓ (Day 5 · 04:15)" appears only after Export, and the file it downloads is gzipped, though the link does not say so.

**6. Files:**
- Exported save (gzip, 2.1 MB, from Day 5 04:15): `/private/tmp/claude-504/pt-edge/alder-quay-save-day5.json.gz`
- My truncated input save: `/private/tmp/claude-504/pt-edge/odd-save-truncated.json`
- Session log (partial, mostly my script output): `/private/tmp/claude-504/pt-edge/session-log.txt`
- Screenshots: `/private/tmp/claude-504/pt-edge/p_e5.png`, `p_e6.png`, `p_e8.png`, `p_e9.png`

**Next step if you want a real edge test:** have me rerun the urge and promise paths with a fixed target (re-read the request list each time) and advance the clock in small steps. That run needs about 20 more minutes.
