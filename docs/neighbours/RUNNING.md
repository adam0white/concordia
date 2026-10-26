# Run and debug Neighbours

Use Node 24 or newer (the current local toolchain is Node 26.12.0) and Python 3.12 or newer. The welcome screen appears before runtime downloads. Choosing Enter Alder Quay downloads about 13 MB of self-hosted Python assets on a first visit. Fresh canonical towns have six named people and 200 background residents, all using published HF3.0.0 (Person engine2.23.0) through the actual custom Concordia engine. Time advances automatically, with reading time after a new story or notice. An open conversation holds time. Game menu pauses after pending commands and saves finish; closing it resumes the remaining reading time. It needs no model key. Python failure is visible; no recording or alternate engine silently replaces it.

```sh
cd neighbours
npm ci
npm run build
npm run dev -- --port 5190
```


Checks:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install absl-py==2.4.0
cd neighbours
npm run check
npx playwright install chromium
npm run test:e2e
node scripts/profile-town.ts --days 30 --population 206 --seed 42 --max-deaths 0
PYTHON=../.venv/bin/python npm run test:parity
cd ..
PYTHONPATH=. NEIGHBOURS_NATIVE_TEST=1 NODE=node .venv/bin/python -m unittest concordia.environment.engine_test concordia.contrib.neighbours.engine_test concordia.contrib.neighbours.bridge_test
```

The strict typecheck includes application code, browser tests and the native/experiment TypeScript scripts. The parity check runs actual native CPython and WASM Python over the same 206-person state, compares complete checkpoints, restores a continuation, recovers an interrupted engine, and verifies that a rejected import leaves subsequent progress usable. Historical controls can retain the former eight-person cast. The long-run profile reports population health, finite food stock, checkpoint size and elapsed time every five days, checks host invariants, and verifies exact restored continuation. Change its seed to sample a different town; these measurements do not establish human realism. Unit controls also cover physical conservation, legal choices, acquired-method removal and malformed checkpoint fields. Runtime diagnostics report violations separately from valid delayed outcomes.

The browser suite builds production assets and opens an isolated Chromium profile. It runs actual Python WASM and HF, downloads and imports packets through the UI, checks save ownership and exact paused restoration on reload, recovers the previous seed, rejects a bad import without losing progress, and checks mobile layout and keyboard controls. It uses only isolated test profiles, including their device-save storage. It does not inspect a user's browser profile. Failed runs retain traces and screenshots under ignored test-output directories. CI installs Chromium's Linux dependencies and uses one test worker, following [Playwright's CI guidance](https://playwright.dev/docs/ci).

For a native artifact:

```sh
python neighbours/scripts/run-town.py --seed 42 --population 206 --rounds 288 --output /tmp/town.json
```


Current increment: [mobile focus](mobile-focus.md). Town, Help, Stories and Inspector replace the stacked layout. Town shows the actual hall goal, map and familiar neighbours. A mobile person selection replaces the map; Back to town restores it. Help owns the actual interventions and their costs. Stories owns retained outcomes. Inspector keeps hypothetical comparisons and folded diagnostics/evidence. Changed outcomes appear before shared history and endpoint resources.

Use **Game menu** for Journal, Feedback, recording and speed. The title page offers saved towns and fresh play under **Other ways in**. Exact `?lab=1` also exposes export/import, comparisons and recorded studies. Escape closes the native menu and returns focus. Walk and Talk stay below the reading sheet; that sheet scrolls independently of the map and actions. Journal keeps its heading and close control above its scrolling record.

Feedback consumes immutable lab-client0.4.11 and lab-kit0.5.12 artifacts. “I'm stopping” and “I'm confused” select optional note text. Selection sends nothing. Submit uses the existing recording/privacy and optional-run path. “Sent. Your note is stored.” acknowledges the note; it does not prove that optional run chunks arrived.

Local lint, all application/script/browser typechecks, 292 unit tests across 44 files, all 20 actual-WASM browser tests, production build and 29 native controls pass. Actual Firefox Nightly and isolated Chromium checks are described in [the mobile visitor report](visitor-2026-10-16-mobile.md), including the native minimum-width and iframe limitations. Current-source profiles, controlled probes and exact native/WASM continuation remain verified. Hosted [CI 38962857513](https://github.com/adam0white/concordia/actions/runs/38962857513) passes every step. The private owner checkpoint is not a public fixture or a compatibility promise. Earlier evidence remains in [the prior GM increment](gm-and-town-agency.md).

The delivered increment adds compact sticky controls, truthful dated invitation and cart status, and action guards that reflect actual host eligibility. History keeps separate dated outcomes. The annex assistance situation is available after the main hall opens. A selected neighbour must receive the request, travel, observe the instantiated timber conditions and finish an actual HF inspection decision. Only a completed safe opening adds four places. One authored or recorded GM proposal is admitted per town. Applying its premise does not establish a successful inspection or shared resident knowledge.

The native GM experiment uses actual upstream `EntityAgent`, `SwitchAct`, `EventResolution` and `MakeObservation`, pinned to the repository's upstream source identity. It makes one bounded genuine model call. Its typed output passes Python and host validation. Invalid output remains a rejection; replay consumes the exact response with zero model calls. This native experiment does not enable live browser LLM calls. Install its separate requirements and read [the GM contract and commands](gm-director.md) before generating or replaying an artifact:

```sh
.venv/bin/python -m pip install -r neighbours/native-gm-requirements.txt
.venv/bin/python neighbours/scripts/run-gm-director.py --node node --output /tmp/neighbours-native-gm.json
.venv/bin/python neighbours/scripts/run-gm-director.py --replay /tmp/neighbours-native-gm.json
.venv/bin/python -m unittest concordia.contrib.neighbours.gm_director_test
```

Generation requires an authenticated Claude CLI. It advances a fresh fictional town; it cannot import an owner save. The browser uses a recorded proposal or an authored control through the same strict host contract. The proposal selects a new scenario premise, rather than diagnosing a pre-existing hidden fault. Model prose cannot establish attendance, learning, repairs, expertise or consent.

`neighbours/scripts/probe-hf-config.ts` runs isolated configuration arms and records full configurations and negative results. It does not change production defaults. The assistance probe compares retained learned inspection rules, removed rules and a withheld request from the same physical checkpoint. A real received lesson from Lea in Ada's intake supports a bounded transfer control; it does not establish general expertise or willingness. Keep private intake checkpoints and their contents out of public artifacts.

After the hall opens, recurring weekly class/supper pairs share one room. The programme contains twelve weekly cycles. Each cycle supplies one support choice, shared between funding an unposted alternate date and advertising a posted invitation. This works even if all three original interventions have been spent. A second valid choice can use the original allowance. Bus and tools use only the original allowance. Credits expire with their cycle and reload does not refill them. The selected evening's comparison covers seven simulated days, reports progress every eight rounds and offers cooperative cancellation. Comparison spends allowance only inside its hypothetical branch.

Person History shows consequential outcomes first and folds routine action traces. Separate scheduled occurrences retain their IDs and dates. Missing older detail is labelled without claiming that a retained outcome disappeared. Estuary and housing presentation preserve saved coordinates and travel times. The Inspector exposes recorded report provenance and limits separately from live diagnostics.

The live browser uses HF choices for every resident. Recorded Inspector evidence includes separate native mixed-controller and GM runs and explicitly reports their limits. It does not establish broad superiority. The native mixed-town adapter labels external choices, validates only feasible actions and saves the exact response tape. Replaying it must not call a model. See the experiment scripts and their `--help` before opting into fresh authenticated model calls.

The town is saved in IndexedDB on the current device. A shared revision transaction prevents another tab from silently overwriting a newer checkpoint; a stale tab pauses and offers to load the device town. Closing a session aborts its queued/in-flight writes. Existing clients opened before this protocol cannot be retroactively protected. A returning visitor restores that checkpoint before the town appears, then automatic pacing gives reading time before continuing. Saved-town controls report the time of the committed device save. Export downloads complete runtime JSON compressed losslessly as `.json.gz`. Import accepts both gzip and older plain `.json` files. Compressed input and expanded JSON each have a 50 MiB limit. IndexedDB keeps its existing uncompressed representation. Export request ownership prevents late compression from publishing a superseded download. Imports validate host state; they are user-supplied game data, not authenticated evidence of an unmodified historical run. Keep recorded experiment provenance separate from imported towns.

Production uses `cloudflare.config.ts` and the official cf CLI. Run `npm run build:cloudflare`, inspect `cf deploy --prebuilt --dry-run --mode production`, then deploy with an authorized Cloudflare credential. No credential belongs in source or browser assets. `/release.json` identifies the commit, dirty flag, exact HF version and Python bundle digest. `/third-party-notices.txt` contains the distributed licenses.

Use `bd ready`, `bd show nbh-01z` and `bd list` for remaining work. The local project store is authoritative. Sync its Dolt remote independently of ordinary Git pushes.

## Optional installed Firefox check

The browser suite uses isolated Chromium. To additionally test an installed Firefox Nightly, install Selenium in a separate Python environment and supply the actual browser and geckodriver paths:

```sh
python neighbours/scripts/check-firefox-nightly.py \
  --base-url https://neighbours.adamwhite.work \
  --binary '/Applications/Firefox Nightly.app/Contents/MacOS/firefox' \
  --driver /path/to/geckodriver \
  --output /tmp/neighbours-nightly-check
