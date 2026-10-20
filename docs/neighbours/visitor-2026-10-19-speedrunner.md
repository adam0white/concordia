# Visitor report, 2026-10-19: speedrunner (reopen the hall as fast as possible)

Phase D playtest of a local preview build (HF 2.8.0, before the refusal and rejected-work fixes in this phase). The tester saw only a local preview URL, never the repository. Agenda: speedrunner (reopen the hall as fast as possible). Model: Claude Sonnet. Words below are the tester's own, unedited.

**1. Verdict.** I did not reopen the hall, get a repair out of anyone, or keep a promise. One request was met with a counter-offer that vanished before I could use it. The sim crashed three times on actions the UI itself offered, and the only help I managed was a single "propped timber" hour that "still felt damp".

**2. What I tried, in order (390x844 phone viewport, then 1280x800 desktop for a screenshot).**
- Day 1 08:00: I walked from Riverside homes to the Flooded hall (45 min). I chose the hall because the hall is the goal.
- Day 1 09:30: Ada and Lea were there. I asked Ada to "Repair the flood-damaged hall".
- Day 1 10:45: I pressed Next. The sim ran to 10:45, and Ada did what she had said she would, "leave the inspector a question". Her wait ran to 12:45.
- Day 1 12:45: I asked Ada again. She gave the same "not now". When I advanced, she left to "work a paid shift", so the counter-offer evaporated.
- Day 1 12:45: I used "Help repair the hall" myself. It threw a Python traceback.
- Day 1 12:45: I then used "Prop and air the hall timber" and it worked.
- Days 2 to 6: The town finished the 12 repairs on Day 2 at 13:30, with no help from me. Inspections then kept "closing" the hall on wet timber. I propped timber again on Day 4 10:15 ("still felt damp").
- Day 6 18:00: The hall still reads "awaiting inspection". I stopped there.

**3. What worked, what felt passive, where I'd quit.**
- Walking to the hall, asking, and getting a legible answer all worked. The "Your next step" tutorial card is a good guide.
- Next is the problem for a speedrunner. It jumps 1 to 3 days in one click, so the town simply happens to me. Between jumps I get no reason to decide anything. I only noticed the hall loosening and the inspections closing it afterwards, in the record.
- The one hour of work I can give is small compared to a multi-day wet-timber problem, and it never says what is blocking the reopening. "Wet timber" is mentioned only in passing. It never tells me how many hours of airing it needs.
- I would quit around Day 4. I had no lever that visibly moved the hall, and each retry meant an hour I couldn't see paying off.

**4. Refusals.**
- Ada said: "Not now — I've a question to leave for the inspector first." She gave a reason I could check, since the hall's current task showed "Leave a question for an inspector… Until 10:45". I believed it.
- The reason was true but practically useless. The counter-offer "Accept their counter-offer" showed no result, and by the time she was free she had picked a paid shift instead. That felt like being brushed off, even though it was honest.
- Asking again while she was still occupied gave the identical refusal, with no extra information.

**5. Bugs and confusing text.**
- **Raw Python traceback shown in the UI.** My first "Help repair the hall" returned: "intervene: No repair is available: no free tools or nothing left to fix". The button was offered anyway.
- **Engine wedges after an action error.** Every later action then fails with "Round incomplete; restore a completed checkpoint before continuing." Banner: "The town could not complete that action. You can reload and restore your latest save." Save ⋯ then Restore autosave recovered it each time.
- **Offered work after the day ends.** At Day 6 18:00 the panel still says "2 working hours left today, 08:00–18:00 including the walk." Clicking "Prop and air" at that time wedged the engine again.
- **The same wedge fired when I clicked an action while Next was still "Advancing the town: 56 of 672 rounds".** The action buttons stay enabled during an advance.
- **Engine jargon in the log:** "Ada's work a paid carpentry shift changed plan at an HF review at workshop; reserved resources were returned." This is both ungrammatical and framework-internal.
- **Duplicate journal lines.** Clicking "Accept their counter-offer" logged "You took up Ada's offer…" twice, with no visible effect.
- **Export is two steps.** Export, then a "Download save ↓" link appears. Nothing downloads on the first click.
- **"Done: Find your feet, Get an answer"** is checked off before the counter-offer outcome is shown.

**6. Exports.**
- `/private/tmp/claude-504/pt-speedrunner/save-day5-2030.json` is Day 5, 20:30, about 2 MB.
- `/private/tmp/claude-504/pt-speedrunner/save-final.json` is Day 6, 18:00, about 2 MB.
- Screenshots (`s*.png`, `desk.png`) are in the same folder.
