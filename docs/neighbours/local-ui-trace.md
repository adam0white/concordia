# Local UI interruption observations — 2026-10-28

This is diagnostic instrumentation for `nbh-01z.53`, not a defect fix or issue
acceptance. The literal phoneStage adoption was delivered at `7fa0cdd`; its
observeOnly/history:false usage, crop, controls and physics remain unchanged.

## Existing coverage and the missing input

`TownInspector.tsx` already exposes health, resources, host diagnostics and
runtime metrics. `EvidencePanel.tsx` labels recorded sources and build metadata.
`useVisitorSession.ts` already owns the command FIFO, stale-generation refusal,
pending-work menu hold and checkpoint barriers. `durable-replies.ts` holds state
delivery behind an applicable persistence promise. `TownMap.tsx` already measures
the current frame through published phoneStage. Existing browser controls cover
worker/menu ordering, resize, file retirement and asynchronous reading refusal.
None previously retained a page-event/command/menu chronology for a later read.

The original stage QA observed a resumed task tab after a provider interruption,
an unattended town at day13, partial/full-SVG and stuck-menu symptoms, and recovery
after reloading the task tab. The original report does not establish the cause.
Missing input: the original pre-interruption and resumed event order; visibility,
pagehide/pageshow and persisted flags; pending command types and terminal reply
times; checkpoint wait status; and frame/SVG/viewBox dimensions before the symptom
and before reload. Later successful dimensions do not reconstruct those facts.

Three final parent receipts dated 2026-10-28 record separate bounded negative
controls: held step replies drain correctly (first navigation persisted:false,
so no BFCache proof); actual persisted:true cached restore recovers the App; a
held real step across actual cached restore drains after release, matched to a
no-navigation control. All leave the original cause unknown. They justify no
speculative bug fix. Their immutable archives contain 7/15/9 fully read members.
This change does not rerun those three investigations.

## What is recorded

The session owns one 128-entry ring. It retains fixed scalar fields only: local
sequence/session, elapsed UI milliseconds, dispatched state-changing command
type/ID, reply arrival type, FIFO terminal acknowledgement/result/duration and
pending FIFO count plus the existing worker/advance/comparison drain predicates. Menu request/open/close and visibilitychange/pagehide/pageshow/
resize include viewport and map frame/SVG/viewBox dimensions where present.
`persisted` is recorded only from a PageTransitionEvent. A missing dimension is
unavailable, not zero or a successful layout. Session replacement invalidates
old producers; dropped entries are counted. No polling or new game timer exists.

Open **Game menu → Debug → Read local UI trace** to take a snapshot with elapsed timestamps. The same single collapsed Debug item supplies a local JSON download.
Read again to refresh it. Reading creates no worker request, native packet,
device save, telemetry upload, policy change or model call. The blob URL is
revoked on replacement/unmount. The ring disappears with this page/hook; the
displayed snapshot remains unchanged until an explicit refresh. Session IDs are
local observation generations, not town ownership or source identities.

The module path identifies the loaded UI asset only. Build commit is explicitly
unknown in this observation; the existing separately labelled release metadata
has its own authority. The trace schema is `neighbours/local-ui-trace@1`.
Elapsed performance.now time includes UI queue/persistence wait, suspension and
observation overhead. It does not measure Python execution alone or simulated
time. “Ack” means the existing terminal FIFO consumer ran, after any ordered
persistence barrier; it is not a provider receipt or proof of every save commit.
Bootstrap/detached runtime work and non-state commands have no paired command
duration here. Reply arrival labels cover only the current session's public
receive boundary, not every internal Worker exchange. Host errors remain visible
through the existing error path; progress is not reclassified as success.

## Proof and limits

Focused controls exercise a gated old callback after replacement, bounded ring
overflow and detached snapshots. Real production App controls at360×690 and
1280×800 hold an actual Python/WASM step reply, request the ordinary menu, assert
it remains closed, release the reply and assert arrival→ack→menu-open ordering
and measured duration. They read and download the public trace without posting
another worker command. Synthetic lifecycle dispatch verifies listener capture;
it does not establish navigation or BFCache behavior. No screenshot or player
retest is part of these controls.

A future retained request without an ack locates an observed boundary. It cannot
explain worker internals, browser scheduling or an unrecorded earlier failure.
DOM metrics describe layout, not painted pixels. If the menu never drains, this
menu-based read is unavailable until recovery; reloading loses the ring. Overflow,
tab destruction and crashes may lose decisive evidence. No complete overnight
history, original cause, repair, player feel or whole-game acceptance is claimed.

Current native/full/compact save and replay/source authority remain literal.
The unchanged eight-round native/WASM and complete packet/Persons/RNG proofs are
reused only against matching source identities. The current evidence gate and
exact recorded mixed replay run separately; model generation stays prohibited.
