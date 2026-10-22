# Approved game layout, 22 October 2026

Adam accepts feel separately. This document records implementation and validation. Hosted CI, the external build report and the live release manifest establish publication. The first UI implementation is signed in `7839c5f`.

The owner approved the lab sweep: “All good decisions, proceed.” and “Good direction, proceed please, menu is fine. Just \"until something happens\" is too long, maybe Skip or Fast Forward or something else could be better.” The approved Neighbours spec and grammar addenda replace the earlier clock presentation.

The phone uses a 44px top bar, 36px state strip, map, reading sheet and pinned action bar. The map is 330px when nothing is selected and 120px around a selected person or place. Conversation hides the phone map. Desktop keeps an 840px map beside a 440px column at 1280x800. Only the reading sheet scrolls. The Hall and eight familiar people occupy two rows without sideways scrolling. The spec calls these ten chips, but the actual roster is nine; no person was invented.

The current runtime goal supplies the next-step title and hint. Repairs, town credits and weekly availability are drawn in the state strip. A selected person's primary walks to them or opens a conversation when they are present and awake. Conversation uses request chips and Offer an hour / Ask / Urge choices. The four request chip rows come before folded covered-work and own-work rows, so Done by stays visible in the first phone view. It submits the existing command shapes. Replies, promises and actual completed-hour receipts remain available after work or departure.

Time is automatic by default. Automatic, Slow, Steady and Fast live only in the menu. Inspecting slows the timer; talking, information, studies and the menu hold it. New stories receive eight seconds. Skip checks each actual completed round for stories, walk/work completion, familiar arrivals, notices, hall opportunities and the next morning, with the existing seven-day cap. It never computes a different round or invents an outcome.

The title owns previous/autosave recovery, import and seeds. New-town confirmation is inline. The menu owns journal, theme, pace, studies, Send word, phone fullscreen, title return, games and recording preference. Send word has optional verdict, note and a remembered name. Recording opt-out disables sending; privacy signals require explicit consent for an unlinked run. Linked feedback queues a note. A queue reference is not a delivery receipt. The local copy stays the existing gzip save.

Exact local tarballs pin lab-client 0.2.1 and lab-kit 0.3.1. HF remains published 2.8.0. No host, Python, contracts, simulation, save schema or recorded native tape changed.

## Review and validation

An independent Codex reviewer, including a wildcard lens, found three issues: Escape left a comparison running, the story hold lacked strip text, and information lacked outside-tap closure. All were fixed. The playtest regression also caught completed-hour records disappearing after work; the person sheet now preserves those records. Closing a sheet preserves newer keyboard focus, native-menu Escape preserves the reading screen, and rejected local files do not leave the automatic clock stopped.

`VITEST_MAX_WORKERS=1 npm run check:lane` passed lint, three typechecks, 517 unit tests, 42 plain-Node imports and production build. The first parallel run hit three existing simulation timeouts during other workers' suites and an obsolete chip attribute assertion; the assertion now checks `aria-pressed`. No timeout, replay assertion or legacy continuation was removed. Native engine/bridge controls passed 37/37. Mixed-town, GM and bench tapes replayed exactly with zero model calls.

Five deterministic studies were genuinely regenerated because the required lab package pins changed the lockfile. The commands were unchanged:

```sh
node scripts/profile-evenings.ts --seeds 42,73,9,101 --population 208 --days 25 --output public/experiments/social-episodes.json --checkpoint-directory /tmp/neighbours-ui-regeneration-20261022/social
node scripts/probe-cart-choices.ts /tmp/neighbours-ui-regeneration-20261022/social/seed-42-first-prepared.json public/experiments/cart-choice-probe.json
node scripts/probe-hf-config.ts --output public/experiments/hf-config.json
node scripts/probe-received-routes.ts public/experiments/received-routes.json
node scripts/probe-bench-choice.ts --output public/experiments/bench-choices.json --summary-output public/experiments/bench-choices-summary.json --checkpoint-directory /tmp/neighbours-ui-regeneration-20261022/bench-final
node scripts/check-evidence.mjs
```

The first bench attempt correctly rejected a changed commit during its run. The final attempt ran at signed `7839c5f` and passed. All source hashes and the compact bench summary validate. The historical assistance report remains byte-pinned. All four 208-person, 25-day towns retain exact restored continuation. The negative bench result remains: all cases still choose the side-bench route. No digest was edited by hand and no provider generation was needed.

All 67 browser cases are covered: the full sweep passed 52/64, eight affected cases passed the first focused retest, three target checks passed their visibility-aware retest, the existing delayed-error case and new automatic-resume case passed together, and two Skip cases passed separately. This is combined coverage, not one clean full local run. Browser tests use real Chromium and the real WASM worker. Feedback API requests in acceptance are intercepted and are not sent to the lab. Final screenshot evidence is in the external lab sweep's `built/neighbours/` directory. Adam's feel acceptance is separate from these technical checks.

A final parallel review found local-copy export errors hidden behind Send word. Feedback now shows and reveals those errors, and a retry clears only the matching export failure, preserving unrelated or newer import warnings. The shared recovery message points to title / Other ways in. Two real-browser regressions at360x690 and1280x800 force compression failure and verify visible recovery plus exact208-person save equality after retry. All seven focused save/feedback cases pass; the existing late-file and delayed-state warning assertions remain. A later clean local full run passed67/67 before these two cases were added; final hosted CI establishes the complete69-case result.

First-visit verification also caught the shared telemetry notice behind the title drawing. Its host now stacks above that drawing without taking space from the pinned entry area. Two further browser cases verify an unobscured44px Dismiss, an unobscured first-viewport Enter action, no document scroll and once-only persistence at both target sizes. All eight focused notice/grammar/privacy cases and the fresh517-test lane pass. The final external release evidence establishes the complete71-case hosted result.
