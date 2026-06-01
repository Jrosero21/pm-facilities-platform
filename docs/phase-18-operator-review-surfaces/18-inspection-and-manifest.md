# Phase 18 — Inspection & Manifest (consolidated)

This single doc consolidates the Phase-18 planning sub-batches (18a inspection, 18b-A / 18c-A
reader+writer inspections, 18d-A closeout/harness inspection) and the locked decisions/forks that
governed the build. It is the planning record; the 11 standard docs are the closeout record.

## What Phase 18 is

The first v2 phase. It **extends the existing operator portal** (`src/app/(app)/`) with the
review/audit surfaces autonomy will depend on — it does **not** build a portal shell (that already
exists). Two surfaces, one route:

1. **AI-draft review queue** — a tenant-wide, cross-job triage of `update_rewrite_drafts` at
   `/review` (tab "Drafts"). The §2.5-v1 human gate gets a one-place surface instead of per-job hops.
2. **Vendor-updates inbox + visibility-promotion** — a tenant-wide inbox of vendor-origin
   `job_notes` at `/review?tab=vendor-updates`, with the **FB-10l.2** operator-gated
   `internal_only → client-facing` promotion (the one net-new write of the phase).

## Key inspection findings (what shaped the build)

- **Operator portal is not greenfield.** The `(app)` route group has full CRUD over
  clients/vendors/jobs and a shared `layout.tsx` with an inline `<nav>`. New surfaces attach as a
  route dir + one `<Link>`; auth is `requireTenant()` (the layout already gates non-operators out).
- **Draft chain is fully reusable.** `createReview` / `publishRewriteDraft` / `discardDraft` and
  the `(jobId, draftId, …)` action wrappers in `jobs/rewriter-actions.ts` already exist. The only
  gap was a **tenant-wide** (cross-job) reader — every existing draft reader required a `jobId`.
- **Vendor updates live in `job_notes` (`origin='vendor'`), NOT `vendor_update_logs`.** The latter
  is an empty Phase-6 forward-decl with zero writers — **dead**; do not use it. Vendor notes land
  via `createVendorNote → createJobNote(origin:'vendor', visibility:'internal_only')`.
- **No visibility-promotion writer existed** (grep-confirmed) — FB-10l.2 is genuinely net-new.
- **Migration-free hypothesis confirmed.** Both surfaces are readers + one UPDATE over existing
  columns. Table count 115, latest migration 0041, next-free 0042 — all untouched.

## Locked decisions / forks

| # | Decision | Rationale |
|---|---|---|
| Branch | **Option A** — ff-merge the v2 planning branch to main, branch Phase 18 off main | linear history; planning + build share one trunk |
| Fork 1 | Promotion = **flip visibility + write audit, NO outbound** | Phase 19 owns the send backend; promotion must not publish/notify |
| Auth | **Operator pattern** (tenant-scope via `getJobNote`), NOT the vendor-scope check | promotion is an operator action; vendor-scope is the wrong axis |
| Audit home | **`audit_logs`** via `writeAuditLog`, not `job_events` | matches `job_note.created` / `rewrite_draft.*` precedent; `job_events` has no standalone writer |
| Target constraint | promotion allowed ONLY to `client_visible` / `client_and_vendor_visible` | keeps it a *promotion* writer, not a general set-any-visibility mutator |
| Component | **new** `review-queue-section.tsx`; `update-drafts-section.tsx` stays single-job | avoid overloading the per-job component; thread `draft.jobId` per row |
| IA | one **tabbed** `/review` route (Drafts \| Vendor updates), `?tab=`-driven | SSR-friendly, no client tab state; lane-extensible |
| Dual-mode | **groundwork only** — a labeled-lane seam, no autonomous lane, no status enum | the autonomous lane has no producer until Phase 23 |
| Migration | **migration-free**; `(tenant_id, origin)` index banked as a soft perf item | low vendor-note volume; tenant-prefix scan suffices today |

## Retirements (asserted in §9 / carryforwards)

- **FB-10a.3** — Operator vendor-updates inbox → **built** (Phase-10 §A.1 is the definitional source).
- **FB-10l.2** — Operator note visibility-promotion → **built** (Phase-10 §A.3).
- **FB-10l.3** — `requires_review` workflow undefined → **resolved**: `requires_review` is now a
  promotable inbox source (Phase-10 §B). FB-10a.1 (invite/onboarding) stays open.

## Verification

`pnpm run db:check:operator-review` → **32/0 GREEN on two clean runs** (groups A cross-job readers ·
B cross-tenant isolation · C promotion guards · D write-boundary / no-outbound). `tsc --noEmit` → 0.
