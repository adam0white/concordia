# Visitor report, 2026-10-19: sceptical journalist (test the game's claims about people)

Phase D playtest of a local preview build (HF 2.8.0, before the refusal and rejected-work fixes in this phase). The tester saw only a local preview URL, never the repository. Agenda: sceptical journalist (test the game's claims about people). Model: Claude Opus. Words below are the tester's own, unedited.

**1. Verdict.** It's a tech demo dressed as a game: refusals and promises mostly hang together, but in my session two offered actions crashed the engine, the hint got stuck, and some stated reasons contradict the needs the game shows.

**2. Claims tested** (seed 42, Day 1 08:00 to Day 8 21:30)
- *"People decide for themselves … they may say no."* Partly true. Ravi (Day 1 09:00, 1×) and Ada (Day 1 09:45) said "not now" with reasons that matched what they were visibly doing. But Ada's counter-offer, which I accepted, quietly lapsed: "Ada weighed your request and chose to leave the inspector a question instead" (10:45). She never repaired anything.
- *Promises.* My ask to Ravi was a misclick on my part: it fired the default "Rest at home". He took it, and his promise "Attend Lea's displaced practical class" became "Broken · deadline Day 1 · 10:15". The game showed no reason for the break and no consequence for me.
- *Town support.* All three were truthful. "Tools added. 6 tools now available." After I restored the bus, walk times halved (Riverside to Market went from 30 to 15 min).
- *Hall arc.* The cause and effect is coherent: rain kept the timber wet, so inspectors kept the hall closed. It opened Day 7 10:30, after the weather cleared, by a method Lea had taught. But it reads like timers rather than people. "A repaired section worked loose" happened at exactly 06:00 on Days 2, 3 and 5, and the repairs were finished around 08:00 each time. On Day 4, Lea taught a new background resident roughly every half hour from 13:30 to 20:45.
- *Compare futures.* I did not test it.

**3. Reasons: visible vs invented**
- **Believable:** "Not now — I've a paid shift to work first." (Ravi, shift "Until 09:15"). Lea's timber decision panel: "Observed timber: wet. Support: loose. Chose to keep closed." Also "No acquired method matched", which was honest, because her method covered sound supports only.
- **Contradictory:** "Why this choice: I need a break from all this." (Lea at 09:30 and Ada at 18:45 on Day 1), while all 12 needs read "settled". At Day 2 20:30 Sam (a cook) showed "Content, very hungry", food "urgent", and "Out of habit, really." He chose to rest. No eating option was among his 7 scored options, even though the kitchen held hundreds of meals. Ada's top-scored option was "Sleep at home 0.040", yet she was doing "Rest at home".
- **Invented-looking numbers:** raw scores like "0.014" and "-0.023" mean nothing to a player. Town health showed 0 underfed throughout while Sam was "very hungry". The crisis is visible in one person's panel and hidden at town level.

**4. Refusals.** Ada: "Not now — I've a question to leave for the inspector first." I believed it. Lea (Day 2 11:30): "I'd rather work a paid shift instead." Her counter-offer was the shift she was already working. Then at 11:45: "Later: I trust you — fine, I'll go." Nothing visible triggered the flip; my Urge never reached the game because my own script failed. She quit the class after 30 minutes: "changed plan at an HF review at school; reserved resources were returned." That line explains nothing.

**5. Bugs and confusing text**
- **Crash 1, Day 2 11:45:** Promise an hour, "Help repair the hall". A raw Python traceback appeared on screen, ending "BridgeError: intervene: The hall repairs are already complete". Step and Play no longer moved the clock. The banner read: "The town could not complete that action. You can reload and restore your latest save." The "Lend tools" card already said repairs were complete, yet this menu still offered the repair.
- **Crash 2, Day 3 09:15:** Do an hour of your own work, "Help repair the hall". Same failure: "BridgeError: intervene: No repair is available: no free tools or nothing left to fix". A reload restored the autosave both times. The second time I lost my finished timber hour.
- While the error banner was up, Export produced no "Download save ↓" link. It worked after the reload.
- The hint "Work through an objection" stayed from Day 1 09:45 to Day 8, after I took a counter-offer and Lea gave in.
- Promise statuses are inconsistent: Ravi's expired promise reads "Broken", while Ada's and Lea's read "PENDING · DEADLINE PASSED".
- "1 town credits left".
- Request options include "Keep this section closed" and "Open this section", with no explanation of which section.
- The "evening class" was taught at 11:45.
- Sam invited the town to supper at 16:45 for 18:00 the same day: "The room was never prepared." Both Lea and Sam booked the hall for Day 11 at 18:00.
- Developer leakage shown to players: "PERSISTENT_PERSONS", "INSPECTION_PENDING", "Recorded at Not recorded", "Uncommitted source changes at build Yes", "cart Sections0", "taught Neighbours", "low Health".
- "Ada finished leaving a question for the inspector." stayed in my panel into Day 2.
- With "Pause on new stories" on, 10× play stopped every few sim-minutes.

**6. Exports** (gzip JSON, `neighbours/concordia@1`). Each is a state snapshot with a 400-event log. I could not confirm it replays from my inputs.
- `/private/tmp/claude-504/pt-journalist/neighbours-save-day3-0900.json.gz`
- `/private/tmp/claude-504/pt-journalist/neighbours-save-day8.json.gz`
- Crash screenshots: `/private/tmp/claude-504/pt-journalist/shot5.png` (taken just after crash 1), `/private/tmp/claude-504/pt-journalist/shot6.png` (crash 1 banner), `/private/tmp/claude-504/pt-journalist/shot10.png` (taken just after crash 2).
