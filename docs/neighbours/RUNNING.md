# Run and debug Neighbours

Use Node 26 and Python 3.12 or newer. The browser runtime downloads about 13 MB of self-hosted Python assets on its first visit. It runs the actual custom Concordia engine and 208 persistent HF persons. It needs no model key. Python failure is visible; no recording or alternate engine silently replaces it.

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
node scripts/profile-town.ts --days 30 --population 208 --seed 42 --max-deaths 0
PYTHON=../.venv/bin/python npm run test:parity
cd ..
PYTHONPATH=. NEIGHBOURS_NATIVE_TEST=1 NODE=node .venv/bin/python -m unittest concordia.environment.engine_test concordia.contrib.neighbours.engine_test concordia.contrib.neighbours.bridge_test
```

The parity check runs actual native CPython and WASM Python over the same 208-person state, compares complete checkpoints, restores a continuation, recovers an interrupted engine, and verifies that a rejected import leaves subsequent progress usable. The long-run profile reports population health, finite food stock, checkpoint size and elapsed time every five days, checks host invariants, and verifies exact restored continuation. Change its seed to sample a different town; these measurements do not establish human realism. Unit controls also cover physical conservation, legal choices, acquired-method removal and malformed checkpoint fields. Runtime diagnostics report violations separately from valid delayed outcomes.

For a native artifact:

```sh
python neighbours/scripts/run-town.py --seed 42 --population 208 --rounds 288 --output /tmp/town.json
```


The live browser uses HF choices for every resident. The recorded Inspector comparison contains real limited native Claude calls and explicitly reports its limits. It does not establish broad superiority. The native mixed-town adapter labels external choices, validates only feasible actions and saves the exact response tape. Replaying it must not call a model. See the experiment scripts and their `--help` before opting into fresh authenticated model calls.

The town is saved in IndexedDB on the current device. Export a file to keep an independent copy. Imports are size-limited and validate host state; they are user-supplied game data, not authenticated evidence of an unmodified historical run. Keep recorded experiment provenance separate from imported towns.

Production uses `cloudflare.config.ts` and the official cf CLI. Run `npm run build:cloudflare`, inspect `cf deploy --prebuilt --dry-run --mode production`, then deploy with an authorized Cloudflare credential. No credential belongs in source or browser assets. `/release.json` identifies the commit, dirty flag, exact HF version and Python bundle digest. `/third-party-notices.txt` contains the distributed licenses.

Use `bd ready`, `bd show nbh-01z` and `bd list` for remaining work. The local project store is authoritative. Sync its Dolt remote independently of ordinary Git pushes.
