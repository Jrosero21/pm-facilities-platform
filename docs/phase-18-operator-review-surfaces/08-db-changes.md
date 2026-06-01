# Phase 18 — DB Changes

## ZERO new tables. ZERO migrations.

Phase 18 added no schema. The migration-free hypothesis (stated at planning) is confirmed:
- Live table count: **115** (unchanged from Phase 16).
- Latest migration: **0041** (`0041_charming_william_stryker.sql`, Phase 15). Next free is **0042**, untouched.

Both surfaces are **readers + one UPDATE over existing columns**. No `db:generate` was run.

## Reused substrate

| Concern | Tables (reused) | Origin |
|---------|-----------------|--------|
| AI drafts + §2.5 review gate | `update_rewrite_drafts`, `update_rewrite_reviews` | Phase 6 (6g.a) |
| Draft confidence/rationale (queue label join) | `agent_decisions` | Phase 6 |
| Vendor-update store (the inbox source) | `job_notes` (`origin`, `visibility` columns) | Phase 6 / Phase 10 |
| Job + client labels (both readers) | `jobs`, `clients` | Phase 4 |
| Promotion audit record | `audit_logs` | Phase 0/6 |

## Writes introduced

- **`promoteNoteVisibility`** performs a single-row `UPDATE job_notes SET visibility = ?`
  (allowed targets `client_visible` / `client_and_vendor_visible` only) + one `audit_logs` INSERT
  (`job_note.visibility_promoted`). It writes **nothing else** — no `communication_logs`,
  `client_update_logs`, or notification (Fork 1; harness group D proves the absence).
- The draft-queue actions reuse existing writers (`createReview`, `publishRewriteDraft`,
  `discardDraft`) — no new write paths.

## Index posture (no change; one soft item banked)

`job_notes` has only `job_notes_tenant_job_idx (tenant_id, job_id)`. The cross-job vendor reader filters
`(tenant_id, origin='vendor')`, a tenant-prefix scan with an `origin` post-filter — acceptable at current
vendor-note volume. A `(tenant_id, origin)` index is **banked** (`closeout-carryforwards.md`), not built,
to keep the phase migration-free.

## Roadmap §9 / data-model correction (record this)

Earlier planning assumed vendor updates flowed through **`vendor_update_logs`**. **They do not.**
`vendor_update_logs` is a Phase-6 structural forward-decl with **zero writers** anywhere in `src`
(empty). The live capture path is **`job_notes` tagged `origin='vendor'`** (via `createVendorNote →
createJobNote`). The Phase-18 inbox reads `job_notes`; `vendor_update_logs` remains dead and should not
be used by future work without a deliberate decision to activate it.
