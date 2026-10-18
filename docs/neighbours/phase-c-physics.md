# Phase C host physics: damp timber, water where people are, and work under protest

Date: 2026-10-18. Scope: Neighbours host physics only. The files are `neighbours/src/core/timber.ts`,
`protest.ts`, `offers.ts`, and the repair, inspection and job-end lines of `runtime.ts`. The player's
"prop and air the hall timber" work is in `player.ts`. HF decides every resident's choice from the same legal
offers. The published HF package is unchanged.

**For Adam's feel acceptance.** Without the player, the UI-default town (seed 42) now reopens the hall on day 7
instead of day 2. When the player repairs and airs the timber, it reopens on day 4. Every measured seed reopens
within 25 days without the player, and the player's work brings reopening forward by 1–9 days.

**Not done: "slow the background repairs."** The town still finishes its 12 repairs on day 2 in every seed. No
hold floor slows them; a floor either leaves them on day 2 or stalls them for good (see the floor table below).
The cause is HF behaviour: residents repair once and do not come back ([hf-requests.md](hf-requests.md), item 4).
What the player can change is how long the repaired hall stays shut on wet timber. Proposed target: decide the
lever with the 20 October gameplay follow-up (`nbh-01z.37`).

**Fixed:** the "Do an hour of your own work" drawer and the pledge work list offer "Prop and air the hall
timber" only while the host would accept it (`PlayerView.canAirTimber`). Once the hall has reopened, or in a legacy
save without timber, the choice is hidden.

## Why

The 2026-10-18 overhaul playtest ([visitor-2026-10-18-overhaul.md](visitor-2026-10-18-overhaul.md)) found three
problems in the physics:

1. **The player's work did not matter.** Without the player, the town finished all 12 hall repairs by Day 2 and
   reopened the hall soon after. The reviewer asked for actions that count: "dry the timber, fetch an inspector".
2. **Timber "wetness" was today's weather.** Inspection moisture was `Rain` or `Clear` for the day, drawn as
   `keyed(seed, day, "weather") < 0.35`. So the hall jumped between wet and dry overnight, and nothing anyone did
   could dry it.
3. **Sam's water walks.** Drinking was offered only at home, with effort 0. HF values a drink by the water need
   alone and ignores trip length, so a 30–60 minute walk home to drink cost nothing. Residents walked home to
   drink about 2,800 times in 8 days (208 people, seed 42). This is a host bug, because the host offered water
   only at home. HF's indifference to trip length is HF behaviour, recorded in `hf-requests.md`.

The playtest also asked that urging can fail and cost trust (item 1b of the brief). The protest rule below is the
host side of that.

## What changed

The timber rules are gated on the new optional save field `timber: { damp }`. New towns start with it. Saves
without it run the legacy timber physics.

| Physics | Legacy (no `timber`) | Phase C (`timber` present) |
|---|---|---|
| Hall timber | None | `damp` from 0 to 1. It starts at 1.0 the morning after the flood. |
| Drying | None | Each 15-minute round: −0.25 per day on Clear days, +0.05 per day on Rain days, clamped to 0..1. |
| Repair completion | Always adds 1 to the hall | Holds with probability `0.7 + 0.3 × (1 − damp)` (`MIN_HOLD` 0.7), drawn from `keyed(seed, jobEventId, "repair-hold")`. A repair that does not hold adds nothing. It records "X’s repair on the damp timber did not hold." (`repair-slipped`). The player's "help repair" hour uses the same rule. |
| Inspection moisture | Today's weather | `dry` when damp < 0.45, otherwise `wet`. The open-section safety test, the inspection-failed and keep-closed texts, and all three moisture cues read it. |
| Inspection key | `day:hall` | `day:hall:moisture`, so a person can look again on the same day after the timber dries. |
| Airing by hand | — | The player's new "Prop and air the hall timber" hour removes 0.1 damp (`airTimber`). It is offered only while the timber exists and the hall is shut. |
| Drinking | Only "Drink water at home" | Away from home, the one drink offer is "Drink water here" at the current place: 15 minutes, no travel, no activity slot. At home it is the home drink as before. |

Work under protest (`protest.ts`) applies to every save, legacy saves included. HF marks an activity as `protest`
when a voice insisted and the person gave in ("complied"). HF leaves it to the host whether such work goes worse.
In Neighbours, ordinary work done under protest goes wrong with probability `PROTEST_BOTCH` 0.4, keyed by the
job's start event. Ordinary work means the garden, quay supply, the paid shift and hall repair. Botched work
behaves as follows:

