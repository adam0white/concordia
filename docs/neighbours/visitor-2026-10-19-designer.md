# Visitor report, 2026-10-19: game-design expert (first ten minutes, pacing, difficulty, hints, edges)

Phase D playtest of a local preview build (HF 2.8.0, before the refusal and rejected-work fixes in this phase). The tester saw only a local preview URL, never the repository. Agenda: game-design expert (first ten minutes, pacing, difficulty, hints, edges). Model: Claude Opus. Words below are the tester's own, unedited.

I played two runs in a real browser on seed 42. The phone run (390×844) went to Day 11 · 20:30. The desktop run (1366×900) went to Day 2 · 07:00, where it crashed. The review follows, to be recorded verbatim.

---

**1. Verdict.** Neighbours has the bones of a real social sim: refusals that give reasons, counter-offers, urging that leaves someone upset, a noticeboard where two evenings fight over one room. But the town does not need me. I got the most done by pressing "Next evening choice" and skipping four and a half days.

**2. The first 10 minutes.** There are early choices, and the first one is good. I asked Noor to inspect the hall timber and she said "I'd rather work a paid shift instead," with a counter-offer. That is a person, not a menu. Then it goes flat in three places.

- **Everyone says no at 08:00.** Noor, Ada and Lea are each "set on" something, and every ask in the first hour comes back "not now." I found the rule fast: whatever I ask, they do their own plan first. The only lever that worked was accepting Lea's counter-offer, and that meant agreeing to what she was going to do anyway.
- **My own hours run out at once.** "2 working hours left today" appears at 09:00, so by mid-morning I'm a spectator. I stood in the hall from 12:45 on Day 1 to 13:30 on Day 2 and nothing asked anything of me.
- **The hint lies.** "Keep your word" stayed pinned for ten in-game days. My only promise had dissolved on Day 1, and the game had already told me so: "Your offered hour for Ada no longer stands."

The automatic part is the stretch after the opening exchanges: Play, and the town proceeds without you.

**3. Mid-game pacing.** Yes, the days are passive. In the phone run, Days 9 and 10 produced no new story at all; the same "Neighbours shared Sam's supper" headline sat on screen the whole time. The hall reopened on Day 7 through Avery Kim, a background resident I had never met. Making the days active, within the fiction:

- **Let residents come to me.** The hall loosening every wet morning is the perfect hook. Have Ada or Lea find me and ask, "Will you prop the east section with me before the rain?" Their asks would give me something to accept, refuse or broker.
- **Make my hours scarce, not tiny.** Give me a full working day that fatigue thins out, so the choice is which of three asks to honour.
- **Let evening outcomes depend on me.** I persuaded Lea to go to Sam's supper. She broke her own class promise and turned up at 22:00, after the meal had ended. Nobody told me, and I was not seated, fed or mentioned, though I stood in that hall all evening.
- **Have the 52 turned-away guests complain.** On Day 8, 65 people accepted Sam's supper and 13 were fed. The other 52 should be grumbling at the market the next morning. That is a crisis I could do something about.

**4. Difficulty.** It is absent. The hall goal resolves itself, crisis included: repairs, loosening, a failed inspection and reopening all happened without me. The only friction I met is arbitrary: the 2-hour work cap, and people who don't notice I exist until their current task ends. Real challenge is sitting unused in the data. Two evenings collide on Day 11. The room seats 13 while 65 accept. The timber is wet every morning. None of it is ever put to me as a problem I have to own.

**5. Hints and crises.** The hints are mostly dishonest because they go stale (see the pinned "Keep your word"). Crises reach the screen as a paused story headline, and that part is good. They never reach me as a request or a decision, and "Ways to help" opens the town-credit menu instead of the hall. The **More** panel leaks lab internals: "Concordia GM proposal", "Authored case · wet timber", "Decision source: HF 2.8.0", "Recorded acquired-method contribution: 0.397". My journal told me "Noor's go and inspect the hall timber changed plan at an HF review at hall; reserved resources were returned." That sentence is engine log, not fiction, and it hides why my urging failed. The More panel also contradicts itself: "0 meals received" sits beside a list of 13 people who ate. The map still labels the reopened hall "Flooded hall".

**6. Edges.**
- **Fun:** I urged Noor to open a hall section before inspection. She found wet timber, the hall stayed closed, and she went home "Upset." That is cause, effect and a social cost, and the best five minutes I had.
- **Dead end:** Urging works for a moment, then the person drops the task when they arrive, with no reason given.
- **Inconsistent:** The More panel lets me ask Ada to inspect the annex from across town, which breaks the game's own "only people at the same place can hear you" rule.
- **Broken:** I clicked "Prop and air the hall timber" at 07:00 and the town crashed with a Python traceback: `BridgeError: intervene: Work hours are 08:00–18:00`. After a reload, every later action failed with "Round incomplete; restore a completed checkpoint". I reproduced the crash after restoring the save. A validation message should not be fatal.

**7. Top 5 changes, ranked.**
1. Fix the crash: reject an out-of-hours action with an in-fiction line ("It's too early; the hall's locked till eight") instead of a fatal error.
2. Have named residents bring requests to the player when the hall loosens or an evening overflows, so the crisis lands as a choice.
3. Seat the player at evenings and let attendance, absence and brokered swaps such as Lea's show up in how neighbours treat them.
4. Rewrite "changed plan at an HF review" into a spoken reason, and move the GM, controlled-case and method-contribution readouts into a lab-only view.
5. Retire the "Keep your word" hint as soon as no promise is pending, and point "Ways to help" at the current crisis rather than the credit shop.

**8. Exported file.** `/private/tmp/claude-504/pt-designer/neighbours-designer-phone-day11.json.gz` (2.5 MB, Day 11 · 20:30, from Save ⋯ → Export → Download save; the game named it `alder-quay-save.json.gz` and I renamed it).

---

Everything I wrote is in `/private/tmp/claude-504/pt-designer/`: the scripts, screenshots `p1`–`p22` and `d1`–`d5`, and the save. Screenshot `d4.png` shows the crash. I stopped the two browser processes I started, by exact PID; nothing outside that folder was touched.
