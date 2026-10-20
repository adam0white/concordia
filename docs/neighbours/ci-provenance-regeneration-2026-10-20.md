# CI provenance regeneration, 20 October 2026

The lab-client 0.1.2 package change and Round 4 changes to `contracts.ts`, `core/player.ts` and `core/runtime.ts` made recorded evidence stale. The provenance gate and all three native replay gates correctly rejected it. Artifact regeneration reruns the existing generators without changing their checkers, assertions, simulation sources, dependencies or provider policies. The separate browser fix preserves existing checks and strengthens setup assertions.

Generation uses runtime source commit `b6d3821c83ca893f00e77b9275c4129402fad402`, exact published HF 2.8.0 and lab client 0.1.2. The native artifacts report clean runtime sources. Report and browser-test edits outside the recorded source sets do not change those identities. Earlier reports remain in Git history. The byte-pinned historical HF 2.6.0 assistance report remains unchanged because its private input is unavailable.

## Commands

Use Node 26.12.0 explicitly. The local shell selected Node 23 when entering the app directory; those initial deterministic runs were superseded by full Node 26 runs. No measurements or hashes were patched.

From `neighbours/`, with `/opt/homebrew/bin/node`:

```sh
/opt/homebrew/bin/node scripts/profile-evenings.ts --seeds 42,73,9,101 --population 208 --days 25 --output public/experiments/social-episodes.json --checkpoint-directory /tmp/neighbours-ci-regeneration-20261020/social-node26
/opt/homebrew/bin/node scripts/probe-cart-choices.ts /tmp/neighbours-ci-regeneration-20261020/social-node26/seed-42-first-prepared.json public/experiments/cart-choice-probe.json
/opt/homebrew/bin/node scripts/probe-hf-config.ts --output public/experiments/hf-config.json
/opt/homebrew/bin/node scripts/probe-received-routes.ts public/experiments/received-routes.json
/opt/homebrew/bin/node scripts/probe-bench-choice.ts --output public/experiments/bench-choices.json --summary-output public/experiments/bench-choices-summary.json --checkpoint-directory /tmp/neighbours-ci-regeneration-20261020/bench-node26
/opt/homebrew/bin/node scripts/check-evidence.mjs
```

From the repository root, the existing `.venv/bin/python` is Python 3.15.0. CI separately uses Python 3.12.13. Native generation used root-shell Node 26.12.0:

```sh
.venv/bin/python neighbours/scripts/run-gm-director.py --output neighbours/public/experiments/gm-director.json
.venv/bin/python neighbours/scripts/run-bench-director.py --output neighbours/public/experiments/bench-director.json
.venv/bin/python neighbours/scripts/run-mixed-town.py --node node --rounds 12 --seed 42 --output neighbours/public/experiments/native-mixed-town.json
.venv/bin/python neighbours/scripts/run-mixed-town.py --node /opt/homebrew/bin/node --replay neighbours/public/experiments/native-mixed-town.json
.venv/bin/python neighbours/scripts/run-gm-director.py --replay neighbours/public/experiments/gm-director.json
.venv/bin/python neighbours/scripts/run-bench-director.py --replay neighbours/public/experiments/bench-director.json
```

The existing CLI adapters use Opus with low effort. Generation made seven mixed-town decisions, one GM proposal and two bench proposals: **ten genuine calls**, with no usage-limit error. Each generator's exact replay passed. All three separate replay commands passed with **zero calls**. The GM proposed dry-sound for 240 minutes. Both native bench proposals chose soon. These are recorded studies; the public browser still makes no live model calls.

## Limits and retained negative findings

The full unchanged `check-evidence.mjs` passes all five current-source studies and the byte-pinned historical assistance report. All four 208-person, 25-day social runs report stable sources, zero diagnostic errors and exact eight-round restored continuation. All twenty social packet hashes match their actual files, complete-round boundaries and prior recorded milestone hashes. Social packet hashes include the trailing newline, as their generator specifies; bench hashes cover the encoded JSON without it.

| Seed | Endpoint alive | Highest daily sampled underfed | Endpoint underfed |
|---|---:|---:|---:|
| 42 | 208 | 2 | 0 |
| 73 | 208 | 0 | 0 |
| 9 | 208 | 1 | 0 |
| 101 | 208 | 0 | 0 |

Endpoint zero does not establish continuous welfare. Some accepted social activities still deliver nothing: seed 9's weekly-1 meal has 25 acceptances, seven attempted participants and zero delivered participants. These are retained measurements.

All nine deterministic bench cases still choose side-bench work with intact and removed received knowledge. They make no bench request, receive no agreement and complete no main-bench work. Seed 101 returns Jo's cart without the whole proposal and does not return it with the proposal during the measured interval. That contrast remains confounded. Native provider coverage remains seeds 42/73; the report's Phase C exclusion of seed 101 remains historical and does not describe the current deterministic study.

The compact bench summary is generated from the raw report and its actual SHA-256. All twelve captured bench packet hashes match their actual files and have no pending round. Received-route controls pass all eighteen arms. Rerun HF configuration arms, cart opportunity, bench cases and received-route results match the prior measured results when process IDs and wall time are excluded. No current-source claim is made for historical assistance. Gitleaks scanned 24.84 MB of experiment artifacts and found no leaks; a separate private-path/token-marker scan found none. These controls establish evidence identity and bounded behavior, not HF superiority, human realism or Adam's feel acceptance.
