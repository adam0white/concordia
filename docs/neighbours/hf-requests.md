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
