# Phase 18 — Business Rules

Each rule is mapped to the harness group/assertion that proves it
(`pnpm run db:check:operator-review`).

| Id | Rule | Harness |
|---|---|---|
| **R-18.1** | The draft queue is **tenant-scoped and cross-job**: it returns a tenant's `pending_review`+`approved` drafts across all jobs, with a `#jobNumber · clientName` label. | A6, A7, A3 |
| **R-18.2** | The draft queue is the **actionable set**: it EXCLUDES `published`, `rejected`, and `discarded` drafts. | A8, A9, A10 |
| **R-18.3** | The vendor inbox returns **only vendor-origin, non-archived** notes (`origin='vendor'`, `status<>'archived'`), tenant-scoped, with a job label. | A1, A2, A4, A5 |
| **R-18.4** | **Cross-tenant isolation** (§poison): neither reader surfaces another tenant's rows. | B1, B2 |
| **R-18.5** | Promotion flips visibility ONLY to `client_visible` / `client_and_vendor_visible`; every other target throws `INVALID_PROMOTION_TARGET` with **no flip**. | C1, C2, C3–C6, C7 |
| **R-18.6** | Promotion is **tenant-scoped** (operator auth): a cross-tenant `noteId` throws `NOTE_NOT_FOUND`. | C8 |
| **R-18.7** | Promotion is **idempotent in surface effect** and persists: the returned row and a re-read both reflect the new visibility. | C1b |

## v2 invariants touched (affirmed)

- **§2.2 — Autonomy is never silent.** Every promotion writes an `audit_logs` row
  (`job_note.visibility_promoted`, `metadata:{jobId, from, to}`). Although promotion is an operator
  action (not autonomous), the audit discipline that makes later autonomy inspectable is exercised here.
  → **R-18(audit)**, harness D4/D5/D6.
- **§2.3-v1 / §2.4-v1 — Capture-then-review.** Vendor updates land `internal_only` + `origin='vendor'`
  and never auto-become client-visible; promotion to a client-facing visibility is an explicit,
  operator-gated step. → **R-18.3 / R-18.5**, the inbox + the promotion guard.
- **Fork 1 — No outbound on promotion.** Promotion does not write `communication_logs` /
  `client_update_logs` / any notification; the send path is Phase 19. → **harness D1/D2** (both
  unchanged after a promotion); D3 confirms the flip is an UPDATE, not an insert.
