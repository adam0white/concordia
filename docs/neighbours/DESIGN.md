# Neighbours: Alder Quay

Owner selected Concordia and authorized an ambitious autonomous public fork, deployment, ongoing HF development, six canonical people,200 background residents, observability and a watchable simulation. Technical delivery is the milestone set below; Adam accepts feel by watching/playing later.

Alder Quay is a riverside town reopening its flood-damaged community hall. It used to hold evening classes and shared meals. The storm displaced those activities into the market, clinic and neighbours' homes. Different people promised help, lost things, or quietly kept ordinary life going. Reopening matters, but food, family, rest and existing promises also matter. There is no single town happiness score to optimize. Flood-disrupted businesses offer at most two paid one-hour shifts per resident each day, within 08:00–18:00 including travel. Wages stay fixed; an unlimited paid-work action must not crowd out all ordinary life. Sleep, social contact and teaching report what actually occurred, rather than copying promised benefits into outcomes.

The map is the default view. Six canonical people have distinct ordinary lives, relationships and commitments. Two hundred persistent background people create actual demand and occupy shared resources. Their controller and fidelity must be labelled honestly. Actions have duration, destination and physical costs. People may refuse a suggestion. Events and story detectors expose actual causal chains and anomalies rather than scripted success or LLM-authored facts.

Historical eight-person towns include competing supper and class evenings proposed by Sam and Lea after the hall opens. Notices must be received, acceptance creates an appointment, and actual preparation reserves the one room. Awake physical overlap determines delivery. Their next small conflict concerns Jo's handcart: Ravi can use a slow side bench or ask Ada to give up a four-hour window at the paid carpentry bench. A returned cart changes Jo's later supply trips. Neither project forces cooperation or success. These retained episodes and controls do not describe a new scene in the six-person canonical town. See [the social episode](evenings.md).

These episodes also exercise the existing HF activity-review contract. The host offers a new decision at `reviewAt`, preserves continued physical jobs, and reconciles real reservations when plans change. It waits for arrival before optional replanning during a journey. A due review is not an instruction to cancel the current activity.

## Architecture decision

Fork upstream at 6fbfbc58 after reviewing public forks; borrow specific ideas later. None of the sampled forks supplies a verified general dashboard and deterministic runtime worth inheriting its older base.

Use a small custom deterministic Concordia `Engine` with real upstream Entity/ActionSpec contracts. A persistent TypeScript runtime owns the physical world and published HF people. Native Python uses a long-lived Node JSON-lines bridge. Public browser mode runs that same Python engine in a module Web Worker through Pyodide, calling the same TypeScript runtime in-process. This is a deliberate alternative to a permanently hosted Python backend: the public simulation is live in the visitor's browser, not a shared always-running server town. It must be labelled Browser live. No static recording is substituted if Python fails. The browser and native paths must pass matched continuation tests.

The custom engine exists to batch a town round without the stock sequential engine's all-to-all observation broadcast or Python threads. It retains Concordia's entity, observation, choice validation, resolution and checkpoint boundaries. Upstream core modules remain unchanged. World outcomes are deterministic. No generic HF expansion is selected until a real failing case demonstrates the need.

Renderer is a 2D town map with genuine activity/movement projections. The optional inspector has person evidence, decision alternatives, resources, event ancestry, anomaly list and performance. A few concrete interventions change circumstances and consume real allowance. Comparison controls include simple policies and acquired-state ablations, not just a weak LLM prompt. Mixed LLM neighbours require a genuine model response and explicit policy labels; never silently substitute HF and call it LLM.

## Current cast contract

The public canonical edition contains Nora28, Sam18, Derya44, Rafi19, Bilal41 and Ece24, with200 generated residents. Published HF3.0.0/engine2.23.0 owns their decisions. Fresh towns persist plain-English narration; saved narration choices are retained. Retired Lea/Musa arcs and historical eight-person fixtures do not enter fresh public towns. Complete admitted people, exact published transfer inputs and claims are pinned for deterministic restore. Finite native maps support Hearsay6 Derya/Ece and SmallWorks2 Nora/Sam/Rafi. Only the reviewed Pass453be903 Rafi checkpoint at minute1390 can enter through this adapter. Its source envelope, raw receipt and portable projection are pinned; his personal jar abstention remains. Native Neighbours continuation requires the original Pass envelope plus an incoming raw town-person witness whose digest and published HF calendar projection match the checkpoint. Ambiguous receiving wrappers refuse. These checks bind supplied data, not authenticated play or browser ownership; other Pass13 snapshots and producers are unsupported. Its source-only skim token grants no town action or jar; kitchen skills grant no town qualification. Unsupported work/care obligations and unresolved Pass debt refuse admission. This is a receiving map, not a claim of travel, shelf ownership or a return journey. Local receipt ownership, file origin and terminal branch closure remain separate from simulation state. Recording and automatic cross-game linkage follow the single menu switch under the owner direction of 2026-10-23; no separate continuing-person recording consent applies. Personal disclosures are optional actual conversations, not automatic biographical knowledge or larger accomplished outcomes.

