# Visitor report, 2026-10-19: story seeker (follow the people, look for a story)

Phase D playtest of a local preview build (HF 2.8.0, before the refusal and rejected-work fixes in this phase). The tester saw only a local preview URL, never the repository. Agenda: story seeker (follow the people, look for a story). Model: Fable. Words below are the tester's own, unedited.

**1. Verdict.** The people convince for the first ninety in-game minutes, then the game forgets I exist: I stood alone in the flooded hall for a day and a night with no needs and no visitors, the hall was repaired and reopened by residents I had never met, and a raw Python traceback froze the clock.

**2. The story I had.**
Day 1, 08:00, Rain. I wake lodging with my cousin Lea's family at Riverside homes. Noor (organiser) is beside me, "Leaning towards working a paid shift" but with a promise to meet neighbours at the hall by 18:00. I ask her to go; "Alright, I'll do it." I walk 45 minutes to the Flooded hall (0 of 12 repairs done). At 08:45 Lea and Ada are there going over timber checks; Noor arrives at 09:00 and now reads "Willing to hear you out". At 09:00 I ask Ada (carpenter) to start repairs and promise an hour of my own work. She refuses: "Not now — I've a question to leave for the inspector first." At 09:30 a story pause: "A question became a shared method" — Lea showed Ada how dry timber differs from wet. I spend a town credit on tools (3 → 6), ask Ada again, and accept her counter-offer. 10:45: "Ada weighed your request and chose to leave the inspector a question instead." 12:45 she finishes. Then nothing until Day 2 06:00: "A repaired section worked loose on wet timber." Day 2 09:00, Noor is on a paid shift beside me; repair is no longer askable, so I ask her to rest; "Not now — I've a paid shift to work first", and at 09:45 she rests. Day 2 13:00: "Twelve repairs are complete", linked to Quinn Diaz, a "retired neighbour" outside my eight. I was in the hall the whole time and saw none of it. I clicked "Next evening choice →" and the town ran to Day 9 03:15 unasked: Ada kept the hall closed twice on wet timber (Day 4–5), Finley Lane opened it Day 8 15:15, Alex Diaz shared a meal, Lea invited everyone to a timber class Day 9 18:00.

**3. Alive / automatic / where I'd stop.**
Alive: Noor keeping a promise I nudged and her trust label changing; Ada refusing with a reason and a counter-offer; Lea teaching Ada, which later explains why Ada keeps the hall closed. That is a real causal thread.
Automatic or fake: I have no body. No hunger, no sleep, no consequence for standing alone in a flooded building from Day 1 12:45 to Day 2 09:00. The town's record names Quinn Diaz, Finley Lane, Reese Martin, Alex Diaz, Charlie Grant — people I cannot meet, who do the decisive work. My eight named neighbours mostly "Rest at home", "Asleep", or work paid shifts. "YOUR NEXT STEP: Work through an objection" stayed pinned from Day 1 09:30 to Day 9 even after I accepted a counter-offer. Crises did not reach me: nobody came to me, asked me anything, or needed me.
Where I'd stop: Day 2 06:00, reading that twenty game-hours had produced one journal line while I stood in the hall overnight.

**4. Refusals.** Ada: "Not now — I've a question to leave for the inspector first." Believable: she was waiting for the inspector until 10:45. But after I accepted her offer to repair afterwards, the journal only logged that she "chose to leave the inspector a question instead" and finished at 12:45; nothing recorded her repairing, though a repaired section existed by Day 2 06:00. Noor: "Not now — I've a paid shift to work first." Believable, and she followed through at 09:45.

**5. Bugs and confusing text.**
- Day 2 07:15, "Help repair the hall" (my own hour) printed a full Python traceback into the journal, ending "BridgeError: intervene: No repair is available: no free tools or nothing left to fix", then "The town could not complete that action. You can reload and restore your latest save." The clock froze at 08:00 until I reloaded.
- "Ask them to" list contains "Keep this section closed" and "Open this section" — options with no referent.
- "Next evening choice →" advanced 672 rounds (a week) with no confirmation.
- "2 working hours left today, 08:00–18:00 including the walk." shown at Day 2 06:00.
- Ada's "Repair doors before evening" reads PROMISE RESULT · KEPT, yet with me in the hall all afternoon my journal recorded no repair by her.
- Desktop 1280px: the neighbour strip clips Noor to "N" beside Play. Phone 390×844: works as a bottom sheet, but the strip is hidden under it; people must be opened from "Here with you".
- No separate playtest export exists; the save is the only export (schema, rounds, runtime).

**6. Files.**
/private/tmp/claude-504/pt-story/save-day1-0930.json.gz (Day 1 09:30)
/private/tmp/claude-504/pt-story/save-final.json.gz (Day 9 03:15)
/private/tmp/claude-504/pt-story/steps.log (every screen I read); screenshots s1–s22, ph1–ph8 in the same folder.
