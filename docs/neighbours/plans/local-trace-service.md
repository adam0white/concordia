# Local interruption trace and service specification — 2026-10-28

Goal: preserve the next observable UI interruption chronology and specify `.19`
without implementing a service. The supplied brief authorizes inline execution;
the director receives one frozen candidate before commit and supplies one review.

Existing coverage: `TownInspector.tsx` reports host diagnostics, health, resources
and runtime metrics. `EvidencePanel.tsx` labels recorded studies and release data.
`useVisitorSession.ts` owns the public command FIFO and menu drain;
`durable-replies.ts` waits for checkpoint persistence before delivering a state.
`TownMap.tsx` uses published phoneStage observeOnly/history:false. Existing
menu/worker, resize, file retirement and evening-reading controls remain intact.
None retains page lifecycle plus command/menu chronology across an interruption.

- [x] Add a fixed 128-entry UI-only memory ring. Narrow every field; retain no
  packets, text, people, URLs, storage data or model inputs. Commands keep local
  sequence/time tokens; retired producers cannot append or acknowledge a new
  session. Ring overflow drops oldest entries and reports how many were lost.
- [x] Observe session dispatch, terminal FIFO acceptance/refusal, reply arrival,
  menu request/open/close and visibility/pagehide/pageshow/resize. Read numeric
  map/frame/viewBox and viewport dimensions at lifecycle/menu events. No timers,
  game choices, worker protocol or persistence changes. Page events only record.
- [x] Offer explicit read/refresh and a local download in the existing collapsed
  Debug item, including before a town loads. Label elapsed UI-observation time,
  lifecycle generation, loaded module path and unknown build commit honestly.
- [x] Exercise the ring and retirement boundary, then real public asynchronous
  menu/worker flow with a held reply and exact assertions at both App sizes.
  This is a diagnostic control, not a fourth original-cause investigation or a
  player retest. No screenshots or actual cached-navigation rerun.
- [x] Write one `.19` proposal from current local contracts: runtime labels,
  explicitly unapproved numeric limits, fail-closed authority, abuse/concurrency,
  host/HF/model boundaries, provenance/restore/replay, privacy and delivery gates.
- [x] Reconcile only current Deferred/handoff statements against final parent
  receipts. Preserve historical notes; no beads or central-ledger edits.
- [x] Run normal serialized unmodified lane, current evidence gate and exact
  zero-call mixed replay. Bind unchanged native8/full continuation proof to
  literal protected source identity. Freeze full source/patch/proof, verify all
  bytes and modes, remove own helper, retain unmerged ref and return for review.

Limits: a missing ack identifies an observed boundary, not the worker's internal
cause. UI timing includes queuing/persistence and instrumentation overhead. Map
dimensions describe DOM layout, not painted pixels. Missing original events,
background scheduling, pruned entries and events after tab destruction remain
unknown. This trace cannot prove a defect, repair `.53`, accept player feel or
deliver `.19`. No new server, spend, provider, storage or telemetry authority.
