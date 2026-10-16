# Reproduce the inspection and native mixed-policy experiments

The browser town runs Python Concordia and HF locally in the visitor's browser. It does not call an LLM. The Inspector's experiment results are recorded native runs, not live browser residents or new model calls.

## Setup

Use Node 24 or newer and Python 3.12. Install the app dependencies with `npm ci` from `neighbours/`. The native Python engine imports Concordia from this repository and needs `absl-py`; it does not need an API key or an LLM for HF-only runs.

From the repository root:

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install absl-py==2.4.0
cd neighbours
npm ci
```

The commands below assume that directory. Set `NODE` to the supported executable if the `node` on your PATH is older than 24. In the tested development environment, the default shell's Node was older than the separately installed supported executable. Do not assume the two are the same.

## HF-only native and browser-Python checks

```sh
../.venv/bin/python scripts/run-town.py --node node --seed 42 --population 208 --rounds 12 --output /tmp/town.json
node scripts/prepare-runtime.mjs
env PYTHON=../.venv/bin/python node scripts/check-parity.mjs
```

The parity script runs native CPython and actual WASM Python against the same TypeScript runtime. It checks their 208-person checkpoints, restored continuation, recovery from an engine whose round failed, rejection of malformed imports, and successful advancement after that rejection. Preparing the runtime first refreshes the packaged Python source.

From the repository root, the native bridge test command is:

```sh
env PYTHONPATH=. NODE=node NEIGHBOURS_NATIVE_TEST=1 .venv/bin/python -m unittest concordia.contrib.neighbours.engine_test concordia.contrib.neighbours.bridge_test
```

## Conditional inspection control

The [inspection helper](../../neighbours/src/experiments/inspection.ts) teaches two received cue mappings through released HF 2.2.1. It does not increase scalar skill or consult hidden world truth when choosing. The [runner](../../neighbours/src/experiments/runner.ts) compares intact learning, withheld teaching, removed acquired rules, an equal-example table, and seeded random choice. The host scores outcomes separately.

```sh
node node_modules/vitest/vitest.mjs run tests/experiments.test.ts
node --input-type=module -e 'import {runInspectionExperiment} from "./src/experiments/runner.ts"; console.log(JSON.stringify(runInspectionExperiment(19),null,2))'
```

At seed 19, intact HF and the table each complete two supported cases and ask for help in two unsupported cases. Withheld and removed-learning HF ask in all four cases. The random control completes one and attempts one unsafe opening. Asking for help is an authored low-effort fallback. These results demonstrate bounded conditional transfer, not general planning or superiority over a table learner.

## Actual LLM inspection calls

Install and authenticate the Claude Code CLI separately. The native runner uses the existing local CLI authentication. No credentials belong in this repository or its public artifacts. Without working authentication or a valid model response, the command fails; it does not substitute an HF or canned answer.

```sh
node scripts/run-llm-inspection.ts --model opus --seed 19 --output public/experiments/inspection-comparison.json
```

This makes four fresh model calls, one per received observation. Each call has the same demonstrations and legal action descriptions. Hidden physical truth is excluded from the prompt. The host applies the same external outcome score after strict JSON/action validation. The run disables tools, MCP servers, project/user settings, slash commands, Chrome, and session persistence; it runs in a fresh temporary directory. It retains only task prompts, task responses, resolved model names, and selected timing/cost metadata. It omits session IDs and credentials.

The recorded run resolved the `opus` alias to `claude-opus-5-5`. It matched intact HF and the table: two completed cases, no unsafe opening, and two requests for help. This is one run per case. Models have pretrained semantic knowledge that the table and HF method module do not receive from these examples. CLI-reported cost is metadata, not a verified invoice charge.

## Actual native mixed town

[The mixed adapter](../../neighbours/src/experiments/mixed-native.ts) keeps seven HF decision policies and routes Ada's decisions to a real external model. Ada retains HF body/person state but receives a labelled external decision record. The adapter does not copy an unchosen HF intention or claim an LLM answer came from HF. Python Concordia still validates the action and the deterministic host still resolves the outcome.

```sh
../.venv/bin/python scripts/run-mixed-town.py --node node --model opus --seed 42 --rounds 12 --output public/experiments/native-mixed-town.json
```

The runner allows at most eight new model decisions. Each request is keyed by a SHA-256 digest of the exact world state and available choices. A missing, malformed, or mismatched answer fails without fallback. Checkpoints retain the validated response tape. The runner then repeats the episode from its original checkpoint in replay mode, which cannot request new model responses, and requires exact final state and view equality.

The artifact records source-file SHA-256 digests, the pinned HF package identity, Git HEAD at recording, and whether those source files had uncommitted changes. Source digests identify the executed implementation even when the final artifact is committed afterward. If runtime sources change during a run, publication fails.

To verify the checked-in artifact in CI, with no Claude installation or model authentication required:

```sh
../.venv/bin/python scripts/run-mixed-town.py --node node --replay public/experiments/native-mixed-town.json
```

This checks the runtime source digest before replay. A source change requires reviewed regeneration of the evidence; do not replace the stored digest to conceal drift. Recorded-response replay proves deterministic continuation with those responses. It does not claim that a new LLM call would repeat them.

The mixed artifact is a short demonstration of a working native controller boundary. It is not a fair performance estimate for HF versus LLMs, and it does not enable public live LLM inhabitants.

An earlier recording revision required a retry: the model returned Markdown-fenced JSON, which the strict parser refused. An explicit plain-JSON instruction resolved that attempt. The final world recording then succeeded on its first attempt and contains six legal model decisions. The artifact retains the earlier rejection separately. That failed run did not persist a tape, so its total call count is unknown; the successful tape alone cannot estimate format reliability.

## Food supply and access controls

These checks diagnose the host world, not HF superiority. The original four-hour food delivery of four to eight meals did not scale from eight to 208 residents. In seed 42, at round 1688, market stock was zero, 190 residents had satiety below 0.1, and three were dead. One dead resident still had 67 money units. Actual HF food outcomes increased satiety correctly; the host had supplied too little food.

Population-scaled deliveries now provide roughly three meals per person per day, stopping when available stock reaches a two-day pantry target. Food reservations, consumption and production remain conserved. A 30-day seed-42 run with 208 people had no deaths or error diagnostics and passed exact restore plus eight-round continuation. Eight residents were still underfed. This was not accepted as evidence of indefinite sustainability.

A separate seed-73 run exposed access starvation despite a full pantry. All eight underfed residents at day 30 had no money; most were late-listed shop assistants competing for market capacity with diners. Starting from that exact checkpoint, five additional days gave:

| Actor priority | Deaths at day 35 | Living residents with satiety below 0.1 |
|---|---:|---:|
| Original fixed resident-array order | 2 | 6 |
| Seeded per-round priority | 0 | 0 |

The keyed arm restored access to paid work and meals for all eight initially hungry residents. Both arms kept the same initial state, HF parameters, food supply and venue capacities. No actor was forced to eat. This supports correcting scheduling bias; it does not establish general planning or eliminate all possible scarcity.

The measured fixture was the local, uncommitted `/tmp/neighbours-30day-seed73.json` checkpoint from before the scheduling correction. It is not distributed as a historical reproducibility artifact. The control explicitly sorted each `prepareRound()` result by the original `people` array before calling `choose` and `apply`; the treatment used `keyed(seed, round, 'ready-priority:' + actorId)` order. Each ran 480 rounds from a separately restored copy. The current baseline can be checked with `node scripts/profile-town.ts --seed 73 --population 208 --days 30 --output /tmp/town-profile.json` from `neighbours/`. A fresh current baseline is not the historical fixed-order fixture.

## Social episodes and project choices

The [episode design](evenings.md) distinguishes proposed events, received notices, voluntary appointments, physical room reservations and actual delivery. The multi-seed TypeScript host profiler records successes and failures, retained health samples, source digests and exact restored continuation. It does not execute Python; native/WASM controls separately exercise genuine milestone packets.

```sh
cd neighbours
node scripts/profile-evenings.ts --seeds 42,73,9,101 --population 208 --days 25 --output /tmp/evenings.json --checkpoint-directory /tmp/town-milestones
PYTHON=../.venv/bin/python npm run test:parity -- --checkpoint-directory /tmp/town-milestones
node scripts/probe-cart-choices.ts /tmp/town-milestones/seed-42-first-prepared.json /tmp/cart-choices.json
```

The choice probe finds a real idle Ravi/Ada workshop opportunity with both asking and side-bench work feasible. It records the recorded top-ranked alternatives and removes only Ravi's cart goal in a separate branch. Its second comparison supplies hypothetical fast access as a matched offer pair; it does not pretend an agreement occurred. No input packet or fabricated grant is imported into the visitor's live town.

In the measured opportunity, Ravi chose side-bench work; the request did not appear in the retained top-ranked alternatives. HF scored every supplied offer, so this does not establish a failure to evaluate asking. Goal ablation changed his choice to paid work. The hypothetical fast/slow pair had identical immediate terms despite different durations. These are narrow representation findings. They do not establish rational anticipation, autonomous negotiation, or a generic planner defect.


## Next candidate: received learning changes who can help

Revisit on 2026-10-20 under `nbh-01z.10`. This is a targeted Astra proposal, not implemented behavior. Current `core/offers.ts` makes inspection answers Lea-only, says “Wait for Lea,” and removes ordinary inspection after the hall becomes safe. Retained learning therefore has few later practical opportunities. Generalizing who can receive a request and offer assistance is a more direct progression experiment than adding another authored repair sequence.

Start with one actual later inspection need and a resident who genuinely received the relevant methods. The host supplies physical conditions and consequences. Requests must be received. Anyone may attempt help; the host must not designate a successful expert or force acceptance. Compare intact learning, only that resident's relevant rules removed, and a simple lookup policy given the same demonstrations and cues. Withhold the received request in a separate matched branch. Keep external conditions keyed independently of actor order. Record decision terms, assistance, unsupported cases and the actual physical result across several seeds.

Reject the capability claim if learning ablation changes nothing, no usable request opportunity occurs, or success requires a host-selected helper. A watcher must be able to see who became useful and what changed without numerical diagnostics. Matching the lookup baseline is acceptable and does not establish HF superiority.

Astra suggested a small hall annex with occasional condition-driven inspection and a limited seat contribution. That physical design remains unselected: the present town has only two authored evening opportunities, so later extra seats alone could have no consequence. First establish a recurring need with real use, then choose the site. Avoid catastrophe resets, invisible globally shared expertise, forced volunteering and HF goal tuning for a preferred story. This proposal alone does not justify a framework release.
