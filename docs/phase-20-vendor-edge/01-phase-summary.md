# Phase 20 — Phase Summary

**Phase:** 20 — Vendor Edge Completion (v2.3.0-phase-20).
**Branch:** `phase-20-vendor-edge` (off `main@895bd3c`, the CF-19.4 roadmap-fix close).
**Outcome:** the vendor photo edge gains a **real object-storage backend** — vendor photos are uploaded
as bytes to Cloudflare R2 (behind an S3-compatible `StorageProvider` seam, **capture-by-default**) and
served via short-lived presigned URLs — while the **capture-then-review** mapping (vendor uploads land
`internal_only`) is preserved. On the second v2 migration (0043, additive). A 17-assertion
phase-blocking harness is green.

## What Phase 20 is

The 17a sweep found the vendor portal wired end-to-end except for one gap: photo "uploads" were a
**metadata-only placeholder** (`job_attachments` rows with NULL file columns; `FB-10a.4`). Phase 20
closes that gap — the placeholder becomes real bytes — without changing the vendor capture-then-review
discipline.

- **Storage seam** (`src/lib/integrations/storage/`, mirroring the Phase-19 send seam): a types-only
  `StorageProvider` interface (`put` + `getSignedUrl`), a `CaptureStorageProvider` (in-memory, harness),
  an `R2Provider` (live, AWS S3 SDK against R2), and `getStorageProvider()` — capture-by-default, R2
  never constructed without creds.
- **Upload path:** the vendor photo action reads an optional file from `FormData`, validates it (MIME
  allowlist + 15 MB), and the writer does **put-to-storage first, then the DB insert** (a failed put
  writes no row). On success the row carries `storage_key`/`checksum`/`storage_provider`/size/mime and
  audits `job_attachment.uploaded`; with no file the existing placeholder path is unchanged.
- **Serve path:** `getVendorAttachmentUrl` reuses the vendor reader's scope gate **verbatim**, fetches
  the `storage_key`, and presigns a 5-minute read URL — discriminated `url`/`placeholder`/`unavailable`/
  `forbidden` (missing ≡ out-of-scope, no existence leak).
- **UI:** the vendor job-detail photo form gets a file input with mobile camera capture
  (`accept="image/*" capture="environment"`); the photos list renders a presigned thumbnail per row.

## Schema posture — ONE migration (0043), additive

`job_attachments` += `storage_key` (varchar 1024), `checksum` (varchar 255), `storage_provider`
(varchar 32) — all nullable, no FK/index/drop. `storage_key` NULL is the new placeholder marker. The
pre-existing `file_url`/`file_size_bytes`/`file_mime_type` are unchanged. Table count 115; ledger 0043
(sandbox + prod). See `08-db-changes.md`.

## The build (5 commits)

`e025161` migration 0043 · `f0c3ee1` R2 storage seam + upload bytes path · `9460a9a` presigned-URL serve
fn · `b26d962` vendor photo UI (input + presigned display) · `52bd1ef` phase-blocking harness.

## Verification

`pnpm run db:check:vendor-edge` — **17/0 GREEN on two clean runs** (groups: upload happy path /
placeholder path / cross-tenant isolation / author-scope + no-existence-leak / write-boundary). Forced
via `STORAGE_CAPTURE=1` so no real R2 is reached. `pnpm exec tsc --noEmit` → 0; `pnpm run lint` →
0 errors; `pnpm run build` → clean.

## Disposition note

Phase 20 **retires FB-10a.4** (real photo-upload backend — storage + signed URLs + validation; the
Phase-10 vendor-portal item). It does **not** retire **CF-13.4** (the *email*-attachment backend,
`email_attachments.storage_ref`) — that is the email-ingestion track, untouched here, though the R2 seam
Phase 20 built is the reusable blob backend CF-13.4 was waiting for. See `11-closeout.md` /
`closeout-carryforwards.md`.
