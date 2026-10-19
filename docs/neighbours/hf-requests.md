# Generic HF requests from Neighbours

Gaps found while building the player as a neighbour against the published
`@adam0white/human-framework` 2.3.0. Each gap is worked around in the host. None needs Neighbours-specific
code in HF.

**Checked against 2.6.0 (2026-10-18, Phase B).** Neighbours now consumes exact npm 2.6.0. Releases 2.4.0
(opt-in promptings), 2.5.0 (bodily forecast over declared `followedBy` exertion) and 2.6.0 (opt-in slow fatigue
store) close neither request below: `VoiceRelation.seeded` is still set only from `PersonSpec.voices` at
creation, and `learnFromVoice` still learns only from a suggestion's resolution. Both requests remain open and
both host workarounds remain. Neighbours does not opt into promptings, the fatigue store or `followedBy`; those
would change behaviour without a failing case here.

**Checked against 2.8.0 (2026-10-19, Phase D).** Requests 1 and 2 are closed by HF 2.8.0: Neighbours now
seeds the player's voice with `seedVoice` and reports kept and broken pledges with `noteVoicePromise` for players
begun under 2.8.0 (player `version: 2`). Version 1 players from older saves keep the `learnFromVoice`
workaround so their continuation is exact. Request 3 is unchanged. Request 4 is discriminated below.

## 1. Seeding a voice after creation (2026-10-18)

**Gap.** `adoptVoiceTrust(p, voiceId, target, rate)` adds a voice, but it does not mark the voice as `seeded`.
No public call seeds a voice for a person who already exists. Neighbours wants each resident's first trust
in the returning player as an authored starting value: Lea 0.8, Sam 0.6 and Jo 0.4.

**Host workaround.** On the first player input, `src/core/player.ts` (`activate`) calls `adoptVoiceTrust` with
rate 1 for Lea, Sam and Jo. A town nobody plays keeps exactly the bytes and hashes it had before. The voices
are not marked `seeded`. Other residents meet the player at HF's `defaultVoiceTrust`.

**Request.** A `seedVoice(p, voiceId, trust)` call, or a `seeded` option on `adoptVoiceTrust`, for an authored
starting value given after creation.

## 2. A voice keeping or breaking its own promise (2026-10-18)

**Gap.** `learnFromVoice` moves trust only through a resolution that is assented, complied or commanded. A
promise the speaking voice made, such as "I will carry food up by 18:00", is a different kind of evidence. The
listener judges whether the voice did what it said, not whether following the voice went well. HF has no
input for that.

**Host workaround.** When a pledge is kept or lapses, the host calls `learnFromVoice` with the request's actual
assented or complied resolution. It uses felt +0.6 or −0.6, action `pledge:<work>` and reason `pledge-kept` or
`pledge-broken`. If the request was only deferred or modified, HF has no resolution to learn from. The pledge
is then recorded with `hfReported: false` and trust does not change.

**Request.** A generic `noteVoicePromise(p, voiceId, {kept, at, action})` that updates trust and history from
what the voice itself did, separately from the outcome of a suggestion.

**Phase C update (2026-10-18).** The lead asks for this as an HF 2.8 API; it is not in 2.6.0, so the
workaround stays and changes shape. A pledge made with a request that was deferred or modified is now
`offered`: it binds the player only once that person's own next decision follows the request, and is
`released` otherwise, with nothing reported to HF. Once it binds, the decision's resolution is the one
`learnFromVoice` hears, so a broken pledge now lowers trust through HF whenever the person did take up the
request; the journal then says so ("… will trust your word less"). A pledge whose binding decision HF resolved
as anything other than assented or complied is still recorded with `hfReported: false`. `noteVoicePromise`
would remove that remaining gap and the borrowed resolution.

## 3. Travel time is free in choice (2026-10-18, Phase C)

**Finding.** Sam walked home twice to drink water. The host offered drinking only at home, with effort 0. HF
scored the home drink by `need:water` alone (for example 0.0159), the same as a drink where he stood, and gave the
30–60 minute walk no cost. Residents walked home to drink 2,787 times in 8 days (208 people, seed 42).

**Host fix.** Offering water only at home was the host bug. Away from home, the drink offer is now "Drink water
here" at the current place, so the walk no longer happens ([phase-c-physics.md](phase-c-physics.md)).

**Request.** An optional travel or setup cost on an offer that choice weighs against what the offer advertises,
or a documented recipe for expressing it through `effort` or `duration`. Today a host has to remove the long
route to stop people taking it for nothing.

## 4. Residents rarely return to work they have done once (2026-10-18, Phase C)

**Finding.** Hall repair is offered to residents thousands of times a day, but nearly everyone repairs once and
does not come back to it. Repair starts for seed 42 were 16, 6, 1 and 1 on days 1–4. When a repair does not hold
on damp timber, the remaining work therefore falls to the player. Neighbours takes this as given and does not
work around it ([phase-c-physics.md](phase-c-physics.md)).

**Not yet a request.** This may be intended HF behaviour (satiated competence and belonging after one long
job). It is recorded so that a later HF review can decide whether shared unfinished work should keep some pull.

**Discriminated (2026-10-19, Phase D, HF 2.8.0).** `neighbours/scripts/probe-repair-return.ts` restores the seed-42,
208-person town at day 3, after its twelve repairs, injects six sections of fresh damage and runs one more day,
reading every HF decision record. Confirmed: repair was a legal offer in 6,915 of 7,063 decisions and was chosen
0 times (median utility gap 0.033; mean repair terms `need:competence` 0.0005, `need:belonging` 0.0093, `effort`
−0.0304). On days 0–1 the same offer was chosen 76 times in 2,819. So the work did not run out: residents decline
work that is still offered, because the offer advertised only needs that other work had already met.

**Outcome: host offer design, fixed in the host.** Nothing about the hall said it mattered to anyone. Neighbours
now lets wet timber work a repaired section loose (a keyed daily draw while the hall is shut and damp), and a
resident who sees the loose supports at the hall may adopt one bounded HF goal, "Make the hall sound again"
(serves meaning and belonging, importance from their own benevolence, two-day deadline, one repair achieves it).
No offer value changed and no bonus was added; HF still decides. Same probe on the final Phase D code: 30 repairs
chosen in 369 offers (offers are capped by the three tools); the arm without the new marker still chooses 0 in
6,699. Unplayed 208-person towns, 25 days: seeds 42 and 101 each loosen three sections and still reopen (day 7
20:30 and day 12 16:30); seeds 73 and 9 dry before any loosening and reopen on day 4.

**Does HF need anything?** Not to fix this. One narrow, generic question is left for the HF owner, below.
Assumed, not shown: that real people return to shared work because they see it undone, not because of a
standing pull from the work itself.

### 4a. Proposal (low priority): perceived unfinished shared work

- **What.** A documented HF recipe, or a small helper, for "a person sees shared work undone and may take it on":
  perception → bounded goal with `advancedBy`, importance from the person's own values, abandoned when the world
  says it is done.
- **Confirmed.** Without a goal, HF's choice correctly ignores work whose advertised needs are met (0 of 6,915).
  With a perception-triggered goal adopted by the host, residents return (30 of 369).
- **Assumed.** Other games (repairs, chores, communal duties) will hit the same pattern and reinvent it.
- **Workaround in use.** `neighbours/src/core/hall-care.ts`: host perception calls `adoptGoal` and later
  `abandonGoal`. It works; the request is documentation and reuse, not a missing capability.
