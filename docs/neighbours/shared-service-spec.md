# Shared town and public LLM service proposal — 2026-10-28

Status: specification for `nbh-01z.19`, not an implemented or authorized service.
Owner guardrail and public budget review target: **2026-11-03**. Neighbours
engineering owns the specification; Adam owns the infrastructure exception and
spending limit. The current public game remains per-device Browser live.

## Authority and proposed architecture

The current Human Framework `AGENTS.md`, **Framework and games**, says:
**“No server infrastructure unless the owner lifts it. Lifted for lab telemetry
only (owner, 2026-10-19, 2026-10-22): Worker plus R2, default-on recording with an
off switch, 180-day retention, character analysis by separate opt-in.”**
That exception does not authorize a shared game host, inference proxy or paid
public model calls. No actual public dollar/usage limit has been supplied.
Existing allowance language and authenticated native CLI experiments supply no
public spending authority. These are two separate unmet gates.

Engineering proposal after those gates: a request gateway and one serialized,
long-lived native Python Concordia engine with its persistent Node/HF bridge per
shared town. Use transactional checkpoint/input/tape persistence and a fenced
single writer; spectators receive public projections. This reuses the actual
native execution boundary and avoids inventing a second simulation. A background
host advances only a documented simulated-round schedule; restart does not turn
wall-clock absence into unlogged simulation progress. Provider and hosting vendor,
durable-store implementation and operational capacity remain unselected. This is
a local architecture proposal, not a claim any current deployment supports it.

Host code owns feasible actions, resources, time, outcomes and validation. HF
owns HF-controller perceptions, acquired state and choices. An explicitly
LLM-controlled visitor uses the existing bounded feasible-choice adapter and an
external choice record. Generated text cannot establish consent, learning,
attendance, payment, repairs or physical facts. Current six-person cast and
published HF3.0.0/engine2.23.0 stay authoritative. Historical eight-person native
fixtures are evidence, not a fresh canonical cast or a public shared town.

## Labels that must appear at the point of use and in exports

| Label | Meaning |
| --- | --- |
| **Browser live** | Python/Pyodide and released HF execute on this device. No shared always-running town or live model call. Python failure stays visible. |
| **Native Recorded** | Exact saved native responses replay against their original source/runtime identity with zero model calls. Show recording time and model identity as recorded, never as current execution. |
| **Native actual LLM** | An actual native provider response was obtained for this run. Name resolved provider/model, source/runtime, call time, outcome and metered usage. “Requested” or “pending” is not a response. |
| **Shared service live — proposed, unavailable** | Future server-owned town, only after acceptance below. Show authoritative revision, last committed simulated time, connection state and controller per actor. A disconnected view is a dated snapshot. |

Never silently substitute a recording, HF policy, different provider or runtime
under a live LLM label. Rejection, timeout, loading and unknown states remain
visible. A declined call leaves the last committed state intact; the configured
shared-town policy must explicitly pause or continue non-model actors, with that
choice recorded. The initial proposal pauses the pending round to preserve one
causal order. Any later partial-round policy requires its own design and replay.

## Budgets and abuse controls

These are proposed control dimensions, not authorized values. Until every
required value and the infrastructure exception is explicit, effective authority
is **zero requests, zero tokens, zero currency and no service startup**.

| Limit | Required value before enabling |
| --- | --- |
| Per request: input tokens, output tokens, total currency, response bytes and deadline | **OWNER_REQUIRED**; effective 0. Engineering must propose concrete caps against the selected model and actual prompt sizes for owner review. |
| Per principal per UTC day: requests, tokens and currency | **OWNER_REQUIRED**; effective 0. Anonymous visitors also require an enforceable allocation, never an unlimited default. |
| Global per UTC day: tokens and currency | **OWNER_REQUIRED**; effective 0. Shared across all towns, principals and instances. |
| Global lifetime/campaign currency ceiling and expiry | **OWNER_REQUIRED**; effective 0. Exhaustion or expiry disables admission until explicitly renewed. |