- It has no effect on the world: no food grown or carried, no wage and no repair. A botched paid shift still
  counts as a shift served.
- It is finished in HF as `failed`.
- HF's own `finish` then lowers trust in the voice that insisted. The history entry is `went-badly`.
- The journal says "X could not finish <ing>. The work, done under protest, went wrong."

Only the player insists anywhere in `src/core`, so a town that nobody plays is unaffected.

`repair-slipped` is not a town-chronicle kind, which matches `inspection-failed`. The chronicle keeps milestones,
not each setback.

## What did not change

- HF decides who repairs, inspects, opens or keeps the hall closed, and who drinks. No offer is forced, and no
  rule keys on a person id.
- A slipped repair still reports `completed` to HF, because the resident did the work. Reporting it as `failed`
  would feed HF's outcome learning and teach residents that repair is a bad choice.
- No reopening day is guaranteed. Weather is still the seeded daily draw.
- "Fetch an inspector" needs no new physics. The player can ask Lea, the teacher who holds the inspection method,
  to come and inspect through ordinary speech. She may agree even when the timber is wet. The host still keeps the
  hall shut until the timber reads dry.
- **Legacy saves behave identically, but the wording changes.** Two runs were compared: the Phase B tree and the
  Phase C tree, each with `timber` deleted, at 64 people for 200 rounds, seeds 42 and 9. Every save field
  except event `text` and the HF memory `summary` copied from it is equal. The completion lines are voiced now
  ("Sam finished sleeping." instead of "Sam finished sleep at home."), so `stateHash` differs.

## Measurements

The probes are scratch files and are not committed. They run 208 people with `npx tsx` from `neighbours/`, and
seed 42 is the UI default:

- `hall-timeline.ts` runs with no player input.
- `player-hall.ts` adds a scripted player who helps repair while repairs remain and otherwise airs the timber.

The player gets 2 work hours a day (`PLAYER_WORK_HOURS`). Each run counts an hour only when the host accepted it.
"Open" is the first 15-minute round with `hallSafe`. All runs below are 25 days long.

### The chosen floor, 0.7

| Seed | Legacy: 12 repairs / open | No player: 12 repairs / open | With the player: 12 repairs / open | Player hours |
|---|---|---|---|---|
| 42 (UI default) | day 2 10:45 / day 2 19:45 | day 2 12:00 / day 7 19:30 | day 2 04:15 / day 4 08:45 | 7 |
| 73 | day 4 21:30 / day 4 22:30 | day 2 04:15 / day 5 16:00 | day 2 02:15 / day 3 02:15 | 4 |
| 9 | day 4 20:00 / day 6 13:45 | day 2 02:15 / day 4 09:45 | day 2 00:00 / day 3 13:15 | 6 |
| 101 | day 2 10:30 / day 2 19:00 | day 2 04:30 / day 13 11:30 | day 2 06:30 / day 4 07:30 | 6 |

Without the player, the hall stays shut on wet timber for 2–11 days after the repairs. People keep it closed
4–15 times in that stretch (`hall-closed`), and the journal now shows each run of those as one story with a
count. Repairs slipped 1–4 times per seed.

### Floors compared (25 days)

| Floor | Seed 42, no player | 73 | 9 | 101 | Seed 42 with the player | 73 | 9 | 101 |
|---|---|---|---|---|---|---|---|---|
| 0.5 | 9 repairs, never opens | 11 repairs, never opens | open day 4 13:45 | open day 13 07:00 | — | — | — | — |
| 0.6 | open day 7 19:30 | day 4 18:45 | day 4 07:00 | day 12 16:45 | day 7 11:30 | day 3 12:30 | day 4 10:00 | day 3 13:45 |
| 0.7 | open day 7 19:30 | day 5 16:00 | day 4 09:45 | day 13 11:30 | day 4 08:45 | day 3 02:15 | day 3 13:15 | day 4 07:30 |

At 0.5 (10 days), the scripted player reopened every seed: on days 7, 4, 4 and 4 for seeds 42, 73, 9 and 101.

Drink trips, seed 42, no player: legacy had 11,027 home drinks in 8 days, of which 2,787 began with a walk from
somewhere else. Phase C had 4,188 drinks in place and 9,638 at home in 10 days, and no walks home to drink.

### What this shows

- **The player's work matters for reopening, not for repairs.** At 0.7, airing and repairing bring reopening
  forward by 3 days for seed 42, 2 for 73, 1 for 9 and 9 for 101. The background repairs are not slower.
