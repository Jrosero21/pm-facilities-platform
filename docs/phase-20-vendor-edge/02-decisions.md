# Phase 20 — Decisions

## D-20.1 — Cloudflare R2, behind a `StorageProvider` seam

The object store is **Cloudflare R2**, reached through an S3-compatible `StorageProvider` interface
(`src/lib/integrations/storage/`). Chosen for **zero egress fees** (photos are read repeatedly),
S3-API compatibility (standard SDK, low lock-in — the same adapter points at any S3-compatible store),
and a clean credentials model. The server never imports a concrete provider — it calls
`getStorageProvider()`.

## D-20.2 — SDK divergence from the send seam's raw-fetch lean

The Phase-19 send seam used raw `fetch` (no SDK). The storage seam **deliberately** adds
`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` — S3 SigV4 request signing and presigned-URL
generation are impractical to hand-roll, unlike a single Resend POST. The divergence is documented at
the top of `r2-provider.ts`.

## D-20.3 — Put-to-storage FIRST, then the DB insert

`createVendorPhotoPlaceholder` (file branch) calls `provider.put()` **before** inserting the
`job_attachments` row; a failed put throws `STORAGE_PUT_FAILED` and writes **no row**. The safe residue
of the *reverse* failure (insert fails after a successful put) would be an orphan object, not an orphan
row — preferred (a dangling row pointing at nothing is worse than an unreferenced object). Orphan-object
sweep is banked (CF-20.2). Harness 5c proves no row on a failed put.

## D-20.4 — One writer, file-presence branch

The existing `createVendorPhotoPlaceholder` writer is **extended**, not replaced: an optional `file`
param branches it — present → real upload (put + insert with `storage_key`/checksum/provider/size/mime,
audit `job_attachment.uploaded`); absent → the unchanged metadata-only placeholder insert (audit
`job_attachment.placeholder_created`). The writer name is unchanged (minor naming debt, accepted).

## D-20.5 — Serve reuses the vendor reader's gate verbatim

`getVendorAttachmentUrl` re-applies `listVendorAssignmentAttachments`'s gate exactly: the
assignment→tenant→vendor gate (`getAssignmentDetail` + `canActOnAssignment`) **and** the author-scope
row filter (`uploaded_by_user_id` ∈ the `vendor_users` subquery, tenant, `jobId`, non-archived). A
vendor can only presign an attachment within their own scope. **No new authorization logic was
invented** — the serve path is a strict subset of what the reader already permits.

## D-20.6 — 5-minute presigned URLs, issuance-scoped

Read URLs are presigned with a 300 s expiry, generated **per render** in the server component. The
authorization is enforced at **issuance** (the scope gate), not per-fetch — the URL is a short-lived
bearer token. Acceptable for a 5-minute window; not suitable for long-lived links (banked as a known
limitation).

## D-20.7 — Vendor-only serve; operator viewing deferred

Serve has **one caller** today: the vendor job-detail page. There is **no operator-side attachment
reader/gate** in the codebase (confirmed 4A) — building one (tenant-scope + operator permission gate,
not vendor author-scope) is net-new and deferred (CF-20.1). This phase does not invent an operator
viewing path.

## D-20.8 — `STORAGE_FORCE_FAIL` test hook over a writer-injection seam

To exercise the failed-put guard without real R2, a capture-only `STORAGE_FORCE_FAIL` env hook on
`CaptureStorageProvider.put()` forces `{ok:false}`. Chosen over adding a provider-injection parameter to
the writer (which would widen the production API for a test concern). The hook lives on the no-op capture
provider only and is unreachable in any production path (the factory returns `CaptureStorageProvider`
only when `STORAGE_CAPTURE=1` or no creds).

## D-20.9 — Capture-then-review preserved (the binding invariant)

Vendor photo uploads keep `visibility = 'internal_only'` (v1 §2.3) — they land in the aggregator first,
are **not** auto-client-visible. This is unchanged from the placeholder path; Phase 20 adds bytes, not a
new visibility path. (Operator visibility-promotion for attachments remains the FB-10l.2-extended
deferral; Phase 18 built note promotion, not attachment promotion.)
