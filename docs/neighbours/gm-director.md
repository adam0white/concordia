# Native Concordia situation proposal experiment

The native experiment uses the repository's actual upstream `EntityAgent`,
`SwitchAct`, `EventResolution` and `MakeObservation`. `EventResolution` runs one
model-backed resolution step. Its result is a typed proposal. Python validates
the proposal before `MakeObservation` places it in a host inbox. Observation
fallback is disabled. Model-selected observers are disabled. The host inbox is
an orchestration boundary, not a resident receiving an observation.

The proposal has exactly these fields:

```json
{"schema":"neighbours-gm-proposal@1","kind":"inspection-request","target":"hall-annex","cue":"unsupported","windowMinutes":240}
```

Allowed cues are `dry-sound`, `wet-sound` and `unsupported`. The window must be an
integer from 60 through 1440 minutes. Additional keys, duplicate JSON keys,
Markdown fences, invented recipients, expertise and outcome claims reject.
The game host must validate the same contract and current circumstances before
applying a proposal. The native experiment itself applies no physical changes
and delivers no resident observations. A proposal cannot prove learning,
consent, attendance, a completed repair or a hidden physical fault.
The cue selects an intentional physical premise for a new annex situation.
It is admitted only when the host validates and applies the proposal. It does
not diagnose an existing hidden fault. `unsupported` supplies unknown moisture
and support observations; the other cues supply their named observations.

The source is pinned to upstream commit
[`6fbfbc58f324aa74f78568c488713210889a801e`](https://github.com/google-deepmind/concordia/tree/6fbfbc58f324aa74f78568c488713210889a801e).
On 16 October 2026, upstream HEAD was
[`4b7e02a94b719e56f10989046af32d79bbbc3b9c`](https://github.com/google-deepmind/concordia/tree/4b7e02a94b719e56f10989046af32d79bbbc3b9c).
The inspected latest
[`EventResolution`](https://github.com/google-deepmind/concordia/blob/4b7e02a94b719e56f10989046af32d79bbbc3b9c/concordia/components/game_master/event_resolution.py)
and
[`MakeObservation`](https://github.com/google-deepmind/concordia/blob/4b7e02a94b719e56f10989046af32d79bbbc3b9c/concordia/components/game_master/make_observation.py)
were byte-identical to the local pinned components. This experiment does not
upgrade upstream. Generation and replay verify critical local component bytes
against the pinned Git objects.

Native GM supports Python 3.12 and later. Python 3.12 and 3.13 were tested.
Install the pinned dependencies in `neighbours/native-gm-requirements.txt`.
The town bridge requires Node 24 or later; the project pins Node
26.12.0. Generation also requires an authenticated `claude` CLI. The runner
advances a fresh fictional eight-person town through actual HF choices until
the hall has opened and a weekly opportunity exists. `capture-weekly.ts`
exports that checkpoint; Python Concordia restores and saves it canonically.
No hall progress or successful outcome is injected. The runner cannot import
an owner save. Run from the repository root:

```sh
python neighbours/scripts/run-gm-director.py --node /opt/homebrew/opt/node@26/bin/node --output /tmp/neighbours-native-gm.json
python neighbours/scripts/run-gm-director.py --replay /tmp/neighbours-native-gm.json
python -m unittest concordia.contrib.neighbours.gm_director_test
```

Generation makes one bounded Claude call with tools, MCP servers, settings and
session persistence disabled. Its actual limits are a 100-second response
deadline, a 1 MiB CLI envelope limit and a 4096-byte UTF-8 proposal limit.
Oversized envelopes fail visibly; oversized proposals remain recorded as
rejections. Concordia's `max_tokens` hint is not a CLI token limit. The prompt
requests a small JSON response. It keeps only the response text and selected
model provenance. There is no automatic retry or controller fallback. Invalid
model proposals remain recorded as rejections. Runtime fingerprints cover the
actual upstream Python modules, the custom engine and adapter, current town
core, contracts, inspection method and offer semantics, checkpoint-capture
script and exact released HF version. The artifact includes the exact
starting checkpoint and its hash. Replay regenerates the upstream prompt,
consumes the recorded response and validates the complete result, source
fingerprint, checkpoint and proposal. Replay makes zero model calls.
The prompt receives a compact projection of the exact checkpoint: time, hall
repair/safety/capacity, resident roles/current jobs and retained inspection
rule/evidence counts, plus upcoming social records with their actual stages.
Those host records do not become shared resident knowledge. A retained count
does not establish expertise, willingness or a future choice.

Three private integration probes each made one real call through Claude CLI
2.1.299 using resolved model `claude-opus-5-5`. Each proposed an `unsupported`
cue with a 240-minute window. They predate subsequent source edits and remain
integration evidence only. A dependency failure before another attempted run
made no model call. No rejected proposal was silently replaced.

The fourth and final call ran against committed implementation
`a994cc4fadfe0945a124cba26a9c0276c3d524ec`, with clean recorded source files.
It proposed `wet-sound` with a 240-minute window. The actual upstream chain
accepted the typed proposal and its zero-call replay passed. The published
[complete report](../../neighbours/public/experiments/gm-director.json)
retains the response tape, actual checkpoint context and source digests.
This is a single native proposal offered to the browser as a recorded case.
A short successful proposal does not establish sustained generative game
quality or a live browser GM.