- **The player's presence also changes the town.** The player's speech and work alter residents' later choices,
  so trajectories diverge. The outcomes are not a simple sum of the player's hours.
- **Urging.** An urge is now an insisted ask at strength 0.35. A probe ran seed 42 with 8 people and the player
  urging Lea, Musa, Noor and Ada. All 24 urges were answered "complied", and none was refused. Trust in the
  player fell from 0.80 to 0.68 (Lea), 0.50 to 0.42 (Musa), 0.49 to 0.39 (Noor) and 0.50 to 0.39 (Ada). Within
  one session, an urge therefore fails mainly as botched work under protest, not as a "no". HF can refuse a
  distrusted voice that keeps pushing (trust below 0.25 and pressure above 0.6), but the probe did not reach that
  state. The urge was not tuned to produce refusals.
- **The mood read.** HF's needs are nearly all below 0.15 urgency, and people are mostly mildly positive, with
  joy at about 0.06–0.23. So the new read often says "Even-tempered" or "Cheerful" and seldom names a need. The
  old fixed read said "Settled. Nothing pressing" for everyone. The town is comfortable, and the read reports
  that.

### Negative findings

- **First rates tried:** Clear −0.25 per day, Rain +0.10 per day, dry below 0.4, hold `max(0.2, 1 − damp)`. The
  hall reached only 2 of 12 repairs in 8 days in all four seeds, so it never opened.
- **Why there is a cliff:** residents' repair drive is concentrated at the start. In the first-rates run, repair
  starts per day for seed 42 were 16, 6, 1 and 1 on days 1–4, even though `repair` was offered thousands of times
  a day. Nearly every resident repairs once and does not come back to it. So the hold floor chooses between two
  outcomes. At 0.6 and 0.7, the first two days' attempts are enough and the repairs end on day 2. At 0.5, seeds
  42 and 73 stall for good. No value both slows repairs and lets the town finish them.
- **Floor 0.5 was tried and dropped.** It made the player's work decide everything, but the unplayed UI-default
  town (and seed 73) had no reopened hall and so no social programme (evenings, handcart, bench) in 25 days. Two
  of four evidence subjects were empty, and two browser tests found no new story within 7 days. The 0.5 run's
  output is kept outside the repository.
- **Floor 0.6 was tried and dropped.** The town reopens without the player, but the player's own repairs slipped
  often enough (5 times for seed 42) that the player moved seed 42's reopening by only 8 hours.
- **Threshold coincidence:** a dry-below threshold of 0.5 is exactly two Clear days from saturated timber. Seed
  101 stopped at 0.500032 and missed it by rounding. The threshold is 0.45, so that "not open" means rain rather
  than float rounding.

## Measured and assumed

- **Measured:** every number in the tables and findings above (deterministic runs), the legacy behaviour
  comparison, the urge probe, and the HF tie between the home and in-place drink (both scored by `need:water`
  alone, for example 0.0159 each).
- **Assumed (engineering choices, not measured from real timber or real people):**
  - the damp scale, the starting damp of 1.0, and the drying and rain rates;
  - the 0.45 threshold, the 0.7 hold floor and 0.1 damp per hour of airing;
  - that rain wets indoor timber a little;
  - that every workplace and gathering place has drinking water;
  - that work under protest goes wrong 40% of the time.
- **Not measured:** how a human player spends their two hours, and whether the slower hall feels right. That is
  Adam's feel acceptance.

## Regenerated controls (2026-10-18)

The controls were regenerated by rerunning their generators on the uncommitted Phase C tree (hold floor 0.7) on
base commit 7d2e21e. No digest or hash was edited by hand. The full town profile and its 25-day milestones were
generated first, because the cart probe reads `seed-42-first-prepared.json`. The other generators ran next.

**When the social programme started.** The evening programme waits for the reopened hall, so it now starts later:

| Seed | Phase B: evenings activated | Phase C: evenings activated | Phase C: handcart activated |
|---|---|---|---|
| 42 | day 2 20:00 | day 7 19:45 | day 8 19:15 |
| 73 | day 4 22:45 | day 5 16:15 | day 6 19:15 |
| 9 | day 6 14:00 | day 4 10:00 | day 5 19:15 |
| 101 | day 2 19:15 | day 13 11:45 | day 14 19:15 |

