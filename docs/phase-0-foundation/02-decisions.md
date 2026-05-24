# Phase 0 — Decisions

Architectural and process decisions locked in during Phase 0. Future phases inherit these unless explicitly overridden.

## D-0.1 — Project root is `~/Desktop/PM`
- **Why:** Single, predictable location for the working tree. `~/Desktop/pm` is allowed as a lowercase fallback only.
- **How to apply:** All session scripts, MySQL commands, and rsync snapshots assume this root.

## D-0.2 — Source-agnostic platform
- **Why:** The aggregator ingests jobs from many channels (ServiceChannel, other external portals, email, client portal, manual entry, PM schedules, snow events). Centering on any one channel would force rework.
- **How to apply:** No table, column, route, or component is named after a specific channel. Channel identity is a value (`source_type`, integration metadata), never a structural assumption.

## D-0.3 — Browser never connects directly to MySQL
- **Why:** Credentials must not leave the server tier; the DB is reached through an SSH tunnel.
- **How to apply:** All DB access lives under `src/server/` (or equivalent). Client components call server actions / route handlers only.

## D-0.4 — Phase-based branches and tags
- **Why:** Each phase ships as a reviewable unit with a versioned snapshot.
- **How to apply:** Branch `phase-N-<short-name>`, tag `v0.N.0-phase-N`. Optional pre-phase rsync snapshot to `~/Desktop/PM_snapshot_v0_N_0_phase_N/`.

## D-0.5 — Eleven-doc closeout per phase
- **Why:** A consistent doc shape makes future-Claude/future-GPT chats fast to onboard and forces every phase to capture rules, workflows, and limitations — not just code.
- **How to apply:** Every `docs/phase-N-*/` directory ends a phase with files `01-phase-summary.md` through `11-closeout.md`. A phase is not complete until all eleven exist.

## D-0.6 — Auditability via history/event tables
- **Why:** State overwrites destroy operational context that the aggregator, vendors, and clients all need.
- **How to apply:** When a meaningful change happens (status, priority, assignment, communication, integration sync), write a history/event row, not just an update to the current-state column. Decision applies starting Phase 4 (jobs).

## D-0.7 — AI output is always a reviewable draft
- **Why:** AI-generated scopes, summaries, and replies must be reviewed before they touch a client or vendor.
- **How to apply:** AI-produced content lands in a draft/review state; an explicit human action promotes it to "sent" or "applied." Applies starting Phase 7.

## D-0.8 — Roadmap is canonical until the live repo or DB disagrees
- **Why:** Once implementation starts, the live state is more trustworthy than the plan.
- **How to apply:** Source-of-truth order: user instruction → roadmap → live repo → live DB → current phase docs → older phase docs.
