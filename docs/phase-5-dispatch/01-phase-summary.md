# Phase 5 — Phase Summary

## Phase Name
Dispatch Workflow

## Version
`v0.6.0-phase-5`

## Phase Goal
Let operators assign vendors to jobs: surface the capable/in-area vendors for a job (the Phase 3 capability layer meeting the Phase 4 job), capture a dispatch at draft, send it to the chosen vendor, and move the job's status — recording every step as immutable history + a timeline event + an audit row, with a dispatch-time snapshot of *why* the vendor matched.

## In Scope
- Schema for **7 tables** in one migration (`0009_brief_wallflower`): 1 GLOBAL reference (`dispatch_assignment_statuses`, 9 statuses) + 6 operational (`job_vendor_assignments`, `job_vendor_assignment_status_history`, `dispatch_messages`, `vendor_eta_confirmations`, `vendor_check_ins`, `vendor_check_outs`).
- **`vendor-matching.ts`** — `findCandidateVendorsForJob` (5a): a new cross-vendor query ranking trade- + geo- + compliance-eligible vendors (D-3.12), with a dispatch-time facet snapshot.
- **`createDispatch`** (single-entity, 3-write txn) lands an assignment at DRAFT with a re-derived facet snapshot; **`sendDispatch`** (dual-entity txn, parent-before-child locks) moves DRAFT→SENT and advances the job to DISPATCHED.
- Screens: dispatch section on `/jobs/[id]`, the matcher-driven `/jobs/[id]/dispatch/new` form, and the `/jobs/[id]/dispatch/[assignmentId]` assignment workspace with a Send button.
- The first **job status transition** (NEW/SCHEDULED → DISPATCHED) and the first non-creation `job_events` (`job.dispatched`).

## Out of Scope (deferred)
- **Delivery layer** for `dispatch_messages` (recipient routing, send/bounce/read tracking, channel fields) — Phase 6; Phase 5's table is content + metadata only.
- **ETA / check-in / check-out / messages UI** — schema only; Phase 6 builds the workspace sections.
- **Aggregator-designated primary vendor + auto-dispatch routing** — a future feature (Phase 6+/9); Phase 5's matcher is advisory, the operator picks every dispatch.
- Assignment **edit / archive / accept / decline UI** (create + send + view only; ACCEPT/DECLINE are vendor-side, Phase 10).
- Geographic **radius / county** matching (inert until coordinates / a county column land); compliance hard-gating (non-blocking until data lands); performance/proximity ranking (Phase 9).

## Status
Complete. Branch `phase-5-dispatch`, tag `v0.6.0-phase-5`. Builds on Phase 4 (`v0.5.0-phase-4`).

## Pointers
- Decisions: `02-decisions.md` (D-5.1 … D-5.26 — the densest set yet)
- The "why" behind the flows: `05-system-workflows.md`, `06-business-rules.md`
- Chatbot source-of-truth: `07-chatbot-knowledge.md`
- DB changes: `08-db-changes.md` · API/actions: `09-api-routes.md`
- Known limitations + carry-forwards: `10-known-limitations.md`
- Closeout: `11-closeout.md`
