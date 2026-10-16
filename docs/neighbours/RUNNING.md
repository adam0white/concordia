# Run and debug Neighbours

Use Node 26.12.0 and Python 3.12 or newer. The welcome screen appears before runtime downloads. Choosing Enter town downloads about 13 MB of self-hosted Python assets on a first visit and starts the town paused. New towns, imports and restored saves also start paused. Story stops are enabled by default; they pause actual forward playback when a new story appears. It runs the actual custom Concordia engine and 208 persistent HF persons. It needs no model key. Python failure is visible; no recording or alternate engine silently replaces it.

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
node scripts/profile-town.ts --days 30 --population 208 --seed 42 --max-deaths 0
PYTHON=../.venv/bin/python npm run test:parity
cd ..
PYTHONPATH=. NEIGHBOURS_NATIVE_TEST=1 NODE=node .venv/bin/python -m unittest concordia.environment.engine_test concordia.contrib.neighbours.engine_test concordia.contrib.neighbours.bridge_test
```

The strict typecheck includes application code, browser tests and the native/experiment TypeScript scripts. The parity check runs actual native CPython and WASM Python over the same 208-person state, compares complete checkpoints, restores a continuation, recovers an interrupted engine, and verifies that a rejected import leaves subsequent progress usable. The long-run profile reports population health, finite food stock, checkpoint size and elapsed time every five days, checks host invariants, and verifies exact restored continuation. Change its seed to sample a different town; these measurements do not establish human realism. Unit controls also cover physical conservation, legal choices, acquired-method removal and malformed checkpoint fields. Runtime diagnostics report violations separately from valid delayed outcomes.

The browser suite builds production assets and opens an isolated Chromium profile. It runs actual Python WASM and HF, downloads and imports packets through the UI, checks save ownership and exact paused restoration on reload, recovers the previous seed, rejects a bad import without losing progress, and checks mobile layout and keyboard controls. It uses only isolated test profiles, including their device-save storage. It does not inspect a user's browser profile. Failed runs retain traces and screenshots under ignored test-output directories. CI installs Chromium's Linux dependencies and uses one test worker, following [Playwright's CI guidance](https://playwright.dev/docs/ci).

For a native artifact:

```sh
python neighbours/scripts/run-town.py --seed 42 --population 208 --rounds 288 --output /tmp/town.json
```


Current increment: [town agency and Concordia GM](gm-and-town-agency.md). Lint, application/script/browser typechecks, 281 unit tests across 42 files, all 17 actual-WASM browser tests, production build and 29 native controls pass. Exact native/WASM continuation covers both weekly eight-person checkpoints, five 208-person episode milestones, the genuine GM checkpoint and the private owner-supplied checkpoint. Both contextual seven-day comparisons and cancellation preserve the live town. Four current-source, 208-person 25-day profiles retain 20 verified milestone hashes and pass restored continuation. Fresh native GM and mixed-controller response tapes replay exactly with zero model calls. Public deployment and hosted CI remain pending. The private checkpoint is not a public fixture or a compatibility promise. Earlier delivery evidence remains in [the prior increment](player-agency.md).

The current candidate adds compact sticky controls, truthful dated invitation and cart status, and action guards that reflect actual host eligibility. History keeps separate dated outcomes. The annex assistance situation is available after the main hall opens. A selected neighbour must receive the request, travel, observe the instantiated timber conditions and finish an actual HF inspection decision. Only a completed safe opening adds four places. One authored or recorded GM proposal is admitted per town. Applying its premise does not establish a successful inspection or shared resident knowledge.

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

The town is saved in IndexedDB on the current device. A shared revision transaction prevents another tab from silently overwriting a newer checkpoint; a stale tab pauses and offers to load the device town. Closing a session aborts its queued/in-flight writes. Existing clients opened before this protocol cannot be retroactively protected. A returning visitor restores that checkpoint before the town appears and starts paused. The footer reports the time of the committed device save. Export downloads complete runtime JSON compressed losslessly as `.json.gz`. Import accepts both gzip and older plain `.json` files. Compressed input and expanded JSON each have a 50 MiB limit. IndexedDB keeps its existing uncompressed representation. Export request ownership prevents late compression from publishing a superseded download. Imports validate host state; they are user-supplied game data, not authenticated evidence of an unmodified historical run. Keep recorded experiment provenance separate from imported towns.

Production uses `cloudflare.config.ts` and the official cf CLI. Run `npm run build:cloudflare`, inspect `cf deploy --prebuilt --dry-run --mode production`, then deploy with an authorized Cloudflare credential. No credential belongs in source or browser assets. `/release.json` identifies the commit, dirty flag, exact HF version and Python bundle digest. `/third-party-notices.txt` contains the distributed licenses.

Use `bd ready`, `bd show nbh-01z` and `bd list` for remaining work. The local project store is authoritative. Sync its Dolt remote independently of ordinary Git pushes.
