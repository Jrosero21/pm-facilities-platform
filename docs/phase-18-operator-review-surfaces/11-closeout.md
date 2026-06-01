# Phase 18 — Closeout

## Goal

Extend the existing operator portal with the **review/audit surfaces** v2 autonomy depends on: a
tenant-wide AI-draft review queue and a vendor-updates inbox, plus the **FB-10l.2** operator-gated
visibility-promotion writer — as a service+UI layer with **zero new tables**, reusing the §2.5 draft
gate and the existing vendor-note capture path.

## Completed deliverables

- **`/review`** — a tabbed operator route (Drafts \| Vendor updates), `searchParams`-driven, added to
  the portal nav.
- **AI-draft review queue** — tenant-wide cross-job triage of `update_rewrite_drafts`
  (`pending_review`+`approved`), reusing the existing approve/reject/discard/publish writers with each
  row threading its own `jobId`.
- **Vendor-updates inbox** — tenant-wide list of vendor-origin `job_notes` (FB-10a.3).
- **`promoteNoteVisibility`** — the FB-10l.2 operator-gated `internal_only`/`requires_review` →
  client-facing promotion; flip + audit only, **no outbound** (Fork 1).
- A **32-assertion phase-blocking harness** (`db:check:operator-review`), green on two clean runs.

## Files created / changed (commit `943b5c6`)

- `src/server/agents/drafts.ts` — `listPendingReviewDraftsDetailed` + `DraftQueueItem` (18b).
- `src/components/review-queue-section.tsx` — cross-job queue UI (18b).
- `src/app/(app)/review/page.tsx` — tabbed Review route (18b create, 18c tabs).
- `src/app/(app)/layout.tsx` — nav `<Link href="/review">` (18b).
- `src/server/job-notes.ts` — `listVendorUpdates` + `VendorUpdateItem` + `promoteNoteVisibility` +
  `PROMOTION_TARGETS` (18c).
- `src/app/(app)/jobs/note-visibility-actions.ts` — `promoteNoteVisibilityAction` (18c).
- `src/components/vendor-updates-inbox.tsx` — inbox UI + promote control (18c).
- `scripts/check-operator-review.ts` + `package.json` alias `db:check:operator-review` (18d).
- `docs/phase-18-operator-review-surfaces/` — `18-inspection-and-manifest.md` + this closeout set (18d).

> Commit: `943b5c6` — the whole phase (18b queue + 18c inbox+promotion + 18d harness+docs)
> landed as a single commit, not separate slice commits.

## DB changes

**ZERO.** Table count 115 (unchanged); latest migration 0041 (unchanged); next free 0042 untouched.
Reused `update_rewrite_drafts`/`update_rewrite_reviews`, `agent_decisions`, `job_notes`, `jobs`/`clients`,
`audit_logs`. See `08-db-changes.md` (incl. the `vendor_update_logs`-is-dead correction).

## API routes / server actions added

`/review` (tabbed). Readers `listPendingReviewDraftsDetailed`, `listVendorUpdates`; writer
`promoteNoteVisibility`; action `promoteNoteVisibilityAction`. See `09-api-routes.md`.

## User-facing workflows added

Cross-job draft triage; vendor-update review + client-promotion. See `03-user-sop.md`, `05-system-workflows.md`.

## Admin/internal workflows added

`db:check:operator-review` harness; the promotion audit trail (`audit_logs.job_note.visibility_promoted`).
See `04-admin-sop.md`.

## Business rules added

R-18.1…R-18.7, each mapped to a harness assertion; plus the affirmed v2 invariants (§2.2 never-silent,
§2.3-v1/§2.4-v1 capture-then-review, Fork-1 no-outbound). See `06-business-rules.md`.

## Chatbot knowledge added

`07-chatbot-knowledge.md` — the Review surface, both tabs, the promotion semantics, and where vendor
updates are stored (`job_notes`, not `vendor_update_logs`).

## Verification

```
pnpm run db:check:operator-review
→ passed: 32 / failed: 0  — PHASE-18 OPERATOR-REVIEW LEDGER GREEN ✓   (run twice, identical; idempotent)
```
Groups: A cross-job readers · B cross-tenant isolation · C promotion guards · D write-boundary /
no-outbound. `pnpm exec tsc --noEmit` → exit 0; `pnpm run lint` → 0 errors; `pnpm run build` → clean,
`/review` present.

## Known limitations

No outbound on promotion (Phase 19); no autonomous lane (Phase 23); queue omits original source note
(soft UX); no `(tenant_id, origin)` index (soft perf). See `10-known-limitations.md`.

## Carry-forward items

Discharged: FB-10a.3, FB-10l.2, FB-10l.3. New (open): queue original-note omission, `(tenant_id, origin)`
index. Plus the full inherited bank rolled forward (FB-10a.1 retained; FB-10l.2/.3 line removed). See
`closeout-carryforwards.md`.

## Recommended next phase focus

**Phase 19 — Notification Center + Exception Queue + Live Send Backend.** It is the dependency the
"no outbound" boundary points at: the real email/SMS send provider, the exception/notification push
surface, and the business-hours SLA clock. Load-bearing for every autonomy phase after it.