| Control | Result |
|---|---|
| `social-episodes.json` | Regenerated. 19 of 20 milestones were reached. Seed 9 restored the handcart but did not return it to Jo within 25 days, so it has no `cartReturned` milestone. Exact restored continuation passes for all four seeds. The highest sampled underfed count at a daily boundary fell from 33/37/37/39 to 17/20/28/20 (seeds 42/73/9/101). It is still zero at every endpoint. |
| `cart-choice-probe.json` | Regenerated. Ravi's opportunity moved from day 4 to day 9, at the workshop with Ada there. Ravi still chooses the side bench (`cart-slow`), and the goal-ablated arm still chooses paid work. Ravi made 48 decisions instead of 24. |
| `hf-config.json` | Regenerated. It runs its own 8-person towns, so the floor affects it. The assistance, visit and opening results are unchanged apart from the drink label ("Drink water here"). Two changes are new: a natural cart opportunity now occurs in seed 42 (Ravi chooses `cart-slow`), and residents break 1–3 promises per town where Phase B had none. The broken ones are organisers' own promises to host an evening (for example "Host Sam’s shared supper · Day 12 at 18:00", seeds 42 and 101). These 8-person towns now reopen the hall on days 11–12, inside the 14-day window, so evenings now occur in the window. With legacy physics the hall had not opened by day 14, so there were no evenings and no promises to break. This is the known "accepted but undelivered" pattern arriving earlier, not skipped paid shifts. |
| `received-assistance.json` | Regenerated. It restores the private 2.2.1 owner checkpoint, which has no `timber`, so the floor does not affect it. The summary and every candidate are equal to Phase B apart from runtime digests. |
| `received-routes.json` | Regenerated. The 18 published-package arms pass. Only the recording time and source digests changed. |
| `bench-choices.json` and `-summary.json` | Regenerated with seeds 42 and 73 (six cases: three window slots each). Seed 101 stays in the study as a recorded no-case (`noNaturalCase`): `capture-bench.ts` found no genuine Ravi cart-ask decision with Ada at the workshop within 40 days. In the Phase C 8-person town, Ada was at her workshop shift in 1 of the 24 rounds in which a bench proposal was possible; with legacy timber physics, 12 of 24. No other seed was substituted. The probe searches seed 101 again on every run and fails if it now has a natural case. The site shows the no-case line under the study. |
| Weekly packets (not stored in the repository) | Regenerated. |

**Native/WASM parity** passes on all 19 milestones, the eight bench checkpoints (two natural starts and six proposal starts), the two weekly packets, the
private owner checkpoint and the GM checkpoint.

**HANDOFF negative findings, rechecked:**

- **Natural bench cases choose the side bench.** Still true in all six cases: Ravi's first decision is the side
  bench (`cart-slow`) in both arms, and the person-only intact/removed comparison chooses `cart-slow` both ways. No
  case made a bench request, received an agreement or used the main bench.
- **The proposal contrast is confounded.** Still true, and it now shows in the outcome. In all six cases the
  whole-proposal arm returns the cart to Jo within the 48-hour interval, and the no-proposal arm does not (Phase B:
  returned in all nine, in both arms). Neither arm used the bench. In the no-proposal arm Ravi finishes the third
  section 60 minutes later (he eats an hour later) and wakes 15 minutes later, at 19305 instead of 19290. His walk
  and handover then ends at 19350, the minute Jo's quay shift ends (in the proposal arm it ends at 19335, inside the
  shift). The host's meeting check fails at 19350 and again at 19365 while Jo drinks where she is, and Jo then goes
  home; Ravi does not try again in the interval. Measured in seeds 42 and 73. Which part of the meeting check fails
  at the shift boundary (presence or the 15-minute overlap) was not isolated; it may be a boundary edge in the
  host's meeting rule, and it was not changed. The return difference comes through this timing chain, not through
  the bench. The contrast also changes the time mode, knowledge, credit and window, so it cannot say which of them
  moved the timing.
- **Sampled underfed peaks occur.** Still true (17–28), and lower than before.
- **Some accepted activities deliver nothing.** Still true: 3–4 evening candidates per seed were accepted and
  delivered nothing.
- **No HF superiority or human realism is established.** Unchanged. Nothing here measures it.

**Decision taken (lead, 2026-10-18):** keep seeds 42 and 73, record seed 101 as having no natural case in 40 days
under Phase C physics, with the reason, and do not substitute a seed. `probe-bench-choice.ts` lists 101 in
`NO_CASE_SEEDS`; the report's `noNaturalCase` entry carries the measured shift counts; `bench-study-report.ts`
rejects a no-case seed that also appears among the cases; `check-evidence` compares the summary, no-case record
included.

The native model tapes stay historical, as recorded in Phase B.