## Milestones and acceptance

M0 initial run: unchanged upstream tests and an unchanged package probe run; proper GitHub fork verified; public fork survey recorded.

M1 minimum integration: one HF person through the real Python engine; legal choice and actual outcome; bridge error fails visibly; exact export/restore continuation. A deliberate broken implementation must fail a meaningful control.

M2 first town: eight known people with interlocking activities, physical resources, competing obligations and received observations. Local map, play/pause/step, selection and one meaningful intervention work.

M3 full integration: 200 additional persistent background people affect shared resources; actual Python browser engine, native parity, bounded memory and measured throughput; strict import validation; public deployment with provenance.

M4 red-green controls and diagnostics: conservation, time, no double reservation, legal offers, rejected malformed imports without partial mutation, save/replay equality, relevant evidence ablation, matched intervention branches and bridge failure. Detectors separate interesting valid outcomes from rule violations.

M5 enrichment and reviewed polish: watchable three-day episode, backstory expressed through ordinary consequences, independent source-unread visitor, wildcard and critical review corrections, mobile/keyboard checks. Sweep code quality and dependencies. Retain stretch ideas in beads rather than losing or silently discarding them.

M6 stretch after stable delivery: labelled LLM visitors and matched policy runs, richer negotiation, generic HF fixes with release controls, multi-day social change and additional town situations. Do not defer a discovered correctness defect into stretch.

Beads epic nbh-01z owns status and dependencies. This design states acceptance; it is not a second task checklist.

The earlier F-214 recorded-study provenance deferral (`nbh-01z.43`) was resolved on **2026-10-20** by genuinely regenerating five deterministic studies and three native model studies. Source and exact replay gates remain unchanged. Historical assistance remains byte-pinned. See [the regeneration record](ci-provenance-regeneration-2026-10-20.md).

## Clock and help presentation (2026-10-22)

The live town chooses its pace. One unchanged fifteen-minute round runs at a time: briskly in quiet stretches and more slowly during the player's travel or work. A new story or received player notice gets eight seconds of reading time. An explicitly opened conversation holds time; merely selecting a person does not. Opening Game menu first blocks new rounds and drains already submitted commands. The menu appears only after their terminal acknowledgement and checkpoint writes. Closing it restores any remaining reading time. Pending menu replacements also block further actions and exports until acknowledged.

Gameplay has no Play or Step. Automatic pacing is the default; Automatic / Slow / Steady / Fast are available only in the game menu. Skip ⏩ runs actual rounds and stops on the next relevant event. The approved [UI grammar delivery](ui-grammar-2026-10-22.md) replaces the earlier clock layout. Existing comparison and recorded-study controls remain diagnostics. Their protocols and historical saves are unchanged, as are Python, host rules, HF 2.8.0 and scenario versions. One native welcome information popover retains both former helper explanations. Historical playback-control UI tests were replaced by automatic-clock, reading, conversation and menu-drain checks; advance unit/native/worker-order controls remain.

## Deferred

- **Mill Bridge presentation rename (2026-10-26)**: Remaining: parent independent review, integration, delivery and Adam’s feel acceptance. Presentation copy names the existing town Mill Bridge. The exact authored player introduction is mapped at display through `ui/plain-english.ts`; its one raw literal in `core/player.ts` remains unchanged for native signatures, saved logs and exact legacy replay. Internal IDs, file format, Worker target and historical provenance are unchanged. No browser or all-screen verification is claimed. `nbh-01z.53` remains open: the interrupted-tab actual cause is unknown. Review target: 2026-10-27.


- **Cold first-help timing and feel acceptance**, target **2026-11-03**, `nbh-01z.40`: Round 4 exposes an existing paid shift in a reachable resident’s conversation. Choosing it starts a real covered hour and pays the resident two coins; only completed work reported to published HF receives person-worded credit. It is a host opportunity, not invented resident dialogue or an inspection bargain. A new opt-in input and optional direct-pledge marker leave old inputs and exports unchanged. A source-unread visitor completed Ada’s hour at 142 seconds, including three 30-second automation locator timeouts. This establishes independent completion, not a strict two-minute result. The driver’s timing/taste retest and Adam’s broader feel acceptance remain.

- **Enlarged-text feel acceptance**, target **2026-11-03**, `nbh-01z.45`: the source reflows the top bar, bounds the scrolling resident list and allows the page to scroll when a short viewport cannot fit every zone. The action area scrolls before it can consume the reading sheet. Builder controls double actual computed text, including fixed-pixel text, and check Journal's existing sticky heading and close control after scrolling. Technical checks cover 360×690, 1280×800 and a short 320px view; they do not establish Adam's reading comfort.
- **Pass Rafi receiving delivery**, target **2026-10-29**, GDI-705: the actual signed Pass453be903 source supplies a finite receiving map and full-source/negative/continuation controls. The old candidate is not substituted. Delivery still needs independent review and fresh current-source studies; retain historical source stamps exactly. The receiving map does not establish a human receiving journey or a return route.
