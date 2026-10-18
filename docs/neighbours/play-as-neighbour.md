# Playing as a neighbour (2026-10-18 overhaul)

Problem: visitors watched rather than played. The opening felt automatic and the days between choices were passive. This increment puts the player in the town as a person with a voice, a body and a few things they can personally give.

## Who the player is

The player is a returning resident ("you"), lodging in the housing district.

| Resident | Relationship | Why they listen |
|---|---|---|
| Lea | Your cousin. You lodge with her family. | Family trust is seeded high; she also has the most to lose if the class evening fails. |
| Sam | You worked market stalls together before the flood. | Seeded moderate trust; he values a reliable pair of hands at the market. |
| Jo | Next-door neighbour, owner of the handcart. | Seeded low-moderate trust; you have to earn it. |
| Others | You know them by sight. | No seeded relation; HF's default for an unknown voice applies. |

Relations are HF `VoiceRelation` entries for voice `player`, seeded once in new towns. Afterwards HF alone moves trust and pressure (`learnFromVoice`, refusal/insist costs). There is no host credit counter for speech.

## The occasion

One bounded occasion: **the first reopened-hall evening**. Sam wants a supper and Lea wants a class, and they compete for the same hall hour (existing evenings episode). The player's job is to help get *an* evening to happen that the people involved can live with. The player may back one, broker a swap, or stay out. No outcome is scripted; the hall, meals, receipt and attendance remain host physics.

## What the player can do

The player is physically somewhere on the map and moves by choosing a place (travel takes simulated time). Only people at the same place hear the player.

1. **Ask** someone to do one of their actually legal offers (`Suggestion`, low strength).
2. **Urge** (higher strength, `insist`). Insisting can turn "not now" into compliance under protest and costs trust and autonomy, as HF defines.
3. **Promise** something the player will personally do: one hour of the player's own work (cover a market shift, carry meals, help repair), or bring a named thing. A promise is a host-recorded pledge with a deadline, attached to a request. The resident receives it as a told percept. When the player keeps or breaks it, the host reports the actual outcome to HF (`learnFromVoice`). The player has two working hours per day, the same cap residents have for paid shifts.

## The exchange

Speaking is immediate and two-way:

1. Before speaking, the drawer shows `predict` as a hand-written telegraph ("probably: after I eat").
2. Speaking calls `answerNow`. A refusal is booked at once. Any other verdict is held as a standing suggestion and resolved at the person's next decision, which the host brings forward to now (activity review, not a cancel).
3. A `deferred` or `modified` verdict carries HF's counter-offer. The drawer offers it back as a choice: accept their counter-offer, or add a promise that removes their objection (for example covering the shift they named), then ask again.
4. The verdict and the later actual action appear in the person's voice (Caveat) and in the journal.

## Consequences soon after the cause

Speech is answered in the same round. A held suggestion resolves at that person's next decision (brought forward). A promise falls due the same day. The journal shows the request, the verdict, the action actually taken and its delivered result, linked by event ids. "Next choice" advance stops when someone the player spoke to acts on it or a promise falls due.

## Acceptance (coordinator, 2026-10-18)

Within ten minutes a fresh player makes a plan, meets a reasonable objection, changes something concrete and sees a consequence they care about. Checked by a source-unread visitor agenda.

## Not in scope

No synthetic reward for asking, inferred consent, scripted cooperation or LLM-authored outcomes. The narrator/journal only rephrases recorded events, labelled as such.