Proposed initial non-spending ceilings for that review: one in-flight request
per principal, one per town, at most two globally; a burst of two and at most
six admission attempts per principal per minute; no automatic retries, provider
failover or autonomous replenishment. They remain proposals and cannot enable
calls without the owner-required budgets. Add gateway body/queue bounds and
authentication or a bounded anonymous capability. Apply network-origin limits
as a secondary control, not an identity guarantee. Refuse duplicate request IDs,
stale revisions, invalid actions and overlong input before reserving spend.

Reserve the worst-case input/output currency and tokens atomically against every
applicable quota before a provider request. Prices, currency, model version and
maximum-output enforcement must be verified for the selected provider. Missing
prices, unknown quota state, a failed quota store or an unenforceable provider
cap fail closed. A timeout keeps its reservation until actual usage is reconciled;
uncertain billing cannot release money for another call. Reject responses beyond
byte/schema/feasible-action bounds. Record rejection and usage without committing
an invented action. Expose remaining global authority and an operator kill switch.

## Restore, replay, provenance and ownership

Use the current complete native packet and codec; compact/gzip files remain
lossless encodings, not alternate authority. Pin source commit/tree, HF/engine,
Python/Node/Pyodide where applicable, upstream identity, policy sources, seed,
input order, checkpoint digest and exact response tape. A model receipt binds
the pre-choice state hash, offered actions and exact response to its request ID.
Replay reads responses and makes zero provider calls. Source mismatch refuses;
do not rewrite sourceDigest, weaken a gate or regenerate evidence to hide it.

Commit input, admitted response, checkpoint and revision atomically. Fence a
retired process from writing after replacement. A detached restore must validate
before adoption; crash recovery resumes the last complete committed revision and
does not resubmit a possibly billed request. Exports describe service source and
revision, not authenticated human play. Consistency checks alone do not prove
account ownership. Browser device saves, named copies, file sessions and shared
town authority remain distinct. Importing an arbitrary browser save cannot claim
a shared town, shelf head or cast ownership; such migration is outside this spec.

## Cost, secrets and privacy

Operators own hosting/provider bills, quota reconciliation, incidents and shutdown.
Keep secrets server-side in the selected platform's secret facility; no browser
keys, CLI login profile reuse, credentials in logs or model access to tools.
Send only the minimum fictional public observation and feasible choices needed
by the labelled actor; hidden Person state, owner saves, private correspondence,
account identifiers and unrelated telemetry are excluded. Prompt injection grants
no tools, new action type, facts or budget authority. Provider output is untrusted.

Before public hosting, name the operator and data controller, define public-town
visibility, request/tape retention, access/deletion policy and provider data terms.
Values are **OWNER_REQUIRED**, not inherited from lab telemetry's 180 days.
Keep a replayable public-fiction tape separate from billing/security records;
exclude secrets and personal identifiers from public exports. No data collection,
retention change or existing telemetry change occurs through this specification.

## Acceptance and delivery gates

1. Adam explicitly lifts the game-service infrastructure guardrail and approves
   numeric budgets, expiry, operator, provider and privacy/retention boundaries.
   Record both decisions; absent either, retain unavailable/zero-authority status.
2. Implement only an agreed bounded unit. Test quota races across instances,
   exhaustion, duplicate/timeouts, unknown billing, invalid responses, operator
   shutdown and stale-writer refusal with local deterministic adapters first.
3. Prove native restore and zero-call replay with literal source identity. Prove
   crash/restart and source-mismatch refusal without duplicated spend or mutation.
   A separately authorized bounded real call then proves actual inference and
   measured cost; an adapter test or CLI transcript alone is not public delivery.
4. Obtain the required independent review, signed source, exact green CI,
   integrated source and clean deployment receipts. Verify public runtime labels,
   authority/health and actual shared revisions across independent clients.
   Record costs and limitations. A spec, running process or deployment ID alone
   does not establish an always-running shared town or genuine public LLM visit.

Local contract basis: [architecture and current cast](DESIGN.md),
[runtime and save boundaries](RUNNING.md), [GM contract](gm-director.md),
`neighbours/src/runtime-client.ts`, `neighbours/src/ui/useVisitorSession.ts`,
`neighbours/scripts/run-mixed-town.py` and its exact replay/source checks.
No new external technical assertion or vendor capability is required by this
proposal. Broader `.37`/`.10` learning, original `.53` cause and Adam's feel remain
separate; this specification closes none of those acceptance gates.
