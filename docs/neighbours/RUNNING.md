# Run and debug Neighbours

Use Node 26.12.0 and Python 3.12 or newer. The browser runtime downloads about 13 MB of self-hosted Python assets on its first visit. It runs the actual custom Concordia engine and 208 persistent HF persons. It needs no model key. Python failure is visible; no recording or alternate engine silently replaces it.

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


The reviewed player-agency candidate passes 255 unit tests and 14 actual-WASM browser tests, with lint, application/script/E2E typechecks and production build checks. Eighteen native Python controls pass. Current native/WASM controls include both contextual seven-day comparisons and cancellation that preserve the complete live Python checkpoint, including continuation from the prior-release 60-day checkpoint. A real 110-day town restores and continues exactly for another day after HF prunes old closed promises. Malformed recent promises and forged support receipts still reject. These are local verification results; public delivery remains pending. See [the increment evidence](player-agency.md).

After the hall opens, recurring weekly class/supper pairs share one room. The programme contains twelve weekly cycles. Each cycle supplies one support choice, shared between funding an unposted alternate date and advertising a posted invitation. This works even if all three original interventions have been spent. A second valid choice can use the original allowance. Bus and tools use only the original allowance. Credits expire with their cycle and reload does not refill them. The selected evening's comparison covers seven simulated days, reports progress every eight rounds and offers cooperative cancellation. Comparison spends allowance only inside its hypothetical branch.

Person History shows consequential outcomes first and folds routine action traces. Separate scheduled occurrences retain their IDs and dates. Missing older detail is labelled without claiming that a retained outcome disappeared. Estuary and housing presentation preserve saved coordinates and travel times. The Inspector exposes recorded report provenance and limits separately from live diagnostics.

The live browser uses HF choices for every resident. The recorded Inspector comparison contains real limited native Claude calls and explicitly reports its limits. It does not establish broad superiority. The native mixed-town adapter labels external choices, validates only feasible actions and saves the exact response tape. Replaying it must not call a model. See the experiment scripts and their `--help` before opting into fresh authenticated model calls.

The town is saved in IndexedDB on the current device. A shared revision transaction prevents another tab from silently overwriting a newer checkpoint; a stale tab pauses and offers to load the device town. Closing a session aborts its queued/in-flight writes. Existing clients opened before this protocol cannot be retroactively protected. A returning visitor restores that checkpoint before the town appears and starts paused. The footer reports the time of the committed device save. Export downloads complete runtime JSON compressed losslessly as `.json.gz`. Import accepts both gzip and older plain `.json` files. Compressed input and expanded JSON each have a 50 MiB limit. IndexedDB keeps its existing uncompressed representation. Export request ownership prevents late compression from publishing a superseded download. Imports validate host state; they are user-supplied game data, not authenticated evidence of an unmodified historical run. Keep recorded experiment provenance separate from imported towns.

Production uses `cloudflare.config.ts` and the official cf CLI. Run `npm run build:cloudflare`, inspect `cf deploy --prebuilt --dry-run --mode production`, then deploy with an authorized Cloudflare credential. No credential belongs in source or browser assets. `/release.json` identifies the commit, dirty flag, exact HF version and Python bundle digest. `/third-party-notices.txt` contains the distributed licenses.

Use `bd ready`, `bd show nbh-01z` and `bd list` for remaining work. The local project store is authoritative. Sync its Dolt remote independently of ordinary Git pushes.
