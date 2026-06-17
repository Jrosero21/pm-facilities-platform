# CF-20.1 — Operator Photo Viewing — Summary

## What this is
A sub-feature discharging **CF-20.1** from the Phase-20 (Vendor Edge) carry-forward bank: the operator-side reader and viewing surface for vendor-uploaded job photos.

## The gap it closes
Phase 20 shipped the vendor photo **write** path — vendors upload before/after photos that persist to object storage (real bytes via the v2.17 storage factory). But there was **no operator-side reader**: from the operator's chair, vendor photos were write-only. An operator opening a job could not see the photos vendors had uploaded for it. This half-defeated the vendor-edge loop — the photos existed but the aggregator couldn't look at them.

## What shipped
- A tenant + job scoped operator reader (`src/server/job-attachments.ts`) — `listJobPhotos` + `getJobPhotoUrl` — mirroring the proven vendor-invoice-document reader's no-existence-leak discriminated-result discipline.
- A thumbnail-grid renderer (`src/components/job-photos-panel.tsx`) — clickable thumbnails via short-lived presigned URLs; honest "Unavailable" degrade tiles when a URL isn't fetchable (capture provider / no R2 yet, or title-only placeholder rows).
- Wiring into the operator job-detail page (`src/app/(app)/jobs/[id]/page.tsx`) — loader resolves all presigned URLs up-front, renders the panel in the operational-evidence cluster.
- A phase-blocking harness (`scripts/check-job-photos.ts`, gate `db:check:job-photos`), 15/15 green against `jonnyrosero_pm_sandbox`.

## Status
**Build-complete; retirement pending R2 live-verify.** All code shipped, types green (tsc/eslint/lint/build), harness green including the no-leak security assertions. The one thing not yet provable: an operator rendering a *real* photo on screen — that requires R2 configured (CF-iii.1), the standing storage prod-blocker. Under the capture provider the reader resolves a `capture://` URL by design, which won't render as an image, so the live "operator sees the photo" check waits on R2. Retirement of the bank line is recorded in the next phase's `closeout-carryforwards.md`, not here (sub-feature sets don't fork the bank).

## Invariant preserved
Vendor photos land `visibility='internal_only'` (aggregator-first, §2.3 capture-then-review). `internal_only` is the operator-visible tier; the reader applies no visibility filter (operators see internal photos) but the photos are never auto-promoted to client-visible. The operator viewing surface does not change vendor→client promotion, which remains operator-gated and deferred (FB-10l.2).