```

The verified run used Nightly 160.0a1, geckodriver 0.37.1 and Selenium 4.51.0. The script creates a temporary profile and downloads no tools. Add `--checkpoint /path/to/synthetic-save.json` only for an authorized test fixture. `--local-iframe` is restricted to localhost; it checks narrow layout/keyboard behavior and does not establish phone or touch support. Native macOS headless Firefox can clamp narrow windows to 500px. The live deployment was also checked at native 844×390.


## Received-plan controls and recordings

Use a clean committed source before recording. Keep sources unchanged throughout measurements. Write to a temporary directory first; validate and publish completed reports together. Do not repair source hashes in an old report. Native provider recordings require an authenticated Claude CLI; replay makes no model call.

From `neighbours/` with the pinned dependencies installed:

```sh
node scripts/probe-received-routes.ts /tmp/received-routes.json
node scripts/probe-bench-choice.ts --output /tmp/bench-choices.json --summary-output /tmp/bench-choices-summary.json --checkpoint-directory /tmp/bench-checkpoints --require-clean
```

From the repository root with the isolated native requirements installed:

```sh
python neighbours/scripts/run-bench-director.py --node node --model opus --output /tmp/bench-director.json
python neighbours/scripts/run-bench-director.py --replay /tmp/bench-director.json
```

The bench producer freezes seeds 42/73 before its two actual calls (seed 101 has no natural case under Phase C physics and is recorded, not substituted) and retains failed/rejected proposals. It does not apply proposals or deliver resident observations. Keep those steps separate from recipient decisions, consent and physical work. The raw bench study stays downloadable; its11.8KB UI projection must match the full report and its byte SHA-256. `node scripts/check-evidence.mjs` checks published evidence. See [the evidence receipt](visitor-2026-10-18-received-plans.md) for negative outcomes and source identity.

The Pass receiving entry validates every parent and claim envelope before physical restore. Claim bodies must equal the published SDK transformation, including the branch, source tuple and unchanged transfer except prepared life. The finite Pass adapter accepts only the reviewed453be903/minute1390 checkpoint. Own Neighbours continuations carry its exact original envelope and a raw incoming person witness; the receipt digest and published calendar projection must agree. Unlinked receiving wrappers, other producers and other Pass snapshots refuse. This is consistency checking for imported data, not authentication or proof of a human journey.
