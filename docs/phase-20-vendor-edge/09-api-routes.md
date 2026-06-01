# Phase 20 — API Routes / Server Actions

No new HTTP routes. Photo upload + presigned display run through the existing vendor job-detail page and
its server action.

## The storage seam (`src/lib/integrations/storage/`)

| Export | File | Role |
|---|---|---|
| `StorageProvider`, `PutRequest`, `PutResult`, `SignedUrlResult` | `provider.ts` | types-only interface: `put(req)` + `getSignedUrl(key, expiresInSeconds?)` |
| `R2Provider` | `r2-provider.ts` | live R2 via AWS S3 SDK; throws `R2_CREDENTIALS_MISSING` without the four `R2_*` vars |
| `CaptureStorageProvider`, `getCaptured`, `resetCaptured` | `capture-provider.ts` | in-memory no-op (harness); `STORAGE_FORCE_FAIL` test hook |
| `getStorageProvider()` | `index.ts` | factory: `STORAGE_CAPTURE=1` or no `R2_ACCESS_KEY_ID` → Capture; else R2 |

`PutResult = { ok:true; key; size; checksum } | { ok:false; error }`;
`SignedUrlResult = { ok:true; url; expiresInSeconds } | { ok:false; error }`.

## Server functions

| Function | File | Behavior | Throws |
|---|---|---|---|
| `createVendorPhotoPlaceholder({assignmentId, tenantId, vendorScope, actorUserId, title, file?})` | `src/server/vendor/create-vendor-photo-placeholder.ts` | scope-check → if `file`: put-before-insert (`storage_key`/checksum/provider/size/mime), audit `job_attachment.uploaded`; else placeholder insert + `placeholder_created` | `ASSIGNMENT_NOT_FOUND`, `VENDOR_SCOPE_MISMATCH`, `STORAGE_PUT_FAILED` |
| `getVendorAttachmentUrl({assignmentId, attachmentId, tenantId, vendorScope})` | `src/server/vendor/get-vendor-attachment-url.ts` | reuses the reader's gate; fetches `storage_key`; presigns (300 s) | — (soft 4-kind return) |
| `listVendorAssignmentAttachments(tenantId, assignmentId, vendorScope)` | `src/server/vendor/list-assignment-attachments.ts` (pre-existing) | author-scoped attachment list | — |

`getVendorAttachmentUrl` returns a discriminated union:
```ts
{ kind: "url"; url: string; expiresInSeconds: number }
| { kind: "placeholder" }     // storage_key NULL
| { kind: "unavailable" }     // presign failed
| { kind: "forbidden" }       // missing OR out-of-scope (identical — no existence leak)
```

## Server Action (`"use server"`)

| Action | File | Signature | Effect |
|---|---|---|---|
| `createVendorPhotoPlaceholderAction` | `src/app/(vendor)/vendor/jobs/photo-actions.ts` | `(assignmentId, _prev, formData)` → `{error?}` | `requireVendor`; reads `title` + optional `formData.get("file")` (validated: MIME allowlist + 15 MB); calls the writer; maps `STORAGE_PUT_FAILED`/`ASSIGNMENT_NOT_FOUND`/`VENDOR_SCOPE_MISMATCH`; `revalidatePath('/vendor/jobs/<id>')` |

The file arrives via React's server-action `FormData` serialization (multipart handled automatically when
a `File` field is present) — read as `formData.get("file") instanceof File`, bytes via `arrayBuffer()`.

## Env

`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` (live R2); `STORAGE_CAPTURE`
(force capture); `STORAGE_FORCE_FAIL` (test-only). See `04-admin-sop.md`.

## Harness alias (package.json)

| Script | Command |
|---|---|
| `db:check:vendor-edge` | `tsx --env-file=.env.local --conditions=react-server scripts/check-phase-20.ts` |
