# Phase 20 — Closeout

## Goal

Complete the vendor edge: give vendor photo "uploads" a **real object-storage backend** (Cloudflare R2
behind an S3-compatible `StorageProvider` seam, capture-by-default) with presigned read URLs, while
preserving the **capture-then-review** mapping (vendor photos land `internal_only`). On the second v2
migration (0043, additive).

## Completed deliverables

- **Storage seam** (`src/lib/integrations/storage/`): `StorageProvider` interface + `R2Provider` (live) +
  `CaptureStorageProvider` (harness) + `getStorageProvider()` factory (capture-by-default; R2 never built
  without creds).
- **Upload path:** the vendor photo action reads an optional file (MIME allowlist + 15 MB); the writer
  does put-before-insert, persisting `storage_key`/`checksum`/`storage_provider`/size/mime + auditing
  `job_attachment.uploaded`. No-file → unchanged placeholder.
- **Serve path:** `getVendorAttachmentUrl` reuses the vendor reader's gate verbatim, presigns a 5-min
  read URL; 4-kind discriminated return; no existence leak.
- **UI:** file input with mobile camera capture + presigned thumbnail display on the vendor job-detail.
- **Migration 0043:** `job_attachments` += `storage_key`/`checksum`/`storage_provider` (additive).
- A **17-assertion phase-blocking harness**, green on two clean runs.

## Files created / changed (commits `e025161` · `f0c3ee1` · `9460a9a` · `b26d962` · `52bd1ef`)

- `db/migrations/0043_robust_mentor.sql` + `job-details.ts` schema edit — migration unit (`e025161`).
- `src/lib/integrations/storage/{provider,capture-provider,r2-provider,index}.ts` + writer/action edits —
  storage seam + upload bytes (`f0c3ee1`); `capture-provider.ts` test hook landed with the harness.
- `src/server/vendor/get-vendor-attachment-url.ts` — presigned serve fn (`9460a9a`).
- `src/app/(vendor)/vendor/jobs/[id]/page.tsx` + `src/components/vendor/vendor-photo-placeholder-form.tsx`
  — UI (`b26d962`).
- `scripts/check-phase-20.ts` + `package.json` alias `db:check:vendor-edge` + the `STORAGE_FORCE_FAIL`
  hook — harness (`52bd1ef`).
- `docs/phase-20-vendor-edge/` — this closeout set.

## DB changes

**ONE migration (0043), additive.** `job_attachments` += `storage_key` / `checksum` / `storage_provider`
(all nullable). Table count 115; ledger 0043 (sandbox + prod). See `08-db-changes.md`.

## API routes / server actions added

No new HTTP routes. Writer `createVendorPhotoPlaceholder({…, file?})`; serve `getVendorAttachmentUrl`;
action `createVendorPhotoPlaceholderAction` (now reads a file); the `StorageProvider` seam. See
`09-api-routes.md`.

## User-facing workflows added

Vendor photo upload (mobile camera / file pick) + presigned thumbnail viewing. See `03-user-sop.md`,
`05-system-workflows.md`.

## Admin/internal workflows added

R2 go-live (the four `R2_*` env vars); capture-by-default; the `db:check:vendor-edge` harness; the
`job_attachment.uploaded` audit trail. See `04-admin-sop.md`.

## Business rules added

R-20.1…R-20.8, each mapped to a harness group. Phase 20 is **not** an autonomy phase — only the v1 §2.3
capture-then-review + tenant isolation + author-scope/no-leak invariants are affirmed. See
`06-business-rules.md`.

## Chatbot knowledge added

`07-chatbot-knowledge.md` — vendors upload real photos (object storage, signed URLs), internal-only,
vendor-scoped, operators can't view yet, capture-by-default until configured.

## Verification

```
pnpm run db:check:vendor-edge
→ passed: 17 / failed: 0  — PHASE-20 VENDOR-EDGE LEDGER GREEN ✓   (run twice, identical; idempotent)
```
Groups: upload happy path · placeholder path · cross-tenant isolation · author-scope + no-existence-leak ·
write-boundary (checksum + put-before-insert). `pnpm exec tsc --noEmit` → 0; `pnpm run lint` → 0 errors;
`pnpm run build` → clean.

## Known limitations

Operator viewing deferred (CF-20.1); presigned issuance-scoped 5-min window; orphan object on
insert-fail-after-put (CF-20.2; common put-fail writes no row); capture-by-default until R2 creds;
FB-10a.4 legacy backfill not done; `vendor_documents` could reuse the adapter. See `10-known-limitations.md`.

## Carry-forward items

**Retired this phase: FB-10a.4** — Real photo upload backend (storage + signed URLs + validation). Cite
Phase-10 (vendor-portal) as source-of-record; the legacy-placeholder backfill sub-clause was out of
scope (noted). **Explicitly NOT retired: CF-13.4** — the *email* attachment backend
(`email_attachments.storage_ref`), untouched by Phase 20; rolls forward open (its blocker partially
discharged by the reusable R2 seam). New: CF-20.1 (operator viewing), CF-20.2 (orphan sweep), CF-20.3
(roadmap §6/§9 CF-13.4 doc-correction). See `closeout-carryforwards.md`.

## Recommended next phase focus

**Phase 21 — Linkless Magic-Link Vendor Access + Outbound Delivery** (roadmap v2.4.0): let unregistered
vendors update a work order (incl. upload photos via this storage path) through a signed, single-
assignment-scoped token — the heaviest security surface in v2.
