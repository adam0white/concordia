# Neighbours first steps implementation plan

> Execute the guide and its controls together; retain real native timing and decisions.

**Goal:** Show a new visitor how the hall goal, neighbour selection, actual request and real reply fit together without relying on the opening prose.

**Architecture:** A small presentation-only guide follows the selected resident and the conversation's public request records. It never submits a command or predicts an answer. Its local skip/replay preference lives outside the town export. A fresh replay uses a snapshot of existing request IDs so an old answer cannot be presented as a new consequence.

**Stack:** React 19, TypeScript, existing Playwright and Vitest; no new package.

## Constraints and tasks

- Preserve the six-resident edition, clock, costs, resident agency, and existing complete replay. The original 206-person research remains unqualified.
- Add one guide at a time: hall goal and choose neighbour; selected person's actual talk/walk route; choose a real request; point to that request's actual recorded answer. Handle absent/asleep/travelling residents without inventing a route or answer.
- Add Skip guide and menu replay; do not confuse it with Skip town time. Replay snapshots old requests and must not claim a prior answer as a new one.
- Begin with failing meaningful controls; exercise real browser actions and actual reply. Before each clicked target assert viewport and hit-testing. Cover phone and desktop, skip, menu replay, and changed resident; preserve existing game tests.
- Freeze source for one first-time synthetic skim and actual choices, record exact words and limits publicly. Inspect screenshots at both viewport sizes. Run lane and native/browser gates before signed combined PR and exact-head review.
