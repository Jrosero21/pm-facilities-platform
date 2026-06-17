# CF-20.1 — Operator Photo Viewing — Closeout

## Feature Goal
Discharge CF-20.1 from the Phase-20 bank: give operators a reader and viewing surface for vendor-uploaded job photos, closing the write-only gap in the otherwise-wired vendor edge.

## Completed Deliverables
- `listJobPhotos` + `getJobPhotoUrl` — tenant + job scoped operator readers, no-existence-leak discriminated result.
- Thumbnail-grid renderer with honest "Unavailable" degrade.
- Job-detail page wiring (loader + up-front presign + render slot), ungated per D4.
- Phase-blocking harness, 15/15 green, wired as `db:check:job-photos`.

## Files Created or Changed
- `src/server/job-attachments.ts` — new (the two readers)
- `src/components/job-photos-panel.tsx` — new (thumbnail-grid renderer)
- `src/app/(app)/jobs/[id]/page.tsx` — modified (imports + loader + render slot)
- `scripts/check-job-photos.ts` — new (harness)
- `package.json` — modified (`db:check:job-photos` gate)
- (Excluded: `next-env.d.ts` — build-generated, not part of this work; checkout before commit.)

## Database Changes
None. Reader-only over existing `job_attachments` (see 08-db-changes.md).

## API Routes / Server Actions Added
None. Two server-side readers consumed in the job-detail loader (see 09-api-routes.md).

## User-Facing Workflows Added
Operator views vendor before/after photos on the job-detail page; clicks a thumbnail for full size.

## Admin/Internal Workflows Added
`pnpm run db:check:job-photos` gate. R2 configuration (CF-iii.1) enables live rendering.

## Business Rules Added
BR1–BR7 (see 06-business-rules.md) — operator-scoped viewing, no-existence-leak, internal/captured-then-review, active+photo-only, honest degrade, ungated-among-authorized.

## Verification Performed
tsc --noEmit            → exit 0 (0 errors)

eslint (3 touched files) → clean

pnpm run lint           → exit 0 (pre-existing warnings in other files only)

pnpm run build          → exit 0 (recompiled ƒ /jobs/[id])

pnpm run db:check:job-photos → HARNESS GREEN 15/15, exit 0, 0 leftover rows

incl. no-leak: cross-tenant probe → forbidden; cross-job probe → forbidden

## Known Limitations
See 10-known-limitations.md: ungated panel (L1, deviation from banked spec), R2-blocked live render (L2), orphan sweep open (L3, CF-20.2), job-detail-only (L4, CF-20.1b banked), no pagination (L5).

## Carry-Forward Items
This sub-feature set carries no `closeout-carryforwards.md` (the bank stays phase-level). Recorded in the live phase bank (`docs/phase-27-proposal-agent/closeout-carryforwards.md`, "Phase-20 banked items") as part of this closeout commit:
- **CF-20.1 — BUILD-COMPLETE, retirement pending R2 live-verify.** Marked accordingly in the live Phase-27 bank; NOT fully retired until an operator renders a real photo post-R2.
- **CF-20.1b — newly banked.** Cross-job vendor-photo feed in the Phase-18 inbox (deferred by decision).
- **CF-20.2 — still open.** Orphan-object sweep (untouched).
- **CF-iii.1 (R2) — still open**, now the live-verify dependency gating CF-20.1's retirement (and still blocking v2.17 / CF-27.15 verifies).
- **CF-20.3 — confirmed discharged** (roadmap text already correct; no edit).

## Recommended Next Focus
Configure R2 (CF-iii.1) to retire CF-20.1 and unblock the queued live-verifies; or proceed to B-16.4 (vendor performance reader) as the next strategic spine item, data-permitting.
