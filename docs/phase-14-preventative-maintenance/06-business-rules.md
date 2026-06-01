# Phase 14 — Business Rules

Each rule cites its proving assertion in `scripts/check-pm-generation.ts` (24/0 green @ `a149c22`).

| Id | Rule | Proof |
|---|---|---|
| **R-14.1** | **Fan-out width = live membership.** A schedule generates exactly one visit per active `pm_schedule_locations` row (queried live, not assumed). | A1 (requested === live count), A3 (visits == requested) |
| **R-14.2** | **PM jobs carry `source_type='preventative_maintenance'`.** A generated visit's job is an ordinary job tagged PM. | B1 |
| **R-14.3** | **Auto = SYSTEM-attributed; review = operator-attributed.** Auto-path jobs `created_by` = the system user; batch-approved jobs `created_by` = the approving operator. | B2 (system), E4 (operator) |
| **R-14.4** | **Job lands at NEW with the program's client/location/codes.** | B4 (client/location/NEW) + B3 (sourceExternalId shape `pm:{schedule}:{run}:{location}`) |
| **R-14.5** | **Recurrence advances once per run; re-fire is idempotent.** `next_due_at` advances by frequency×interval; a not-yet-due re-scan generates nothing new. | C1 (advance 3 months), C2 (last_generated set), C3 (idempotent re-fire) |
| **R-14.6** | **Skip-and-flag (F2): one failure never aborts the batch.** A failing location → that visit `skipped` + `skip_reason` (the createJob error); the rest still generate. | D1/D4 (counts split), D2 (poison skipped, reason captured, jobId null), D3 (good visits generated — batch did not abort) |
| **R-14.7** | **Review gate (F1): no jobs until approval.** A review-mode fire lands `pending_review` visits with no jobs; `approvePmVisits` then spawns them. | E1 (pending_review), E2 (no jobs on fire), E3 (approved → jobs exist) |
| **R-14.8** | **Batch-approve is re-call-guarded.** A second approve of a processed run reports `alreadyResolved`, spawns nothing new. | E5 (alreadyResolved === count, approved 0) |
| **R-14.9** | **Tenant isolation.** A schedule lookup is scoped to its own tenant; an unknown/cross-tenant schedule id → `SCHEDULE_NOT_FOUND`. | F1 |
| **R-14.10** | **Empty fire is auditable, not an error.** A 0-membership schedule opens a run with requested=0/generated=0, creates no visits, throws nothing. | G1 |

## Inherited rules in force
- **§2.5** — automated output is gated where a human decision belongs: the review path's `approvePmVisits` IS the gate (auto path is deterministic, so it fires; review path requires the operator).
- **IF-4 ordering** — `createJob` owns its own txn, called outside any visit-lock txn; the link-back is a separate re-check-guarded write.
- **CF-13.6 orphan discipline** — a 0-row link-back (visit changed under us after the job committed) is **audited (`pm_visit_link_orphan`), not thrown** — the job is real.
- **Every workflow gets an event/history row** (CLAUDE.md §6) — `pm_generation_runs` is the batch event; per-visit skips + the run summary are audited.
