# Phase 20 — System Workflows

## Workflow 20.A — Photo upload (real bytes)

```
vendor portal: VendorPhotoPlaceholderForm  (title + optional <input type=file name=file>)
        │   (mobile: accept=image/* capture=environment → camera)
createVendorPhotoPlaceholderAction(assignmentId, _prev, formData)  [requireVendor]
        │   title required (1–255)
        │   const fileRaw = formData.get("file")
        │   if File && size>0:
        │       MIME ∈ {jpeg,png,webp,heic,heif}  → else "Unsupported file type"
        │       size ≤ 15 MB                       → else "File too large"
        │       bytes = Buffer.from(await fileRaw.arrayBuffer())
        │
createVendorPhotoPlaceholder({ …, file? })
        │   getAssignmentDetail → ASSIGNMENT_NOT_FOUND ; canActOnAssignment → VENDOR_SCOPE_MISMATCH
        │   ── file present ──────────────────────────────────────────────
        │   attachmentId = uuidv7(); ext = MIME→ext
        │   key = tenant/<t>/job/<j>/attachment/<id>.<ext>
        │   provider = getStorageProvider()                 // capture-by-default
        │   put = await provider.put({ key, bytes, contentType })
        │   if !put.ok → throw STORAGE_PUT_FAILED            // NO row written
        │   INSERT job_attachments { storage_key=key, checksum=put.checksum,
        │                            storage_provider=provider.name, file_size_bytes=put.size,
        │                            file_mime_type=mime, file_url=NULL, visibility='internal_only' }
        │   audit job_attachment.uploaded { placeholder:false, size, mime, checksum, … }
        │   ── file absent ───────────────────────────────────────────────
        │   INSERT job_attachments { storage_key=NULL, file_*=NULL, visibility='internal_only' }
        │   audit job_attachment.placeholder_created { placeholder:true, … }
        │
revalidatePath(/vendor/jobs/<assignmentId>)
```
Put-before-insert: the row exists only if the bytes were stored. `visibility='internal_only'` on both
branches (capture-then-review).

## Workflow 20.B — Serve (presigned read)

```
vendor job-detail (Server Component) — per attachment, at render time:
getVendorAttachmentUrl({ assignmentId, attachmentId, tenantId, vendorScope })
        │   vendorScope empty / assignment missing / canActOnAssignment false → 'forbidden'
        │   SELECT storage_key FROM job_attachments
        │     WHERE id=attachmentId AND tenant=t AND job_id=assignment.jobId
        │       AND status<>'archived' AND uploaded_by_user_id ∈ vendor_users(scope)
        │   no row (missing OR out-of-scope) → 'forbidden'   (no existence leak)
        │   storage_key NULL → 'placeholder'
        │   getStorageProvider().getSignedUrl(storage_key, 300)
        │       ok    → 'url' (5-min presigned)
        │       !ok   → 'unavailable'
        │
render: url → thumbnail link · placeholder → "Placeholder" · unavailable → "Image unavailable" · forbidden → (row dropped)
```

## Workflow 20.C — Capture-by-default (no accidental upload)

```
no R2 creds (default) OR STORAGE_CAPTURE=1
        → getStorageProvider() = CaptureStorageProvider (stores in-memory, no network)
all four R2_* set AND STORAGE_CAPTURE!=1
        → getStorageProvider() = R2Provider (PutObject / presigned GetObject against R2)
```
The harness forces capture; production enables real R2 only when the four `R2_*` vars are deployed.
