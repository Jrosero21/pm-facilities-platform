# Phase 18 — Phase Summary

**Phase:** 18 — Operator Portal Review/Audit Surfaces (the first v2 phase).
**Branch:** `phase-18-operator-review-surfaces` (off `main@65f93fc`, the v2 roadmap commit).
**Outcome:** the existing operator portal gains two tenant-wide review surfaces — an AI-draft
review queue and a vendor-updates inbox with operator-gated visibility promotion — as a
**service+UI layer with ZERO new tables**, regression-protected by a 32-assertion phase-blocking harness.

## What Phase 18 is

Phase 18 extends `src/app/(app)/` (the operator portal — already a full CRUD surface) with the
review/audit surfaces v2 autonomy depends on. It is **surfaces, not a shell**. One new route,
`/review`, with two tabs:

- **Drafts** — a tenant-wide, cross-job triage of `update_rewrite_drafts`. The §2.5-v1 human gate
  (review/edit/approve/reject/publish) gets one place instead of per-job hops. Reuses the existing
  `createReview` / `publishRewriteDraft` / `discardDraft` writers and the `(jobId, draftId, …)`
  action wrappers — each row threads its **own** `jobId`.
- **Vendor updates** — a tenant-wide inbox of vendor-origin `job_notes` (`origin='vendor'`), with
  the **FB-10l.2** operator-gated promotion of an `internal_only` / `requires_review` note to a
  client-facing visibility. This promotion is the **one net-new write** of the phase.

## The build (8 source files)

**Readers (cross-job, net-new):**
- `listPendingReviewDraftsDetailed(tenantId)` (`src/server/agents/drafts.ts`) — the cross-job
  mirror of `listDraftsForJobDetailed` (same `agent_decisions` join, minus the `jobId` filter, plus
  a `jobs`+`clients` join for the `#jobNumber · clientName` label). Returns `pending_review`+`approved`.
- `listVendorUpdates(tenantId)` (`src/server/job-notes.ts`) — the cross-job mirror of `listJobNotes`,
  `+eq(origin,'vendor')`, `status<>'archived'`, `+jobs`+`clients` label join.

**Writer (the net-new write):**
- `promoteNoteVisibility({tenantId, noteId, toVisibility, actorUserId})` (`src/server/job-notes.ts`)
  — `getJobNote` tenant-scope guard → target-constraint check → single-row UPDATE → `writeAuditLog`.
  **Flip + audit ONLY — no outbound** (Fork 1).

**Action wrapper:** `promoteNoteVisibilityAction` (`src/app/(app)/jobs/note-visibility-actions.ts`).

**UI:** `review-queue-section.tsx`, `vendor-updates-inbox.tsx`, tabbed `review/page.tsx`, one nav
`<Link>` in `(app)/layout.tsx`.

## Schema posture — ZERO new tables, ZERO migrations

Table count unchanged at **115**; latest migration unchanged at **0041**; next free **0042** untouched.
The phase reuses `update_rewrite_drafts` / `update_rewrite_reviews` (drafts + §2.5 gate), `job_notes`
(vendor-update store, `origin`/`visibility` columns), `audit_logs` (the promotion record), and
`agent_decisions` (the confidence join). See `08-db-changes.md`.

## Commits

Build commits land at gate time; hashes filled into `11-closeout.md` on close. Slices: 18b
(/review draft queue), 18c (vendor-updates inbox + promotion writer), 18d (harness + closeout docs).

## Verification

`pnpm run db:check:operator-review` — **32/0 GREEN on two clean runs** (groups A cross-job readers ·
B cross-tenant isolation · C promotion guards · D write-boundary / no-outbound). `pnpm exec tsc
--noEmit` → exit 0; `pnpm run lint` → 0 errors; `pnpm run build` → clean, `/review` present.
